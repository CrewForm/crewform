// SPDX-License-Identifier: AGPL-3.0-or-later
// Chat Widget Server — embeddable chat endpoint for CrewForm agents.
// External websites embed a <script> tag that talks to these endpoints.
// Mounts at /chat/* on the task runner HTTP server.

import type { IncomingMessage, ServerResponse } from 'http';
import { supabase } from './supabase';
import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import type { AgUiEvent } from './agUiEventBus';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function uuidv4(): string { return crypto.randomUUID(); }

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatWidgetConfig {
    id: string;
    workspace_id: string;
    agent_id: string;
    name: string;
    api_key: string;
    allowed_domains: string[];
    theme: Record<string, unknown>;
    welcome_message: string;
    placeholder_text: string;
    rate_limit_per_hour: number;
    is_active: boolean;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface ChatSession {
    id: string;
    widget_config_id: string;
    workspace_id: string;
    visitor_id: string;
    messages: ChatMessage[];
}

// ─── In-memory Rate Limiter ─────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(visitorKey: string, maxPerHour: number): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(visitorKey);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(visitorKey, { count: 1, resetAt: now + 3_600_000 });
        return true;
    }

    if (entry.count >= maxPerHour) return false;

    entry.count++;
    return true;
}

// Clean up stale entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(key);
    }
}, 600_000);

// ─── Auth ───────────────────────────────────────────────────────────────────

async function authenticateChatRequest(
    req: IncomingMessage,
): Promise<ChatWidgetConfig | null> {
    // Accept API key from Authorization header or x-api-key header
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else if (apiKeyHeader) {
        token = apiKeyHeader;
    }

    if (!token?.startsWith('cf_chat_')) return null;

    const { data } = await supabase
        .from('chat_widget_configs')
        .select('*')
        .eq('api_key', token)
        .eq('is_active', true)
        .single();

    if (!data) return null;

    return data as ChatWidgetConfig;
}

function checkOrigin(req: IncomingMessage, allowedDomains: string[]): boolean {
    // If no domains configured, allow all (for development / initial setup)
    if (!allowedDomains || allowedDomains.length === 0) return true;

    const origin = req.headers.origin ?? req.headers.referer ?? '';
    if (!origin) return true; // No origin header (e.g., server-to-server)

    try {
        const hostname = new URL(origin).hostname;
        return allowedDomains.some(domain => {
            // Support wildcard subdomains: *.example.com
            if (domain.startsWith('*.')) {
                const base = domain.slice(2);
                return hostname === base || hostname.endsWith(`.${base}`);
            }
            return hostname === domain || hostname === `www.${domain}`;
        });
    } catch {
        return false;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function sendJson(res: ServerResponse, status: number, data: unknown, origin?: string) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin ?? '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Visitor-Id',
        'Access-Control-Allow-Credentials': 'true',
    });
    res.end(JSON.stringify(data));
}

// ─── Session Management ─────────────────────────────────────────────────────

