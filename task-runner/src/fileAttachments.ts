// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * File attachment helpers for the task runner.
 *
 * fileReader  — loads input attachments and converts them to LLM-friendly
 *               content (text injection or multimodal base64).
 * fileWriter  — scans LLM output for fenced code blocks marked with
 *               filenames and uploads them as output attachments.
 */

import { supabase } from './supabase';

const BUCKET = 'attachments';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileAttachmentRecord {
    id: string;
    workspace_id: string;
    task_id: string | null;
    team_run_id: string | null;
    direction: 'input' | 'output';
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
}

export interface FileContent {
    fileName: string;
    mimeType: string;
    /** For text files: the file's text content */
    textContent?: string;
    /** For images: base64-encoded data */
    base64Content?: string;
}

export interface OutputFileAttachment {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
}

// ─── Multimodal support ─────────────────────────────────────────────────────

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_TYPES = new Set([
    'text/plain', 'text/csv', 'text/markdown', 'text/html',
    'application/json',
]);

const MULTIMODAL_MODELS_RE = /gpt-4o|gpt-4-turbo|claude-3|claude-4|gemini/i;

export function supportsImages(model: string): boolean {
    return MULTIMODAL_MODELS_RE.test(model);
}

// ─── File Reader ────────────────────────────────────────────────────────────

/**
 * Load input attachments for a task or team run and return their contents
 * in LLM-friendly formats.
 */
export async function loadInputFiles(
    taskId: string | null,
    teamRunId: string | null,
    workspaceId: string,
): Promise<FileContent[]> {
    // Query file_attachments where direction = 'input'
    let query = supabase
        .from('file_attachments')
        .select('*')
        .eq('direction', 'input')
        .eq('workspace_id', workspaceId)
        .limit(6);

    if (taskId) {
        query = query.eq('task_id', taskId);
    } else if (teamRunId) {
        query = query.eq('team_run_id', teamRunId);
    } else {
        return [];
    }

    const { data: records, error } = await query;
    if (error) throw new Error('Input attachment lookup failed');
    if (!records || records.length === 0) return [];

    if (records.length > 5) throw new Error('Too many input attachments');
    const contents: FileContent[] = [];

    for (const record of records as FileAttachmentRecord[]) {
        if (record.workspace_id !== workspaceId || !record.storage_path.startsWith(`${workspaceId}/${taskId ?? teamRunId}/input/`) || record.storage_path.split('/').some(part => part === '..' || part === '.') || record.file_size < 0 || record.file_size > 10 * 1024 * 1024) throw new Error('Invalid input attachment scope or size');
        try {
            const { data: blob, error: dlError } = await supabase.storage
                .from(BUCKET)
                .download(record.storage_path);

            if (dlError || !blob) {
                throw new Error('Required input attachment download failed');
            }

            if (blob.size > 10 * 1024 * 1024) throw new Error('Attachment exceeds size limit');
            if (TEXT_TYPES.has(record.file_type)) {
                // Text file: read as string
                const text = await blob.text();
                contents.push({
                    fileName: record.file_name,
                    mimeType: record.file_type,
                    textContent: text,
                });
            } else if (IMAGE_TYPES.has(record.file_type)) {
                // Image file: convert to base64
                const buffer = await blob.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                contents.push({
                    fileName: record.file_name,
                    mimeType: record.file_type,
                    base64Content: base64,
                });
            } else if (record.file_type === 'application/pdf') {
                // PDF: extract raw text (fallback — real PDF parsing would need a library)
                const text = await blob.text();
                const cleanText = text.length > 0
                    ? `[PDF content — raw extraction may contain artifacts]\n${text.substring(0, 50000)}`
                    : `[PDF file: ${record.file_name} — could not extract text]`;
                contents.push({
                    fileName: record.file_name,
                    mimeType: record.file_type,
                    textContent: cleanText,
                });
            } else {
                // Unsupported type: just mention it
                contents.push({
                    fileName: record.file_name,
                    mimeType: record.file_type,
                    textContent: `[File attached: ${record.file_name} (${record.file_type}) — not readable by the model]`,
                });
            }
        } catch (err: unknown) {
            throw new Error(`Required input attachment could not be loaded: ${err instanceof Error ? err.message : 'invalid input'}`);
        }
    }

    return contents;
}

