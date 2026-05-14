// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// apiClient.ts — HTTP client for the CrewForm REST API.
// Used by: crewform login, crewform agents, crewform teams, crewform pull, crewform run --remote

import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

// ─── Config File ─────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.crewform');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** Default API base URL (CrewForm Cloud) */
const DEFAULT_API_URL = 'https://api.crewform.tech';

export interface CliConfig {
    /** REST API key (from CrewForm dashboard → Settings → API Keys) */
    api_key: string;
    /** API base URL (override for self-hosted) */
    api_url: string;
}

/** Load saved CLI config from ~/.crewform/config.json */
export function loadConfig(): CliConfig | null {
    if (!existsSync(CONFIG_FILE)) return null;
    try {
        const raw = readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(raw) as CliConfig;
    } catch {
        return null;
    }
}

/** Save CLI config to ~/.crewform/config.json */
export function saveConfig(config: CliConfig): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** Delete the saved CLI config */
export function deleteConfig(): boolean {
    if (!existsSync(CONFIG_FILE)) return false;
    unlinkSync(CONFIG_FILE);
    return true;
}

/** Get the config file path for display */
export function getConfigPath(): string {
    return CONFIG_FILE;
}

// ─── API Client ──────────────────────────────────────────────────────────────

export interface ApiClientOptions {
    apiKey?: string;
    apiUrl?: string;
}

export class ApiClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(opts?: ApiClientOptions) {
        // Priority: explicit opts → env var → saved config
        const config = loadConfig();
        this.apiKey = opts?.apiKey
            ?? process.env.CREWFORM_API_KEY
            ?? config?.api_key
            ?? '';
        this.baseUrl = (opts?.apiUrl
            ?? process.env.CREWFORM_API_URL
            ?? config?.api_url
            ?? DEFAULT_API_URL
        ).replace(/\/+$/, '');
    }

    get isAuthenticated(): boolean {
        return this.apiKey.length > 0;
    }

    private async request<T>(
        endpoint: string,
        method: string = 'GET',
        body?: unknown,
        params?: Record<string, string>,
    ): Promise<T> {
        if (!this.isAuthenticated) {
            throw new Error(
                'Not authenticated. Run `crewform login` or set CREWFORM_API_KEY.',
            );
        }

        const url = new URL(`${this.baseUrl}/functions/v1/${endpoint}`);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                url.searchParams.set(key, value);
            }
        }

        const headers: Record<string, string> = {
            'X-API-Key': this.apiKey,
            'X-API-Version': '2',
            'Content-Type': 'application/json',
        };

        const response = await fetch(url.toString(), {
            method,
            headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            let errorMsg = `HTTP ${response.status} ${response.statusText}`;
            try {
                const errorBody = await response.json() as { error?: string; message?: string };
                if (errorBody.error) errorMsg = errorBody.error;
                else if (errorBody.message) errorMsg = errorBody.message;
            } catch { /* ignore parse errors */ }
            throw new Error(errorMsg);
        }

        return await response.json() as T;
    }

    // ─── Identity ────────────────────────────────────────────────────────

    async whoami(): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        workspace_id: string;
        workspace_name: string;
        plan: string;
    }> {
        return this.request('api-me');
    }

    // ─── Agents ──────────────────────────────────────────────────────────

    async listAgents(limit: number = 50, cursor?: string): Promise<{
        items: Array<Record<string, unknown>>;
        next_cursor: string | null;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor) params.cursor = cursor;
        return this.request('api-agents', 'GET', undefined, params);
    }

    async getAgent(id: string): Promise<Record<string, unknown>> {
        return this.request('api-agents', 'GET', undefined, { id });
    }

    // ─── Teams ───────────────────────────────────────────────────────────

    async listTeams(limit: number = 50, cursor?: string): Promise<{
        items: Array<Record<string, unknown>>;
        next_cursor: string | null;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { limit: String(limit) };
        if (cursor) params.cursor = cursor;
        return this.request('api-teams', 'GET', undefined, params);
    }

    async getTeam(id: string): Promise<Record<string, unknown>> {
        return this.request('api-teams', 'GET', undefined, { id });
    }

    // ─── Tasks ───────────────────────────────────────────────────────────

    async createTask(data: {
        title: string;
        description: string;
        priority?: string;
        assigned_agent_id?: string;
        assigned_team_id?: string;
    }): Promise<Record<string, unknown>> {
        return this.request('api-tasks', 'POST', data);
    }

    async getTask(id: string): Promise<Record<string, unknown>> {
        return this.request('api-tasks', 'GET', undefined, { id });
    }

    async listTasks(limit: number = 50, status?: string, cursor?: string): Promise<{
        items: Array<Record<string, unknown>>;
        next_cursor: string | null;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { limit: String(limit) };
        if (status) params.status = status;
        if (cursor) params.cursor = cursor;
        return this.request('api-tasks', 'GET', undefined, params);
    }

    // ─── Runs ────────────────────────────────────────────────────────────

    async createRun(teamId: string, inputTask: string): Promise<Record<string, unknown>> {
        return this.request('api-runs', 'POST', { team_id: teamId, input_task: inputTask });
    }

    async getRun(id: string): Promise<Record<string, unknown>> {
        return this.request('api-runs', 'GET', undefined, { id });
    }

    async listRuns(teamId?: string, limit: number = 50, cursor?: string): Promise<{
        items: Array<Record<string, unknown>>;
        next_cursor: string | null;
        has_more: boolean;
    }> {
        const params: Record<string, string> = { limit: String(limit) };
        if (teamId) params.team_id = teamId;
        if (cursor) params.cursor = cursor;
        return this.request('api-runs', 'GET', undefined, params);
    }

    /**
     * Poll a run until it reaches a terminal state (completed/failed).
     * Returns the final run data.
     */
    async waitForRun(
        runId: string,
        onPoll?: (status: string, elapsed: number) => void,
        timeoutMs: number = 300000, // 5 minutes
    ): Promise<Record<string, unknown>> {
        const start = Date.now();
        const POLL_INTERVAL = 2000;

        while (Date.now() - start < timeoutMs) {
            const run = await this.getRun(runId);
            const status = run.status as string;
            const elapsed = Math.round((Date.now() - start) / 1000);

            if (onPoll) onPoll(status, elapsed);

            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                return run;
            }

            await new Promise(r => setTimeout(r, POLL_INTERVAL));
        }

        throw new Error(`Run ${runId} timed out after ${timeoutMs / 1000}s`);
    }
}