async function getOrCreateSession(
    config: ChatWidgetConfig,
    visitorId: string,
): Promise<ChatSession> {
    // Try to find existing session
    const { data: existing } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('widget_config_id', config.id)
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existing) return existing as ChatSession;

    // Create new session
    const sessionId = uuidv4();
    const { data: created, error } = await supabase
        .from('chat_sessions')
        .insert({
            id: sessionId,
            widget_config_id: config.id,
            workspace_id: config.workspace_id,
            visitor_id: visitorId,
            messages: [],
            metadata: {},
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return created as ChatSession;
}

async function appendMessages(
    sessionId: string,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
): Promise<void> {
    // Fetch current messages
    const { data: session } = await supabase
        .from('chat_sessions')
        .select('messages')
        .eq('id', sessionId)
        .single();

    const currentMessages = ((session as { messages: ChatMessage[] } | null)?.messages ?? []) as ChatMessage[];
    const updatedMessages = [...currentMessages, userMessage, assistantMessage];

    await supabase
        .from('chat_sessions')
        .update({ messages: updatedMessages })
        .eq('id', sessionId);
}

// ─── Build Conversation Context ─────────────────────────────────────────────

function buildConversationContext(messages: ChatMessage[], maxMessages = 10): string {
    const recent = messages.slice(-maxMessages);
    if (recent.length === 0) return '';

    const formatted = recent.map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n\n');

    return `\n\n## Conversation History\nThe following is the recent conversation with this visitor. Continue the conversation naturally.\n\n${formatted}\n\n---\nUser's new message follows:`;
}

// ─── Wait for task completion (with streaming support) ──────────────────────

async function waitForTaskResult(taskId: string, timeoutMs = 120_000): Promise<string> {
    const start = Date.now();
    const pollInterval = 1500;

    while (Date.now() - start < timeoutMs) {
        const { data } = await supabase
            .from('tasks')
            .select('status, result, error')
            .eq('id', taskId)
            .single();

        if (!data) break;

        const task = data as { status: string; result: string | null; error: string | null };

        if (task.status === 'completed') {
            return task.result ?? '';
        }

        if (task.status === 'failed') {
            throw new Error(task.error ?? 'Agent failed to respond');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Response timed out');
}

// ─── Endpoint Handlers ──────────────────────────────────────────────────────

/** GET /chat/config — Returns widget configuration for the embed script */
async function handleGetConfig(
    _req: IncomingMessage,
    res: ServerResponse,
    config: ChatWidgetConfig,
) {
    // Fetch agent name for display
    const { data: agent } = await supabase
        .from('agents')
        .select('name, description')
        .eq('id', config.agent_id)
        .single();

    const agentInfo = agent as { name: string; description: string } | null;

    sendJson(res, 200, {
        widgetId: config.id,
        agentName: agentInfo?.name ?? 'Assistant',
        agentDescription: agentInfo?.description ?? '',
        welcomeMessage: config.welcome_message,
        placeholderText: config.placeholder_text,
        theme: config.theme,
    });
}

/** POST /chat/message — Send a message and stream response via SSE */
async function handleSendMessage(
    req: IncomingMessage,
    res: ServerResponse,
    config: ChatWidgetConfig,
) {
    // Parse body
    let body: { message: string; visitorId: string };
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as typeof body;
    } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
    }

    if (!body.message?.trim()) {
        sendJson(res, 400, { error: 'Message is required' });
        return;
    }

    if (!body.visitorId) {
        sendJson(res, 400, { error: 'visitorId is required' });
        return;
    }

    // Rate limit check
    const rateLimitKey = `${config.id}:${body.visitorId}`;
    if (!checkRateLimit(rateLimitKey, config.rate_limit_per_hour)) {
        sendJson(res, 429, {
            error: 'Rate limit exceeded. Please try again later.',
            retryAfterSeconds: 60,
        });
        return;
    }

    // Get or create session
    const session = await getOrCreateSession(config, body.visitorId);

    // Build conversation context from history
    const conversationContext = buildConversationContext(session.messages as ChatMessage[]);

    // Create task for the agent
    const taskId = uuidv4();
    const taskDescription = conversationContext
        ? `${conversationContext}\n\n${body.message}`
        : body.message;

    const { error: insertError } = await supabase
        .from('tasks')
        .insert({
            id: taskId,
            workspace_id: config.workspace_id,
            title: `Chat: ${body.message.substring(0, 80)}`,
            description: taskDescription,
            status: 'dispatched',
            priority: 'medium',
            assigned_agent_id: config.agent_id,
            created_by: '00000000-0000-0000-0000-000000000000', // system user
            metadata: {
                source: 'chat-widget',
                widget_config_id: config.id,
                session_id: session.id,
                visitor_id: body.visitorId,
            },
        });

    if (insertError) {
        console.error(`[Chat Widget] Failed to create task: ${insertError.message}`);
        sendJson(res, 500, { error: 'Failed to process message' });
        return;
    }

    // Set up SSE response for streaming
    const origin = req.headers.origin ?? '*';
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'X-Accel-Buffering': 'no',
    });

    res.write(':ok\n\n');

    // Subscribe to AG-UI events for this task
    const stream = agUiEventBus.subscribe(taskId);
    let disconnected = false;
    let fullResponse = '';

    req.on('close', () => { disconnected = true; });

    try {
        for await (const event of stream) {
            if (disconnected) break;

            // Map AG-UI events to simple chat events
            if (event.type === AgUiEventType.TEXT_MESSAGE_CONTENT) {
                const delta = (event as AgUiEvent & { delta?: string }).delta ?? '';
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
            } else if (event.type === AgUiEventType.RUN_FINISHED) {
                // If we got no streaming content, fetch the result from DB
                if (!fullResponse) {
                    try {
                        fullResponse = await waitForTaskResult(taskId, 5000);
                    } catch {
                        // Best effort — use whatever we have
                    }
                }

                res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse })}\n\n`);
                break;
            } else if (event.type === AgUiEventType.RUN_ERROR) {
                const errorMsg = (event as AgUiEvent & { error?: string }).error ?? 'Something went wrong';
                res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
                break;
            }
        }
    } catch {
        // Stream ended or client disconnected — clean exit
    }

    // If no streaming events were received (provider doesn't stream), poll for result
    if (!fullResponse && !disconnected) {
        try {
            fullResponse = await waitForTaskResult(taskId, 120_000);
            res.write(`data: ${JSON.stringify({ type: 'done', content: fullResponse })}\n\n`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Response timed out';
            res.write(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`);
        }
    }

    // Save messages to session
    if (fullResponse) {
        const userMsg: ChatMessage = { role: 'user', content: body.message, timestamp: Date.now() };
        const assistantMsg: ChatMessage = { role: 'assistant', content: fullResponse, timestamp: Date.now() };
        void appendMessages(session.id, userMsg, assistantMsg);
    }

    res.end();
}

