// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { describe, it, expect, vi } from 'vitest';

const insert = vi.hoisted(() => vi.fn().mockResolvedValue({error: null}));

// Mock supabase to avoid env dependency in unit tests
vi.mock('./supabase', () => ({
    supabase: {from: () => ({insert})},
}));

import { detectBillingModel, writeTaskUsageRecord } from './usageWriter';

describe('detectBillingModel', () => {
    it('returns per-token for OpenAI', () => {
        expect(detectBillingModel('openai')).toBe('per-token');
    });

    it('returns per-token for Anthropic', () => {
        expect(detectBillingModel('anthropic')).toBe('per-token');
    });

    it('returns per-token for Google', () => {
        expect(detectBillingModel('google')).toBe('per-token');
    });

    it('returns per-token for case-insensitive input', () => {
        expect(detectBillingModel('OpenAI')).toBe('per-token');
        expect(detectBillingModel('ANTHROPIC')).toBe('per-token');
        expect(detectBillingModel('Groq')).toBe('per-token');
    });

    it('returns subscription-quota for Ollama', () => {
        expect(detectBillingModel('ollama')).toBe('subscription-quota');
    });

    it('returns subscription-quota for Ollama (case-insensitive)', () => {
        expect(detectBillingModel('Ollama')).toBe('subscription-quota');
    });

    it('returns unknown for unrecognized providers', () => {
        expect(detectBillingModel('some-custom-provider')).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
        expect(detectBillingModel('')).toBe('unknown');
    });

    it('returns per-token for all known per-token providers', () => {
        const perTokenProviders = ['anthropic', 'openai', 'google', 'mistral', 'groq', 'cohere', 'openrouter'];
        for (const provider of perTokenProviders) {
            expect(detectBillingModel(provider)).toBe('per-token');
        }
    });
});

describe('native accounting', () => {
    it('stores unknown native cost as null rather than a measured zero', async () => {
        await writeTaskUsageRecord({workspaceId: 'workspace', taskId: 'task', agentId: 'agent', provider: 'native-codex', model: 'default', tokensUsed: 0, costEstimateUsd: 0});
        expect(insert).toHaveBeenLastCalledWith(expect.objectContaining({cost_usd: null, metadata: expect.objectContaining({usage_known: false, cost_known: false, billing_model: 'unknown'})}));
    });
});
