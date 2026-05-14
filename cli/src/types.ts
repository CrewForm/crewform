// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// types.ts — Shared types for the CLI tool.

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costEstimateUSD: number;
}

export interface ToolCallLog {
    tool: string;
    arguments: Record<string, unknown>;
    result: string;
    success: boolean;
    duration_ms: number;
}

export interface ExecutionResult {
    result: string;
    usage: TokenUsage;
    toolCallLogs: ToolCallLog[];
}
