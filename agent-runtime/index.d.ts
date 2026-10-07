export interface ExternalExecution {
  kind: 'external';
  agent: 'codex' | 'claude' | 'gemini' | 'copilot';
  transport: 'cli' | 'acp';
  timeoutMs?: number;
}
export interface ExternalResult {
  result: string;
  usage: {promptTokens: number; completionTokens: number; totalTokens: number; costEstimateUSD: number; usageKnown: false; billingModel: 'unknown'};
  toolCallLogs: [];
  execution: {agent: string; transport: string; authentication: 'native-login'; billingModel: 'unknown'; usageKnown: false; sessionId?: string};
}
export function parseExecution(config: Record<string, unknown> | undefined): ExternalExecution | null;
export function executeExternal(execution: ExternalExecution, input: {prompt: string; systemPrompt?: string; model?: string; cwd: string; signal?: AbortSignal; onChunk?: (text: string) => void}): Promise<ExternalResult>;
export function nativeEnvironment(): Record<string, string>;
