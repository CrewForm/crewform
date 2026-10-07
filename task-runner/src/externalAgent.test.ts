// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    consent: vi.fn(), single: vi.fn(), execute: vi.fn(), eq: vi.fn(),
}));
vi.mock('./supabase', () => ({supabase: {rpc: mocks.consent, from: () => ({select: () => ({eq: mocks.eq})})}}));
vi.mock('@crewformhq/agent-runtime', () => ({executeExternal: mocks.execute}));
import { executeLocalAgent } from './externalAgent';
const execution = {kind: 'external', agent: 'codex', transport: 'cli'} as const;
const input = {workspaceId: 'workspace', agentId:'agent',agentSnapshot:{}, taskId: 'task', model: 'default', systemPrompt: 'system', userPrompt: 'prompt'};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.consent.mockResolvedValue({data:true,error:null});
    mocks.eq.mockReturnValue({eq: mocks.eq, single: mocks.single});
    mocks.single.mockResolvedValue({data: {status: 'running', created_by: 'owner', actor_type: 'user'}, error: null});
    mocks.execute.mockResolvedValue({result: 'done', usage: {usageKnown: false}, toolCallLogs: []});
});
afterEach(() => vi.unstubAllEnvs());
function configure() {
    vi.stubEnv('CREWFORM_EXTERNAL_AGENTS_ENABLED', 'true');
    vi.stubEnv('CREWFORM_EXTERNAL_WORKSPACE_ID', 'workspace');
    vi.stubEnv('CREWFORM_EXTERNAL_USER_ID', 'owner');
    vi.stubEnv('CREWFORM_EXTERNAL_CWD', '/trusted/project');
}
describe('trusted native runner boundary', () => {
    it('requires explicit enablement and exact workspace configuration before spawning', async () => {
        vi.stubEnv('CREWFORM_EXTERNAL_AGENTS_ENABLED', 'false');
        await expect(executeLocalAgent(execution, input)).rejects.toThrow('trusted runner');
        configure();
        await expect(executeLocalAgent(execution, {...input, workspaceId: 'another-workspace'})).rejects.toThrow('trusted runner');
        expect(mocks.execute).not.toHaveBeenCalled();
    });
    it('refuses another member’s task even in the configured workspace', async () => {
        configure();
        mocks.single.mockResolvedValue({data: {status: 'running', created_by: 'other-member', actor_type: 'user'}, error: null});
        mocks.execute.mockImplementation(async (_execution, invocation) => {
            if (invocation.signal.aborted) throw new Error('External execution cancelled.');
            return {result: 'unexpected'};
        });
        await expect(executeLocalAgent(execution, input)).rejects.toThrow('cancelled');
        expect(mocks.execute).not.toHaveBeenCalled();
    });
    it('rejects workspace API keys and system jobs attributed to the owner', async () => {
        configure();
        for (const actor_type of ['api_key', 'system', 'legacy']) {
            mocks.single.mockResolvedValue({data: {status: 'running', created_by: 'owner', actor_type}, error: null});
            await expect(executeLocalAgent(execution, input)).rejects.toThrow('not owned');
        }
        expect(mocks.execute).not.toHaveBeenCalled();
    });
    it('runs in the operator directory and preserves unknown accounting', async () => {
        configure();
        const result = await executeLocalAgent(execution, input);
        expect(mocks.execute.mock.calls[0][1].cwd).toBe('/trusted/project');
        expect(result.usage.usageKnown).toBe(false);
        expect(mocks.eq).toHaveBeenCalledWith('workspace_id', 'workspace');
    });
    it('database errors and cancellation prevent successful completion', async () => {
        configure();
        mocks.single.mockResolvedValue({data: null, error: {message: 'offline'}});
        mocks.execute.mockImplementation(async (_execution, invocation) => {
            if (invocation.signal.aborted) throw new Error('External execution cancelled.');
            return {result: 'unexpected'};
        });
        await expect(executeLocalAgent(execution, input)).rejects.toThrow('cancelled');
    });
});
