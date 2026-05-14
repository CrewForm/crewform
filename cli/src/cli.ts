#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// cli.ts — CrewForm CLI entry point.
// Usage: npx crewform run agent.json "prompt"
//        npx crewform chat agent.json
//        npx crewform init
//        npx crewform validate agent.json

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

import { parseConfigFile, validateConfigFile, generateAgentConfig, generateTeamConfig } from './config.js';
import { executeAgent } from './executor.js';
import { executePipeline } from './pipelineExecutor.js';
import { startChatSession } from './chat.js';
import { detectOllama, inferProvider, resolveApiKey } from './providers.js';
import { getAvailableTools } from './tools.js';
import { parseMcpServers } from './mcpClient.js';
import type { McpServerConfig } from './mcpClient.js';
import { ApiClient, saveConfig, deleteConfig, getConfigPath, loadConfig } from './apiClient.js';

// Load .env from current directory
dotenv.config();

const VERSION = '0.1.0';

const program = new Command();

program
    .name('crewform')
    .description('Run CrewForm AI agents from the command line')
    .version(VERSION);

// ─── run command ─────────────────────────────────────────────────────────────

program
    .command('run')
    .description('Run an agent or team from a JSON config file')
    .argument('<file>', 'Path to agent or team JSON config file')
    .argument('[prompt...]', 'The prompt/task to send to the agent')
    .option('-i, --input <file>', 'Read prompt from a file instead')
    .option('-o, --output <file>', 'Write result to a file')
    .option('-q, --quiet', 'Suppress streaming output, only show final result')
    .option('--no-stream', 'Disable streaming (show result at the end)')
    .option('--ollama-url <url>', 'Custom Ollama base URL (default: http://localhost:11434)')
    .option('--mcp <file>', 'Load MCP server configs from a JSON file')
    .option('--json', 'Output result as JSON with usage metadata')
    .action(async (file: string, promptParts: string[], options: {
        input?: string;
        output?: string;
        quiet?: boolean;
        stream?: boolean;
        ollamaUrl?: string;
        mcp?: string;
        json?: boolean;
    }) => {
        try {
            // Resolve prompt
            let prompt = promptParts.join(' ');
            if (options.input) {
                const inputPath = resolve(options.input);
                if (!existsSync(inputPath)) {
                    console.error(chalk.red(`Input file not found: ${inputPath}`));
                    process.exit(1);
                }
                prompt = readFileSync(inputPath, 'utf-8');
            }

            if (!prompt && !process.stdin.isTTY) {
                prompt = await readStdin();
            }

            if (!prompt) {
                console.error(chalk.red('No prompt provided. Pass a prompt argument, --input file, or pipe from stdin.'));
                process.exit(1);
            }

            // Load MCP server configs
            let mcpServers: McpServerConfig[] = [];
            if (options.mcp) {
                const mcpPath = resolve(options.mcp);
                if (!existsSync(mcpPath)) {
                    console.error(chalk.red(`MCP config file not found: ${mcpPath}`));
                    process.exit(1);
                }
                const mcpRaw = JSON.parse(readFileSync(mcpPath, 'utf-8'));
                mcpServers = parseMcpServers(Array.isArray(mcpRaw) ? mcpRaw : mcpRaw.servers ?? [mcpRaw]);
            }

            // Parse config
            const configPath = resolve(file);
            const config = parseConfigFile(configPath);

            if (config.type === 'team' && config.team) {
                // ── Team / Pipeline Execution ──
                await runTeam(config.team, prompt, options, mcpServers);
            } else if (config.type === 'agent' && config.agent) {
                // ── Single Agent Execution ──
                await runAgent(config.agent, prompt, options, mcpServers);
            } else {
                console.error(chalk.red('Invalid config: no agent or team found.'));
                process.exit(1);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── chat command ────────────────────────────────────────────────────────────

program
    .command('chat')
    .description('Start an interactive chat session with an agent')
    .argument('<file>', 'Path to agent JSON config file')
    .option('--ollama-url <url>', 'Custom Ollama base URL')
    .action(async (file: string) => {
        try {
            const configPath = resolve(file);
            const config = parseConfigFile(configPath);

            if (config.type !== 'agent' || !config.agent) {
                console.error(chalk.red('Chat mode requires an agent config file, not a team.'));
                process.exit(1);
            }

            await startChatSession(config.agent);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── init command ────────────────────────────────────────────────────────────

program
    .command('init')
    .description('Create a starter agent or team config file')
    .option('-t, --team', 'Generate a pipeline team config instead of an agent')
    .option('-n, --name <name>', 'Agent/team name')
    .option('-m, --model <model>', 'Model to use (default: llama3.3)')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options: { team?: boolean; name?: string; model?: string; output?: string }) => {
        try {
            const isTeam = options.team ?? false;
            const defaultFile = isTeam ? 'team.json' : 'agent.json';
            const outputPath = resolve(options.output ?? defaultFile);

            if (existsSync(outputPath)) {
                console.error(chalk.red(`File already exists: ${outputPath}`));
                console.error(chalk.dim('Use --output to specify a different path.'));
                process.exit(1);
            }

            // Detect Ollama for helpful messaging
            const spinner = ora({ text: 'Checking for Ollama...', color: 'cyan' }).start();
            const ollama = await detectOllama();
            spinner.stop();

            let content: string;
            if (isTeam) {
                content = generateTeamConfig();
            } else {
                const model = options.model ?? (ollama.available && ollama.models.length > 0
                    ? ollama.models[0]
                    : 'llama3.3');
                content = generateAgentConfig({
                    name: options.name,
                    model,
                });
            }

            writeFileSync(outputPath, content, 'utf-8');

            console.log('');
            console.log(chalk.green(`✓ Created ${outputPath}`));
            console.log('');

            if (ollama.available) {
                console.log(chalk.dim(`  Ollama detected with ${ollama.models.length} model(s):`));
                for (const model of ollama.models.slice(0, 5)) {
                    console.log(chalk.dim(`    • ${model}`));
                }
                if (ollama.models.length > 5) {
                    console.log(chalk.dim(`    ... and ${ollama.models.length - 5} more`));
                }
            } else {
                console.log(chalk.dim('  Ollama not detected. Install it at https://ollama.com'));
                console.log(chalk.dim('  Or set an API key: OPENAI_API_KEY=sk-... crewform run agent.json "hello"'));
            }

            console.log('');
            console.log(chalk.dim(`  Next steps:`));
            console.log(chalk.dim(`    1. Edit ${defaultFile} to customise your agent`));
            console.log(chalk.dim(`    2. crewform run ${defaultFile} "your prompt here"`));
            console.log(chalk.dim(`    3. crewform chat ${defaultFile}`));
            console.log('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── validate command ────────────────────────────────────────────────────────

program
    .command('validate')
    .description('Validate a CrewForm config file')
    .argument('<file>', 'Path to config file')
    .action((file: string) => {
        const configPath = resolve(file);
        const result = validateConfigFile(configPath);

        if (result.valid) {
            const config = parseConfigFile(configPath);
            console.log('');
            console.log(chalk.green(`✓ Valid ${config.type} config: ${configPath}`));
            if (config.type === 'agent' && config.agent) {
                console.log(chalk.dim(`  Name:  ${config.agent.name}`));
                console.log(chalk.dim(`  Model: ${config.agent.model}`));
                console.log(chalk.dim(`  Tools: ${config.agent.tools?.length ? config.agent.tools.join(', ') : 'none'}`));
            } else if (config.type === 'team' && config.team) {
                console.log(chalk.dim(`  Name:   ${config.team.name}`));
                console.log(chalk.dim(`  Mode:   ${config.team.mode}`));
                console.log(chalk.dim(`  Agents: ${config.team.agents.length}`));
            }
            console.log('');
        } else {
            console.error(chalk.red(`✗ Invalid config: ${configPath}`));
            for (const err of result.errors) {
                console.error(chalk.red(`  ${err}`));
            }
            console.log('');
            process.exit(1);
        }
    });

// ─── tools command ───────────────────────────────────────────────────────────

program
    .command('tools')
    .description('List available built-in tools')
    .action(() => {
        const tools = getAvailableTools();
        console.log('');
        console.log(chalk.bold('Available tools:'));
        console.log('');
        for (const tool of tools) {
            console.log(chalk.cyan(`  • ${tool}`));
        }
        console.log('');
        console.log(chalk.dim('Add tools to your agent config: "tools": ["web_search", "code_interpreter"]'));
        console.log(chalk.dim('Note: web_search requires SERPER_API_KEY environment variable (serper.dev)'));
        console.log('');
    });

// ─── login command ───────────────────────────────────────────────────────────

program
    .command('login')
    .description('Authenticate with the CrewForm platform using an API key')
    .option('--api-key <key>', 'API key (or set CREWFORM_API_KEY env var)')
    .option('--api-url <url>', 'Custom API URL (for self-hosted instances)')
    .action(async (options: { apiKey?: string; apiUrl?: string }) => {
        try {
            let apiKey = options.apiKey ?? process.env.CREWFORM_API_KEY;

            if (!apiKey) {
                // Interactive prompt
                const readline = await import('readline');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                apiKey = await new Promise<string>((res) => {
                    rl.question(chalk.cyan('Enter your API key: '), (answer: string) => {
                        rl.close();
                        res(answer.trim());
                    });
                });
            }

            if (!apiKey) {
                console.error(chalk.red('No API key provided.'));
                process.exit(1);
            }

            const spinner = ora({ text: 'Verifying API key...', color: 'cyan' }).start();
            const client = new ApiClient({ apiKey, apiUrl: options.apiUrl });
            const me = await client.whoami();
            spinner.stop();

            // Save config
            saveConfig({
                api_key: apiKey,
                api_url: options.apiUrl ?? 'https://api.crewform.tech',
            });

            console.log('');
            console.log(chalk.green('✓ Logged in successfully'));
            console.log(chalk.dim(`  User:      ${me.name ?? me.email ?? me.id}`));
            console.log(chalk.dim(`  Workspace: ${me.workspace_name}`));
            console.log(chalk.dim(`  Plan:      ${me.plan}`));
            console.log(chalk.dim(`  Config:    ${getConfigPath()}`));
            console.log('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Login failed: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── logout command ──────────────────────────────────────────────────────────

program
    .command('logout')
    .description('Remove saved API credentials')
    .action(() => {
        if (deleteConfig()) {
            console.log(chalk.green('\n✓ Logged out. Credentials removed.\n'));
        } else {
            console.log(chalk.dim('\nNo saved credentials found.\n'));
        }
    });

// ─── whoami command ──────────────────────────────────────────────────────────

program
    .command('whoami')
    .description('Show the currently authenticated user and workspace')
    .action(async () => {
        try {
            const client = new ApiClient();
            if (!client.isAuthenticated) {
                console.error(chalk.red('\nNot logged in. Run `crewform login` first.\n'));
                process.exit(1);
            }
            const spinner = ora({ text: 'Fetching...', color: 'cyan' }).start();
            const me = await client.whoami();
            spinner.stop();

            console.log('');
            console.log(chalk.bold('Authenticated as:'));
            console.log(chalk.dim(`  Name:      ${me.name ?? '(not set)'}`));
            console.log(chalk.dim(`  Email:     ${me.email ?? '(not set)'}`));
            console.log(chalk.dim(`  Workspace: ${me.workspace_name} (${me.workspace_id})`));
            console.log(chalk.dim(`  Plan:      ${me.plan}`));
            console.log('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── agents command ──────────────────────────────────────────────────────────

program
    .command('agents')
    .description('List agents from your CrewForm workspace')
    .option('--limit <n>', 'Max agents to show', '20')
    .option('--json', 'Output as JSON')
    .action(async (options: { limit: string; json?: boolean }) => {
        try {
            const client = new ApiClient();
            if (!client.isAuthenticated) {
                console.error(chalk.red('\nNot logged in. Run `crewform login` first.\n'));
                process.exit(1);
            }
            const spinner = ora({ text: 'Fetching agents...', color: 'cyan' }).start();
            const result = await client.listAgents(parseInt(options.limit, 10));
            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            console.log('');
            console.log(chalk.bold(`Agents (${result.items.length}${result.has_more ? '+' : ''}):`));
            console.log('');
            for (const agent of result.items) {
                const a = agent as { id: string; name: string; model: string; status?: string };
                const statusIcon = a.status === 'busy' ? '🔄' : a.status === 'offline' ? '⏸' : '🟢';
                console.log(`  ${statusIcon} ${chalk.cyan(a.name)} ${chalk.dim(`(${a.model})`)}`);
                console.log(chalk.dim(`     ID: ${a.id}`));
            }
            if (result.has_more) {
                console.log(chalk.dim(`\n  ... and more. Use --limit to see more.`));
            }
            console.log('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── teams command ───────────────────────────────────────────────────────────

program
    .command('teams')
    .description('List teams from your CrewForm workspace')
    .option('--limit <n>', 'Max teams to show', '20')
    .option('--json', 'Output as JSON')
    .action(async (options: { limit: string; json?: boolean }) => {
        try {
            const client = new ApiClient();
            if (!client.isAuthenticated) {
                console.error(chalk.red('\nNot logged in. Run `crewform login` first.\n'));
                process.exit(1);
            }
            const spinner = ora({ text: 'Fetching teams...', color: 'cyan' }).start();
            const result = await client.listTeams(parseInt(options.limit, 10));
            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            console.log('');
            console.log(chalk.bold(`Teams (${result.items.length}${result.has_more ? '+' : ''}):`));
            console.log('');
            for (const team of result.items) {
                const t = team as { id: string; name: string; mode: string; team_members?: unknown[] };
                const members = Array.isArray(t.team_members) ? t.team_members.length : 0;
                console.log(`  👥 ${chalk.cyan(t.name)} ${chalk.dim(`(${t.mode} · ${members} agents)`)}`);
                console.log(chalk.dim(`     ID: ${t.id}`));
            }
            if (result.has_more) {
                console.log(chalk.dim(`\n  ... and more. Use --limit to see more.`));
            }
            console.log('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── pull command ────────────────────────────────────────────────────────────

program
    .command('pull')
    .description('Download an agent or team config from CrewForm to a local JSON file')
    .argument('<id>', 'Agent or team UUID to download')
    .option('-t, --type <type>', 'Resource type: agent or team', 'agent')
    .option('-o, --output <file>', 'Output file path (default: <name>.json)')
    .action(async (id: string, options: { type: string; output?: string }) => {
        try {
            const client = new ApiClient();
            if (!client.isAuthenticated) {
                console.error(chalk.red('\nNot logged in. Run `crewform login` first.\n'));
                process.exit(1);
            }
            const spinner = ora({ text: `Pulling ${options.type}...`, color: 'cyan' }).start();

            if (options.type === 'team') {
                const team = await client.getTeam(id);
                spinner.stop();
                const name = (team.name as string) || 'team';
                const outFile = resolve(options.output ?? `${slugify(name)}.json`);
                // Wrap in crewform-export format
                const exportData = {
                    format: 'crewform-export',
                    version: 1,
                    exported_at: new Date().toISOString(),
                    type: 'team',
                    data: team,
                };
                writeFileSync(outFile, JSON.stringify(exportData, null, 2), 'utf-8');
                console.log(chalk.green(`\n✓ Pulled team "${name}" → ${outFile}\n`));
            } else {
                const agent = await client.getAgent(id);
                spinner.stop();
                const name = (agent.name as string) || 'agent';
                const outFile = resolve(options.output ?? `${slugify(name)}.json`);
                const exportData = {
                    format: 'crewform-export',
                    version: 1,
                    exported_at: new Date().toISOString(),
                    type: 'agent',
                    data: agent,
                };
                writeFileSync(outFile, JSON.stringify(exportData, null, 2), 'utf-8');
                console.log(chalk.green(`\n✓ Pulled agent "${name}" → ${outFile}\n`));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── push command ────────────────────────────────────────────────────────────

program
    .command('push')
    .description('Create a task on the platform and dispatch it to an agent or team')
    .argument('<id>', 'Agent or team UUID to dispatch to')
    .argument('[prompt...]', 'The task description')
    .option('-t, --type <type>', 'Resource type: agent or team', 'agent')
    .option('--wait', 'Wait for the run/task to complete (team runs only)')
    .option('--json', 'Output result as JSON')
    .action(async (id: string, promptParts: string[], options: { type: string; wait?: boolean; json?: boolean }) => {
        try {
            const client = new ApiClient();
            if (!client.isAuthenticated) {
                console.error(chalk.red('\nNot logged in. Run `crewform login` first.\n'));
                process.exit(1);
            }

            const prompt = promptParts.join(' ');
            if (!prompt) {
                console.error(chalk.red('No prompt provided.'));
                process.exit(1);
            }

            if (options.type === 'team') {
                const spinner = ora({ text: 'Creating team run...', color: 'cyan' }).start();
                const run = await client.createRun(id, prompt);
                const runId = run.id as string;
                spinner.succeed(chalk.dim(`Run created: ${runId}`));

                if (options.wait) {
                    const pollSpinner = ora({ text: 'Waiting for completion...', color: 'cyan' }).start();
                    const finalRun = await client.waitForRun(runId, (status, elapsed) => {
                        pollSpinner.text = `Status: ${status} (${elapsed}s)`;
                    });
                    pollSpinner.stop();

                    if (options.json) {
                        console.log(JSON.stringify(finalRun, null, 2));
                    } else {
                        const status = finalRun.status as string;
                        const icon = status === 'completed' ? '✅' : '❌';
                        console.log(`\n${icon} Run ${status}: ${runId}`);
                        if (finalRun.output) {
                            console.log(chalk.dim('─'.repeat(60)));
                            console.log(finalRun.output as string);
                        }
                    }
                } else if (options.json) {
                    console.log(JSON.stringify(run, null, 2));
                } else {
                    console.log(chalk.dim(`\nRun dispatched. Check status: crewform runs ${runId}\n`));
                }
            } else {
                const spinner = ora({ text: 'Creating task...', color: 'cyan' }).start();
                const task = await client.createTask({
                    title: prompt.slice(0, 100),
                    description: prompt,
                    assigned_agent_id: id,
                });
                spinner.stop();

                if (options.json) {
                    console.log(JSON.stringify(task, null, 2));
                } else {
                    console.log(chalk.green(`\n✓ Task dispatched: ${task.id}`));
                    console.log(chalk.dim(`  Status: ${task.status}`));
                    console.log(chalk.dim(`  Agent:  ${id}\n`));
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`\n✗ Error: ${msg}\n`));
            process.exit(1);
        }
    });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => { resolve(data.trim()); });
        setTimeout(() => { resolve(data.trim()); }, 100);
    });
}

// ─── Single Agent Runner ─────────────────────────────────────────────────────

import type { AgentConfig, TeamConfig } from './config.js';

async function runAgent(
    agent: AgentConfig,
    prompt: string,
    options: { quiet?: boolean; json?: boolean; stream?: boolean; ollamaUrl?: string; output?: string },
    mcpServers: McpServerConfig[],
): Promise<void> {
    // Show banner
    if (!options.quiet && !options.json) {
        console.log('');
        console.log(chalk.bold.cyan(`🤖 ${agent.name}`));
        const provider = agent.provider ?? inferProvider(agent.model) ?? 'ollama';
        console.log(chalk.dim(`   ${agent.model} via ${provider}`));
        if (agent.tools?.length) {
            console.log(chalk.dim(`   Tools: ${agent.tools.join(', ')}`));
        }
        if (mcpServers.length > 0) {
            console.log(chalk.dim(`   MCP:   ${mcpServers.map(s => s.name).join(', ')}`));
        }
        console.log(chalk.dim('─'.repeat(60)));
        console.log('');
    }

    const spinner = !options.quiet && !options.json && options.stream !== false
        ? null
        : (!options.json ? ora({ text: 'Thinking...', color: 'cyan' }).start() : null);

    const result = await executeAgent(agent, {
        prompt,
        ollamaBaseUrl: options.ollamaUrl,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        onStream: (!options.quiet && !options.json && options.stream !== false)
            ? (delta) => { process.stdout.write(delta); }
            : undefined,
        onToolCall: (!options.quiet && !options.json)
            ? (name, args) => {
                console.log(chalk.dim(`\n  🔧 ${name}(${JSON.stringify(args).slice(0, 100)})`));
            }
            : undefined,
    });

    if (spinner) spinner.stop();

    // Output
    if (options.json) {
        const jsonOutput = {
            agent: agent.name,
            model: agent.model,
            result: result.result,
            usage: result.usage,
            toolCalls: result.toolCallLogs,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
    } else if (options.stream === false || options.quiet) {
        console.log(result.result);
    } else {
        console.log('');
    }

    // Usage summary
    if (!options.quiet && !options.json) {
        console.log('');
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.dim(
            `  ${result.usage.totalTokens} tokens · ` +
            `$${result.usage.costEstimateUSD.toFixed(4)}` +
            (result.toolCallLogs.length > 0 ? ` · ${result.toolCallLogs.length} tool call(s)` : ''),
        ));
    }

    if (options.output) {
        writeFileSync(resolve(options.output), result.result, 'utf-8');
        if (!options.quiet && !options.json) {
            console.log(chalk.green(`  ✓ Saved to ${options.output}`));
        }
    }

    console.log('');
}

// ─── Team / Pipeline Runner ─────────────────────────────────────────────────

async function runTeam(
    team: TeamConfig,
    prompt: string,
    options: { quiet?: boolean; json?: boolean; stream?: boolean; ollamaUrl?: string; output?: string },
    mcpServers: McpServerConfig[],
): Promise<void> {
    const totalSteps = team.config.steps?.length ?? 0;

    // Show banner
    if (!options.quiet && !options.json) {
        console.log('');
        console.log(chalk.bold.cyan(`👥 ${team.name}`));
        console.log(chalk.dim(`   Mode: ${team.mode} · ${totalSteps} step(s) · ${team.agents.length} agent(s)`));
        if (mcpServers.length > 0) {
            console.log(chalk.dim(`   MCP:  ${mcpServers.map(s => s.name).join(', ')}`));
        }
        console.log(chalk.dim('─'.repeat(60)));
        console.log('');
    }

    const stepStartTime = Date.now();

    const result = await executePipeline(team, prompt, {
        ollamaBaseUrl: options.ollamaUrl,
        onStepStart: (!options.quiet && !options.json)
            ? (idx, stepName, agentName) => {
                const stepNum = `${idx + 1}/${totalSteps}`;
                console.log(chalk.cyan(`  ▶ Step ${stepNum}: ${stepName}`));
                console.log(chalk.dim(`    Agent: ${agentName}`));
            }
            : undefined,
        onStepComplete: (!options.quiet && !options.json)
            ? (idx, stepName, stepResult) => {
                const icon = stepResult.status === 'completed' ? '✅'
                    : stepResult.status === 'skipped' ? '⏭️' : '❌';
                const tokenInfo = `${stepResult.usage.totalTokens} tokens · $${stepResult.usage.costEstimateUSD.toFixed(4)}`;
                const toolInfo = stepResult.toolCallLogs.length > 0 ? ` · ${stepResult.toolCallLogs.length} tool(s)` : '';
                console.log(chalk.dim(`    ${icon} ${tokenInfo}${toolInfo}`));
                if (stepResult.error) {
                    console.log(chalk.dim(chalk.yellow(`    ⚠ ${stepResult.error}`)));
                }
                console.log('');
            }
            : undefined,
        onStream: (!options.quiet && !options.json && options.stream !== false)
            ? (delta) => { process.stdout.write(delta); }
            : undefined,
        onToolCall: (!options.quiet && !options.json)
            ? (name, args) => {
                console.log(chalk.dim(`    🔧 ${name}(${JSON.stringify(args).slice(0, 80)})`));
            }
            : undefined,
    });

    const elapsed = ((Date.now() - stepStartTime) / 1000).toFixed(1);

    // Output
    if (options.json) {
        const jsonOutput = {
            team: team.name,
            mode: team.mode,
            steps: result.steps.map(s => ({
                step: s.stepName,
                agent: s.agentName,
                status: s.status,
                usage: s.usage,
                toolCalls: s.toolCallLogs,
                error: s.error,
            })),
            result: result.output,
            usage: result.usage,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
    } else if (options.stream === false || options.quiet) {
        console.log(result.output);
    } else {
        console.log('');
    }

    // Usage summary
    if (!options.quiet && !options.json) {
        const completedSteps = result.steps.filter(s => s.status === 'completed').length;
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.dim(
            `  Pipeline complete: ${completedSteps}/${totalSteps} steps · ` +
            `${result.usage.totalTokens} tokens · $${result.usage.costEstimateUSD.toFixed(4)} · ${elapsed}s`,
        ));
    }

    if (options.output) {
        writeFileSync(resolve(options.output), result.output, 'utf-8');
        if (!options.quiet && !options.json) {
            console.log(chalk.green(`  ✓ Saved to ${options.output}`));
        }
    }

    console.log('');
}

// ─── Parse & Run ─────────────────────────────────────────────────────────────

program.parse();
