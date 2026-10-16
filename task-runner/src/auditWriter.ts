// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { supabase } from './supabase';

/**
 * Write a team run audit log entry (fire-and-forget).
 * Uses the task-runner's admin Supabase client.
 */
export async function writeTeamRunAudit(
    workspaceId: string,
    createdBy: string,
    action: 'team_run_started' | 'team_run_completed' | 'team_run_failed',
    details: Record<string, unknown> = {},
): Promise<void> {
    try {
        await supabase.from('audit_log').insert({
            workspace_id: workspaceId,
            user_id: createdBy,
            action,
            details,
        });
    } catch {
        // Audit failures should never block execution
        console.warn(`[AuditWriter] Failed to write ${action} audit entry`);
    }
}
