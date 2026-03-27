/**
 * Tool Executor — Implements built-in tools for agent task execution.
 *
 * Each tool follows a standard interface: takes parameters, returns a string result.
 * The executor handles the tool-use loop: LLM calls → tool calls → results fed back.
 */

import { searchKnowledge, formatKnowledgeResults } from './knowledgeSearch';
import { delegateToA2AAgent } from './a2aClient';
import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import type { TokenUsage } from './types';
import { callMcpTool, parseMcpToolName } from './mcpClient';
import type { McpServerConfig } from './mcpClient';

// ─── Tool Call Logging ───────────────────────────────────────────────────────

export interface ToolCallLog {
    tool: string;
    arguments: Record<string, unknown>;
    result: string;
    success: boolean;
    duration_ms: number;
}

// ─── Tool Definitions (OpenAI-compatible format) ─────────────────────────────

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, { type: string; description: string }>;
            required: string[];
        };
    };
}

// ─── Custom Tool Support ─────────────────────────────────────────────────────

export interface CustomToolConfig {
    id: string;
    name: string;
    description: string;
    parameters: {
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
    webhook_url: string;
    webhook_headers: Record<string, string>;
}

/**
 * Returns OpenAI-compatible tool definitions for the given tool names.
 * Merges built-in tools with custom tools (prefixed with "custom:").
 */
export function getToolDefinitions(
    toolNames: string[],
    customTools?: CustomToolConfig[],
    mcpToolDefs?: ToolDefinition[],
): ToolDefinition[] {
    const defs: ToolDefinition[] = [];

    for (const name of toolNames) {
        if (name.startsWith('custom:')) {
            // Look up custom tool by ID
            const customId = name.replace('custom:', '');
            const ct = customTools?.find(t => t.id === customId);
            if (ct) {
                defs.push({
                    type: 'function',
                    function: {
                        name: `custom_${ct.name}`,
                        description: ct.description,
                        parameters: {
                            type: 'object',
                            properties: ct.parameters.properties,
                            required: ct.parameters.required,
                        },
                    },
                });
            }
        } else if (name.startsWith('mcp:')) {
            // MCP tools are already in mcpToolDefs — skip the name lookup
            // They're merged below
        } else {
            const def = TOOL_REGISTRY[name];
            if (def) {
                defs.push(def);
            }
        }
    }

    // Append MCP tool definitions (already in OpenAI format)
    if (mcpToolDefs && mcpToolDefs.length > 0) {
        defs.push(...mcpToolDefs);
    }

    return defs;
}

const TOOL_REGISTRY: Record<string, ToolDefinition> = {
    web_search: {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the web for current information. Returns relevant text snippets.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
            },
        },
    },
    http_request: {
        type: 'function',
        function: {
            name: 'http_request',
            description: 'Make an HTTP request to a URL. Returns the response body (truncated to 4000 chars).',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to request' },
                    method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE). Defaults to GET.' },
                    body: { type: 'string', description: 'Request body for POST/PUT requests (JSON string)' },
                },
                required: ['url'],
            },
        },
    },
    code_interpreter: {
        type: 'function',
        function: {
            name: 'code_interpreter',
            description: 'Execute JavaScript code in a sandboxed environment. Returns the result of the last expression or console output.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'JavaScript code to execute' },
                },
                required: ['code'],
            },
        },
    },
    read_file: {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file from a URL. Returns the file text (truncated to 8000 chars).',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL of the file to read' },
                },
                required: ['url'],
            },
        },
    },
    grammar_check: {
        type: 'function',
        function: {
            name: 'grammar_check',
            description: 'Check text for grammar, spelling, and style issues. Returns a list of issues with suggestions. Supports language auto-detection.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The text to check for grammar and spelling issues' },
                    language: { type: 'string', description: 'Language code (e.g. en-US, de-DE, fr). Defaults to auto-detect.' },
                },
                required: ['text'],
            },
        },
    },
    knowledge_search: {
        type: 'function',
        function: {
            name: 'knowledge_search',
            description: 'Search the knowledge base for relevant information from uploaded documents. Returns the most relevant text passages.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query to find relevant information' },
                },
                required: ['query'],
            },
        },
    },
    a2a_delegate: {
        type: 'function',
        function: {
            name: 'a2a_delegate',
            description: 'Delegate a task to an external A2A-compatible agent. Sends a message and returns the result.',
            parameters: {
                type: 'object',
                properties: {
                    remote_agent_id: { type: 'string', description: 'The ID of the registered remote A2A agent' },
                    message: { type: 'string', description: 'The task/message to send to the remote agent' },
                },
                required: ['remote_agent_id', 'message'],
            },
        },
    },
};

