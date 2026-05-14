// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// chat.ts — Interactive chat mode (REPL).

import * as readline from 'readline';
import chalk from 'chalk';
import { executeAgent } from './executor.js';
import type { AgentConfig } from './config.js';
import type { TokenUsage } from './types.js';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Start an interactive chat session with an agent.
 * Maintains conversation history in memory.
 */
export async function startChatSession(agent: AgentConfig): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    const history: ChatMessage[] = [];
    let totalTokens = 0;
    let totalCost = 0;

    console.log('');
    console.log(chalk.bold.cyan(`💬 Chat with ${agent.name}`));
    console.log(chalk.dim(`   Model: ${agent.model}`));
    console.log(chalk.dim(`   Tools: ${agent.tools?.length ? agent.tools.join(', ') : 'none'}`));
    console.log(chalk.dim(`   Type /help for commands, /exit to quit`));
    console.log(chalk.dim('─'.repeat(60)));
    console.log('');

    const promptUser = (): void => {
        rl.question(chalk.green.bold('You: '), async (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                promptUser();
                return;
            }

            // Handle commands
            if (trimmed.startsWith('/')) {
                handleCommand(trimmed, history, totalTokens, totalCost, rl);
                if (trimmed === '/exit' || trimmed === '/quit') return;
                promptUser();
                return;
            }

            // Add user message to history
            history.push({ role: 'user', content: trimmed });

            // Build the full prompt with conversation history
            const contextPrompt = buildContextPrompt(history);

            // Stream the response
            process.stdout.write(chalk.blue.bold(`\n${agent.name}: `));
            let fullResponse = '';

            try {
                const result = await executeAgent(agent, {
                    prompt: contextPrompt,
                    onStream: (delta) => {
                        process.stdout.write(delta);
                    },
                    onToolCall: (name, args) => {
                        process.stdout.write(chalk.dim(`\n  🔧 ${name}(${JSON.stringify(args).slice(0, 80)})\n`));
                    },
                });

                fullResponse = result.result;
                totalTokens += result.usage.totalTokens;
                totalCost += result.usage.costEstimateUSD;

                // Add assistant response to history
                history.push({ role: 'assistant', content: fullResponse });

                // Show usage
                console.log('');
                console.log(chalk.dim(
                    `  [${result.usage.totalTokens} tokens · $${result.usage.costEstimateUSD.toFixed(4)}` +
                    (result.toolCallLogs.length > 0 ? ` · ${result.toolCallLogs.length} tool call(s)` : '') +
                    `]`,
                ));
                console.log('');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.log('');
                console.log(chalk.red(`  Error: ${msg}`));
                console.log('');
            }

            promptUser();
        });
    };

    promptUser();

    // Wait for the readline to close
    await new Promise<void>((resolve) => {
        rl.on('close', resolve);
    });
}

/**
 * Build a conversation-style prompt from chat history.
 * The last message is always the current user input.
 */
function buildContextPrompt(history: ChatMessage[]): string {
    if (history.length <= 1) {
        return history[0]?.content ?? '';
    }

    const parts: string[] = [];
    // Include the last 20 messages for context
    const recentHistory = history.slice(-20);

    for (const msg of recentHistory) {
        if (msg.role === 'user') {
            parts.push(`User: ${msg.content}`);
        } else {
            parts.push(`Assistant: ${msg.content}`);
        }
    }

    return parts.join('\n\n');
}

/**
 * Handle slash commands.
 */
function handleCommand(
    command: string,
    history: ChatMessage[],
    totalTokens: number,
    totalCost: number,
    rl: readline.Interface,
): void {
    switch (command.toLowerCase()) {
        case '/exit':
        case '/quit':
            console.log('');
            console.log(chalk.dim('─'.repeat(60)));
            console.log(chalk.dim(
                `Session: ${history.length} messages · ${totalTokens} tokens · $${totalCost.toFixed(4)}`,
            ));
            console.log(chalk.cyan('👋 Goodbye!'));
            console.log('');
            rl.close();
            break;

        case '/clear':
            history.length = 0;
            console.log(chalk.dim('  Conversation history cleared.'));
            console.log('');
            break;

        case '/history':
            if (history.length === 0) {
                console.log(chalk.dim('  No messages yet.'));
            } else {
                console.log(chalk.dim(`  ${history.length} messages in history:`));
                for (const msg of history.slice(-10)) {
                    const prefix = msg.role === 'user' ? chalk.green('  You: ') : chalk.blue(`  Bot: `);
                    console.log(prefix + chalk.dim(msg.content.slice(0, 80) + (msg.content.length > 80 ? '...' : '')));
                }
            }
            console.log('');
            break;

        case '/stats':
            console.log(chalk.dim(`  Messages: ${history.length}`));
            console.log(chalk.dim(`  Tokens:   ${totalTokens}`));
            console.log(chalk.dim(`  Cost:     $${totalCost.toFixed(4)}`));
            console.log('');
            break;

        case '/help':
            console.log('');
            console.log(chalk.bold('  Commands:'));
            console.log(chalk.dim('  /clear    — Clear conversation history'));
            console.log(chalk.dim('  /history  — Show recent messages'));
            console.log(chalk.dim('  /stats    — Show token usage & cost'));
            console.log(chalk.dim('  /exit     — End the chat session'));
            console.log('');
            break;

        default:
            console.log(chalk.dim(`  Unknown command: ${command}. Type /help for commands.`));
            console.log('');
            break;
    }
}