/** GET /chat/history — Retrieve message history for a session */
async function handleGetHistory(
    req: IncomingMessage,
    res: ServerResponse,
    config: ChatWidgetConfig,
) {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const visitorId = url.searchParams.get('visitorId');

    if (!visitorId) {
        sendJson(res, 400, { error: 'visitorId query param is required' });
        return;
    }

    const { data: session } = await supabase
        .from('chat_sessions')
        .select('messages')
        .eq('widget_config_id', config.id)
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    const messages = ((session as { messages: ChatMessage[] } | null)?.messages ?? []) as ChatMessage[];

    sendJson(res, 200, { messages });
}

// ─── Widget JS Serving ──────────────────────────────────────────────────────

let cachedWidgetJs: string | null = null;

function serveWidgetJs(res: ServerResponse) {
    if (!cachedWidgetJs) {
        // Try to read the built widget file
        const widgetPath = path.resolve(__dirname, '../../chat-widget/dist/crewform-chat.js');
        try {
            cachedWidgetJs = fs.readFileSync(widgetPath, 'utf-8');
        } catch {
            // Fallback: return a minimal loader that tells the dev to build the widget
            cachedWidgetJs = '/* CrewForm Chat Widget not built. Run: cd chat-widget && npm run build */\nconsole.warn("CrewForm Chat Widget: bundle not found. Run `cd chat-widget && npm run build`.");';
        }
    }

    res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
    });
    res.end(cachedWidgetJs);
}

// ─── Main Request Handler ───────────────────────────────────────────────────

/**
 * Handle chat widget requests.
 * Routes:
 *   GET  /chat/widget.js     — Serve the embeddable widget JavaScript
 *   GET  /chat/config        — Widget configuration
 *   POST /chat/message       — Send message (SSE streaming response)
 *   GET  /chat/history       — Message history
 *   OPTIONS /chat/*          — CORS preflight
 *
 * Returns true if the request was handled, false otherwise.
 */
export async function handleChatRequest(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    const url = req.url ?? '';

    if (!url.startsWith('/chat/')) return false;

    // Serve widget JS (no auth required)
    if (req.method === 'GET' && (url === '/chat/widget.js' || url === '/chat/widget.min.js')) {
        serveWidgetJs(res);
        return true;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': req.headers.origin ?? '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Visitor-Id',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return true;
    }

    // All other endpoints require auth
    const config = await authenticateChatRequest(req);
    if (!config) {
        sendJson(res, 401, { error: 'Invalid or missing chat widget API key' });
        return true;
    }

    // Check domain restriction
    if (!checkOrigin(req, config.allowed_domains)) {
        sendJson(res, 403, { error: 'Origin not allowed for this widget' });
        return true;
    }

    // Route to handler
    const cleanUrl = url.split('?')[0]; // Remove query params for matching

    if (req.method === 'GET' && cleanUrl === '/chat/config') {
        await handleGetConfig(req, res, config);
        return true;
    }

    if (req.method === 'POST' && cleanUrl === '/chat/message') {
        await handleSendMessage(req, res, config);
        return true;
    }

    if (req.method === 'GET' && cleanUrl === '/chat/history') {
        await handleGetHistory(req, res, config);
        return true;
    }

    return false;
}