/**
 * Build a prompt section from loaded file contents.
 * Injects text files as tagged blocks. Images are returned separately for
 * multimodal models.
 */
export function buildFileContext(
    files: FileContent[],
    model: string,
): { textBlock: string; imageContents: Array<{ mimeType: string; base64: string }> } {
    if (files.length === 0) return { textBlock: '', imageContents: [] };

    const textParts: string[] = [];
    const imageContents: Array<{ mimeType: string; base64: string }> = [];
    const modelSupportsImages = supportsImages(model);

    textParts.push('\n--- Attached Files ---');

    for (const file of files) {
        if (file.textContent) {
            textParts.push(`\n<file name="${file.fileName}" type="${file.mimeType}">\n${file.textContent}\n</file>`);
        } else if (file.base64Content && modelSupportsImages) {
            imageContents.push({ mimeType: file.mimeType, base64: file.base64Content });
            textParts.push(`\n[Image attached: ${file.fileName}]`);
        } else if (file.base64Content) {
            textParts.push(`\n[Image attached: ${file.fileName} — this model does not support image inputs]`);
        }
    }

    return { textBlock: textParts.join('\n'), imageContents };
}

// ─── File Writer ────────────────────────────────────────────────────────────

/**
 * Regex to detect fenced code blocks with a filename marker:
 *   ```csv filename="data.csv"
 *   ...content...
 *   ```
 * Also supports:
 *   ```json file="output.json"
 *   ```filename="report.md"
 */
const FILE_BLOCK_RE = /```\w*\s+(?:file(?:name)?=")([^"]+)"\s*\n([\s\S]*?)```/g;

/**
 * Scan LLM output for file artifacts and upload them to Supabase Storage.
 * Returns the list of created attachment records.
 */
export async function extractAndSaveArtifacts(
    workspaceId: string,
    taskId: string | null,
    teamRunId: string | null,
    output: string,
): Promise<OutputFileAttachment[]> {
    const saved: OutputFileAttachment[] = [];
    const matches = [...output.matchAll(FILE_BLOCK_RE)];

    if (matches.length === 0) return saved;

    for (const match of matches) {
        const fileName = match[1];
        const content = match[2];
        if (!fileName || !content) continue;

        try {
            const mimeType = guessMimeType(fileName);
            const blob = new Blob([content.trim()], { type: mimeType });
            const parentId = taskId ?? teamRunId ?? 'unknown';
            const timestamp = Date.now();
            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `${workspaceId}/${parentId}/output/${timestamp}_${safeName}`;

            // Upload to storage
            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(storagePath, blob, {
                    contentType: mimeType,
                    upsert: false,
                });

            if (uploadError) {
                console.error(`[FileWriter] Upload failed for ${fileName}:`, uploadError.message);
                continue;
            }

            // Insert DB record
            const { data, error: dbError } = await supabase
                .from('file_attachments')
                .insert({
                    workspace_id: workspaceId,
                    task_id: taskId,
                    team_run_id: teamRunId,
                    direction: 'output',
                    file_name: fileName,
                    file_type: mimeType,
                    file_size: blob.size,
                    storage_path: storagePath,
                    created_by: null, // system-generated
                })
                .select()
                .single();

            if (dbError) {
                console.error(`[FileWriter] DB insert failed for ${fileName}:`, dbError.message);
                // Cleanup uploaded file
                await supabase.storage.from(BUCKET).remove([storagePath]);
                continue;
            }

            const record = data as FileAttachmentRecord;
            saved.push({
                id: record.id,
                file_name: record.file_name,
                file_type: record.file_type,
                file_size: record.file_size,
                storage_path: record.storage_path,
            });

            console.log(`[FileWriter] Saved output artifact: ${fileName} (${blob.size} bytes)`);
        } catch (err: unknown) {
            console.error(`[FileWriter] Error saving ${fileName}:`, err instanceof Error ? err.message : String(err));
        }
    }

    return saved;
}

function guessMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'csv': return 'text/csv';
        case 'json': return 'application/json';
        case 'md': return 'text/markdown';
        case 'txt': return 'text/plain';
        case 'html': return 'text/html';
        case 'xml': return 'application/xml';
        case 'py': return 'text/plain';
        case 'js':
        case 'ts': return 'text/plain';
        case 'yaml':
        case 'yml': return 'text/yaml';
        default: return 'text/plain';
    }
}