// ─── Tool Execution ──────────────────────────────────────────────────────────

interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Execute a single tool call and return the result string.
 * Supports both built-in tools and custom webhook-backed tools.
 */
export async function executeToolCall(
    toolCall: ToolCall,
    customTools?: CustomToolConfig[],
    serperApiKey?: string,
    mcpServers?: McpServerConfig[],
    knowledgeContext?: { workspaceId: string; documentIds?: string[] },
): Promise<string> {
    const { name, arguments: argsStr } = toolCall.function;

    let args: Record<string, unknown>;
    try {
        args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {
        return `Error: Invalid JSON arguments: ${argsStr}`;
    }

    try {
        // Check for MCP tool (prefixed with mcp_)
        if (name.startsWith('mcp_') && mcpServers) {
            const parsed = parseMcpToolName(name, mcpServers);
            if (parsed) {
                return await callMcpTool(parsed.serverId, parsed.toolName, args);
            }
            return `Error: Could not resolve MCP tool "${name}"`;
        }

        // Check for custom tool (prefixed with custom_)
        if (name.startsWith('custom_')) {
            const toolName = name.replace('custom_', '');
            const ct = customTools?.find(t => t.name === toolName);
            if (ct) {
                return await executeCustomToolWebhook(ct, args);
            }
            return `Error: Custom tool "${toolName}" not found`;
        }

        switch (name) {
            case 'web_search':
                return await executeWebSearch(args.query as string, serperApiKey);
            case 'http_request':
                return await executeHttpRequest(
                    args.url as string,
                    (args.method as string) || 'GET',
                    args.body as string | undefined,
                );
            case 'code_interpreter':
                return executeCodeInterpreter(args.code as string);
            case 'read_file':
                return await executeReadFile(args.url as string);
            case 'grammar_check':
                return await executeGrammarCheck(
                    args.text as string,
                    (args.language as string) || 'auto',
                );
            case 'knowledge_search': {
                if (!knowledgeContext?.workspaceId) {
                    return 'Error: Knowledge search not available — no workspace context.';
                }
                const results = await searchKnowledge(
                    knowledgeContext.workspaceId,
                    knowledgeContext.documentIds ?? null,
                    args.query as string,
                );
                return formatKnowledgeResults(results);
            }
            case 'a2a_delegate': {
                if (!knowledgeContext?.workspaceId) {
                    return 'Error: A2A delegate not available — no workspace context.';
                }
                return await delegateToA2AAgent(
                    args.remote_agent_id as string,
                    args.message as string,
                    knowledgeContext.workspaceId,
                );
            }
            default:
                return `Error: Unknown tool "${name}"`;
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error executing ${name}: ${msg}`;
    }
}

// ─── Built-in Tool Implementations ───────────────────────────────────────────

interface SerperResult {
    title: string;
    link: string;
    snippet: string;
    position: number;
}

interface SerperResponse {
    organic: SerperResult[];
    answerBox?: { answer?: string; snippet?: string; title?: string };
    knowledgeGraph?: { title?: string; description?: string };
}

async function executeWebSearch(query: string, serperApiKey?: string): Promise<string> {
    if (!serperApiKey) {
        return 'Error: Web search requires a Serper API key. Please configure it in Settings → API Keys.';
    }

    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': serperApiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 10 }),
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        return `Search failed: HTTP ${response.status.toString()} ${response.statusText}`;
    }

    const data = await response.json() as SerperResponse;
    const parts: string[] = [];

    // Include answer box if present
    if (data.answerBox?.answer) {
        parts.push(`**Quick Answer:** ${data.answerBox.answer}`);
    } else if (data.answerBox?.snippet) {
        parts.push(`**Quick Answer:** ${data.answerBox.snippet}`);
    }

    // Include knowledge graph if present
    if (data.knowledgeGraph?.description) {
        parts.push(`**${data.knowledgeGraph.title ?? 'Overview'}:** ${data.knowledgeGraph.description}`);
    }

    // Organic results
    const organic = data.organic ?? [];
    if (organic.length === 0 && parts.length === 0) {
        return `No search results found for: "${query}"`;
    }

    for (let i = 0; i < Math.min(organic.length, 10); i++) {
        const r = organic[i];
        parts.push(`${(i + 1).toString()}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.link}`);
    }

    return `Search results for "${query}":\n\n${parts.join('\n\n')}`;
}

async function executeHttpRequest(url: string, method: string, body?: string): Promise<string> {
    const opts: RequestInit = {
        method: method.toUpperCase(),
        headers: {
            'User-Agent': 'CrewForm-Agent/1.0',
            'Accept': 'application/json, text/plain, */*',
        },
    };

    if (body && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        opts.body = body;
        opts.headers = { ...opts.headers, 'Content-Type': 'application/json' };
    }

    const response = await fetch(url, opts);
    const text = await response.text();

    const statusInfo = `HTTP ${response.status.toString()} ${response.statusText}`;
    const truncated = text.length > 4000 ? text.slice(0, 4000) + '\n... (truncated)' : text;

    return `${statusInfo}\n\n${truncated}`;
}

function executeCodeInterpreter(code: string): string {
    // Sandboxed JS evaluation using Function constructor
    // This is intentionally limited — no access to Node.js APIs
    try {
        const logs: string[] = [];
        const mockConsole = {
            log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
            warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(String).join(' ')}`),
            error: (...args: unknown[]) => logs.push(`[error] ${args.map(String).join(' ')}`),
        };

        // Create sandboxed function
        const fn = new Function('console', 'Math', 'JSON', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
            `"use strict";\n${code}`);
        const result: unknown = fn(mockConsole, Math, JSON, Date, parseInt, parseFloat, isNaN, isFinite);

        const output = logs.length > 0 ? logs.join('\n') : '';
        const returnValue = result !== undefined ? String(result) : '';

        if (output && returnValue) {
            return `Console output:\n${output}\n\nReturn value: ${returnValue}`;
        }
        return output || returnValue || '(no output)';
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Code execution error: ${msg}`;
    }
}

async function executeReadFile(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'CrewForm-Agent/1.0' },
    });

    if (!response.ok) {
        return `Failed to read file: HTTP ${response.status.toString()} ${response.statusText}`;
    }

    const text = await response.text();
    return text.length > 8000 ? text.slice(0, 8000) + '\n... (truncated)' : text;
}

async function executeGrammarCheck(text: string, language: string): Promise<string> {
    const params = new URLSearchParams({
        text,
        language,
        enabledOnly: 'false',
    });

    const response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'CrewForm-Agent/1.0',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        return `Grammar check failed: HTTP ${response.status.toString()} ${response.statusText}`;
    }

    interface LTMatch {
        message: string;
        shortMessage: string;
        offset: number;
        length: number;
        replacements: { value: string }[];
        rule: { id: string; category: { name: string } };
        context: { text: string; offset: number; length: number };
    }

    interface LTResponse {
        matches: LTMatch[];
        language: { name: string; code: string; detectedLanguage?: { name: string; code: string } };
    }

    const data = await response.json() as LTResponse;
    const matches = data.matches;

    if (matches.length === 0) {
        const lang = data.language.detectedLanguage?.name ?? data.language.name;
        return `✅ No grammar, spelling, or style issues found. Language detected: ${lang}.`;
    }

    const lang = data.language.detectedLanguage?.name ?? data.language.name;
    let result = `Found ${matches.length.toString()} issue(s) (Language: ${lang}):\n\n`;

    for (let i = 0; i < Math.min(matches.length, 20); i++) {
        const m = matches[i];
        const num = (i + 1).toString();
        const category = m.rule.category.name;
        const suggestions = m.replacements.slice(0, 3).map(r => `"${r.value}"`).join(', ');
        const context = m.context.text;

        result += `${num}. [${category}] ${m.message}\n`;
        result += `   Context: "...${context}..."\n`;
        if (suggestions) {
            result += `   Suggestions: ${suggestions}\n`;
        }
        result += '\n';
    }

    if (matches.length > 20) {
        result += `... and ${(matches.length - 20).toString()} more issues.\n`;
    }

    return result;
}

// ─── Custom Tool Webhook Execution ───────────────────────────────────────────

async function executeCustomToolWebhook(
    tool: CustomToolConfig,
    args: Record<string, unknown>,
): Promise<string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CrewForm-Agent/1.0',
        ...tool.webhook_headers,
    };

    const response = await fetch(tool.webhook_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
    });

    const text = await response.text();
    const statusInfo = `HTTP ${response.status.toString()} ${response.statusText}`;

    if (!response.ok) {
        return `Custom tool webhook error: ${statusInfo}\n\n${text.slice(0, 2000)}`;
    }

    const truncated = text.length > 4000 ? text.slice(0, 4000) + '\n... (truncated)' : text;
    return truncated;
}

// ─── Tool-Use Loop (OpenAI-compatible) ───────────────────────────────────────

interface ToolUseMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

interface ToolUseResult {
    result: string;
    usage: TokenUsage;
    toolCallsMade: number;
    toolCallLogs: ToolCallLog[];
}

/**
 * Executes an OpenAI-compatible tool-use loop.
 * - Calls the LLM with tools
 * - If the LLM returns tool_calls, executes them
 * - Feeds results back and loops
 * - Max 10 rounds to prevent infinite loops
 */
export async function executeWithToolLoop(
    callLLM: (messages: ToolUseMessage[], tools: ToolDefinition[]) => Promise<{
        message: { role: string; content: string | null; tool_calls?: ToolCall[] };
        usage: { promptTokens: number; completionTokens: number };
    }>,
    systemPrompt: string,
    userPrompt: string,
    toolNames: string[],
    customTools?: CustomToolConfig[],
    serperApiKey?: string,
    mcpToolDefs?: ToolDefinition[],
    mcpServers?: McpServerConfig[],
    knowledgeContext?: { workspaceId: string; documentIds?: string[] },
    taskId?: string,
): Promise<ToolUseResult> {
    const tools = getToolDefinitions(toolNames, customTools, mcpToolDefs);
    const messages: ToolUseMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    const MAX_ROUNDS = 10;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let toolCallsMade = 0;
    const toolCallLogs: ToolCallLog[] = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
        const response = await callLLM(messages, tools);

        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;

        const assistantMessage = response.message;

        // If no tool calls, we're done
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            // AG-UI: Emit final text message
            if (taskId && assistantMessage.content) {
                const msgId = `msg_${Date.now().toString()}`;
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TEXT_MESSAGE_START,
                    timestamp: Date.now(),
                    messageId: msgId,
                    role: 'assistant',
                });
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TEXT_MESSAGE_CONTENT,
                    timestamp: Date.now(),
                    messageId: msgId,
                    delta: assistantMessage.content,
                });
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TEXT_MESSAGE_END,
                    timestamp: Date.now(),
                    messageId: msgId,
                });
            }

            const totalTokens = totalPromptTokens + totalCompletionTokens;
            const costEstimateUSD = (totalPromptTokens / 1_000_000) * 5 + (totalCompletionTokens / 1_000_000) * 15;

            return {
                result: assistantMessage.content ?? '',
                usage: {
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    totalTokens,
                    costEstimateUSD,
                },
                toolCallsMade,
                toolCallLogs,
            };
        }

        // Add assistant message with tool_calls to conversation
        messages.push({
            role: 'assistant',
            content: assistantMessage.content,
            tool_calls: assistantMessage.tool_calls,
        });

        // Execute each tool call and add results
        for (const toolCall of assistantMessage.tool_calls) {
            toolCallsMade++;
            console.log(`[ToolExecutor] Executing tool: ${toolCall.function.name} (round ${(round + 1).toString()}, call #${toolCallsMade.toString()})`);

            // AG-UI: Tool call start
            if (taskId) {
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TOOL_CALL_START,
                    timestamp: Date.now(),
                    toolCallId: toolCall.id,
                    toolCallName: toolCall.function.name,
                });
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TOOL_CALL_ARGS,
                    timestamp: Date.now(),
                    toolCallId: toolCall.id,
                    delta: toolCall.function.arguments,
                });
            }

            const callStart = Date.now();
            const result = await executeToolCall(toolCall, customTools, serperApiKey, mcpServers, knowledgeContext);
            const durationMs = Date.now() - callStart;

            // AG-UI: Tool call end
            if (taskId) {
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.TOOL_CALL_END,
                    timestamp: Date.now(),
                    toolCallId: toolCall.id,
                    result: result.length > 200 ? result.slice(0, 200) + '…' : result,
                });
            }

            let parsedArgs: Record<string, unknown> = {};
            try { parsedArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>; } catch { /* ignore */ }

            toolCallLogs.push({
                tool: toolCall.function.name,
                arguments: parsedArgs,
                result: result.length > 500 ? result.slice(0, 500) + '…' : result,
                success: !result.startsWith('Error'),
                duration_ms: durationMs,
            });

            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: result,
            });
        }
    }

    // If we hit max rounds, return whatever we have
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const costEstimateUSD = (totalPromptTokens / 1_000_000) * 5 + (totalCompletionTokens / 1_000_000) * 15;
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();

    return {
        result: lastAssistant?.content ?? '[Tool-use loop reached maximum rounds without final response]',
        usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens,
            costEstimateUSD,
        },
        toolCallsMade,
        toolCallLogs,
    };
}
