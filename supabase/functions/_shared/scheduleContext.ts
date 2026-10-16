// SPDX-License-Identifier: MIT
type Row = Record<string, unknown>;
type Loader = (table: 'tasks' | 'delegations' | 'usage_records', columns: string, start: string, end: string) => Promise<Row[]>;
export function renderScheduleTemplate(template: string, now = new Date()): string {
    return template.replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
        .replace(/\{\{time\}\}/g, now.toISOString().slice(11,19)).replace(/\{\{datetime\}\}/g, now.toISOString());
}
/** Hosts supply a workspace-scoped loader, bounded to 1001 rows per section. */
export async function buildScheduleContext(options: string[], load: Loader, now = new Date()): Promise<string> {
    const start = new Date(now); start.setUTCHours(0,0,0,0); start.setUTCDate(start.getUTCDate()-1);
    const end = new Date(start); end.setUTCDate(end.getUTCDate()+1);
    const sections: string[] = [];
    for (const option of new Set(options)) {
        const table = option === 'task_summary' ? 'tasks' : option === 'team_activity' ? 'delegations' : option === 'agent_usage' ? 'usage_records' : null;
        if (!table) throw new Error('Unsupported schedule context option.');
        const columns = table === 'tasks' ? 'title,status' : table === 'delegations' ? 'status' : 'agent_id,tokens_used,cost_usd,metadata';
        const loaded = await load(table, columns, start.toISOString(), end.toISOString());
        const rows = loaded.slice(0,1000);
        const sampled = loaded.length > 1000 ? ' (latest 1000 records; totals are a sample)' : '';
        const count = (status: string) => rows.filter(row => row.status === status).length;
        if (table === 'tasks') sections.push(`## Task Summary (Yesterday, UTC)${sampled}\nTotal: ${rows.length} | Completed: ${count('completed')} | Failed: ${count('failed')} | Pending: ${count('pending')+count('dispatched')}\n` +
            rows.slice(0,20).map(row => `- [${String(row.status).toUpperCase()}] ${String(row.title).slice(0,2000)}`).join('\n'));
        else if (table === 'delegations') sections.push(`## Team Activity (Yesterday, UTC)${sampled}\nTotal delegations: ${rows.length} | Accepted: ${count('accepted')} | Revised: ${count('revised')} | Pending: ${count('pending')}\n`);
        else {
            const usageKnown = (row: Row) => (row.metadata as {usage_known?: unknown} | null)?.usage_known !== false;
            const tokens = rows.filter(usageKnown).reduce((sum,row) => sum+(typeof row.tokens_used === 'number' ? row.tokens_used : 0),0);
            const cost = rows.reduce((sum,row) => sum+(typeof row.cost_usd === 'number' ? row.cost_usd : 0),0);
            const unknown = rows.filter(row => !usageKnown(row) || row.cost_usd === null).length;
            sections.push(`## Agent Usage (Yesterday, UTC)${sampled}\nExecutions: ${rows.length} | Agents used: ${new Set(rows.map(row=>row.agent_id).filter(Boolean)).size} | Reported tokens: ${tokens} | Reported cost: $${cost.toFixed(4)}\nUnknown usage/cost records: ${unknown}. Reported amounts exclude unreported native usage.\n`);
        }
    }
    return sections.length ? `\n\n---\n\n# Workspace Data Context\n\n${sections.join('\n')}` : '';
}
