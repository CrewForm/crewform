export type TaskStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
    id: string;
    workspace_id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigned_agent_id: string | null;
    assigned_team_id: string | null;
    result: string | null;
    error: string | null;
    metadata: Record<string, unknown> | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    claimed_by_runner: string | null;
}

export interface Agent {
    id: string;
    workspace_id: string;
    name: string;
    description: string;
    provider: 'Anthropic' | 'OpenAI' | 'Google' | 'Mistral' | 'Groq' | 'Cohere' | 'OpenRouter' | 'Ollama';
    model: string;
    system_prompt: string;
    temperature: number;
    max_tokens: number | null;
    tags: string[];
    tools: string[];
    fallback_model: string | null;
    output_route_ids: string[] | null;
    config: Record<string, unknown>;
}

export interface ApiKey {
    id: string;
    workspace_id: string;
    provider: string;
    encrypted_key: string;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costEstimateUSD: number;
}

// ─── Team Run Types ──────────────────────────────────────────────────────────

export type TeamRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface TeamRun {
    id: string;
    team_id: string;
    workspace_id: string;
    status: TeamRunStatus;
    input_task: string;
    output: string | null;
    current_step_idx: number | null;
    tokens_total: number;
    cost_estimate_usd: number;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    delegation_depth: number;
    created_by: string;
    created_at: string;
    updated_at: string;
    claimed_by_runner: string | null;
}

export interface PipelineStep {
    agent_id: string;
    step_name: string;
    instructions: string;
    expected_output: string;
    on_failure: 'retry' | 'stop' | 'skip';
    max_retries: number;
}

export interface PipelineConfig {
    steps: PipelineStep[];
    auto_handoff: boolean;
}

export interface OrchestratorConfig {
    brain_agent_id: string;
    worker_agent_ids: string[];
    quality_threshold: number;
    routing_strategy: string;
    planner_enabled: boolean;
    max_delegation_depth: number;
}

export type SpeakerSelection = 'round_robin' | 'llm_select' | 'facilitator';
export type TerminationCondition = 'consensus' | 'max_turns' | 'facilitator_decision';

export interface CollaborationConfig {
    agent_ids: string[];
    speaker_selection: SpeakerSelection;
    max_turns: number;
    termination_condition: TerminationCondition;
    consensus_phrase: string;
    facilitator_agent_id?: string;
}

export interface TeamConfig {
    mode: 'pipeline' | 'orchestrator' | 'collaboration';
    config: PipelineConfig | OrchestratorConfig | CollaborationConfig;
}

export interface TeamHandoffContext {
    input: string;
    previous_output: string | null;
    step_index: number;
    step_name: string;
    accumulated_outputs: string[];
    team_memories?: string[];
}

// ─── Orchestrator Types ──────────────────────────────────────────────────────

export type DelegationStatus = 'pending' | 'running' | 'completed' | 'revision_requested' | 'failed';

export interface Delegation {
    id: string;
    team_run_id: string;
    worker_agent_id: string;
    instruction: string;
    worker_output: string | null;
    status: DelegationStatus;
    revision_count: number;
    revision_feedback: string | null;
    quality_score: number | null;
    parent_delegation_id: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface OrchestratorToolCall {
    name: 'delegate_to_worker' | 'request_revision' | 'accept_result' | 'final_answer';
    arguments: Record<string, unknown>;
}
