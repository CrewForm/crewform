// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Core type definitions for CrewForm.
 *
 * Matches the SQL schema in supabase/migrations/ exactly.
 */

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  owner_id: string
  plan: WorkspacePlan
  is_beta: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type WorkspacePlan = 'free' | 'pro' | 'team' | 'enterprise'

// ─── Workspace Member ─────────────────────────────────────────────────────────

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  joined_at: string
}

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string // same as auth.users id
  display_name: string | null
  avatar_url: string | null
  timezone: string
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string
  workspace_id: string
  name: string
  description: string
  avatar_url: string | null
  model: string
  provider: string | null
  system_prompt: string
  temperature: number
  tools: string[]
  voice_profile: VoiceProfileInline | null
  voice_profile_id: string | null
  output_template_id: string | null
  status: AgentStatus
  config: Record<string, unknown>
  // Marketplace fields
  is_published: boolean
  marketplace_tags: string[]
  install_count: number
  rating_avg: number
  price_cents: number | null // null or 0 = free, >0 = paid (USD cents)
  created_at: string
  updated_at: string
}

export type AgentStatus = 'idle' | 'busy' | 'offline'

/** Inline voice profile stored as JSONB on the agent (legacy/simple usage) */
export interface VoiceProfileInline {
  tone?: VoiceProfileTone
  custom_instructions?: string
  output_format_hints?: string
}

// ─── Voice Profile (standalone) ───────────────────────────────────────────────

export type VoiceProfileTone = 'formal' | 'casual' | 'technical' | 'creative' | 'empathetic' | 'custom'

export interface VoiceProfile {
  id: string
  workspace_id: string
  name: string
  tone: VoiceProfileTone
  custom_instructions: string | null
  output_format_hints: string | null
  is_template: boolean
  created_at: string
  updated_at: string
}

// ─── Output Template ──────────────────────────────────────────────────────────

export type OutputTemplateType = 'markdown' | 'json' | 'html' | 'csv' | 'custom'

export interface OutputTemplate {
  id: string
  workspace_id: string
  name: string
  template_type: OutputTemplateType
  body: string
  variables: Record<string, unknown>[]
  is_builtin: boolean
  created_at: string
  updated_at: string
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export interface Team {
  id: string
  workspace_id: string
  name: string
  description: string
  mode: TeamMode
  config: PipelineConfig | OrchestratorConfig | CollaborationConfig
  created_at: string
  updated_at: string
}

export type TeamMode = 'pipeline' | 'orchestrator' | 'collaboration'

export interface PipelineConfig {
  steps: PipelineStep[]
  auto_handoff: boolean
}

export interface PipelineStep {
  agent_id: string
  step_name: string
  instructions: string
  expected_output: string
  on_failure: 'retry' | 'stop' | 'skip'
  max_retries: number
  reviewer_agent_id?: string
  type?: 'sequential' | 'fan_out'
  parallel_agents?: string[]
  merge_agent_id?: string
  fan_out_failure?: 'fail_fast' | 'continue_on_partial'
  merge_instructions?: string
}

export interface OrchestratorConfig {
  brain_agent_id: string
  worker_agent_ids?: string[]
  quality_threshold: number
  routing_strategy: string
  planner_enabled: boolean
  max_delegation_depth: number
}

export interface CollaborationConfig {
  agent_ids: string[]
  speaker_selection: string
  max_turns: number
  termination_condition: string
  consensus_phrase: string
  facilitator_agent_id?: string
}

// ─── Team Member ──────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  team_id: string
  agent_id: string
  role: TeamMemberRole
  position: number
  config: Record<string, unknown>
}

export type TeamMemberRole = 'orchestrator' | 'worker' | 'reviewer'

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: string
  workspace_id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigned_agent_id: string | null
  assigned_team_id: string | null
  result: Record<string, unknown> | null
  error: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
  claimed_by_runner: string | null
  scheduled_for: string | null
}

export type TaskStatus = 'pending' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

// ─── Agent Task (execution record) ───────────────────────────────────────────

export interface AgentTask {
  id: string
  task_id: string
  agent_id: string
  workspace_id: string
  status: TaskStatus
  session_key: string | null
  result: Record<string, unknown> | null
  error_message: string | null
  tokens_used: number
  cost_estimate_usd: number
  model_used: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Team Run ─────────────────────────────────────────────────────────────────

export type TeamRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface TeamRun {
  id: string
  team_id: string
  workspace_id: string
  status: TeamRunStatus
  input_task: string
  output: string | null
  current_step_idx: number | null
  delegation_depth: number | null
  tokens_total: number
  cost_estimate_usd: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_by: string
  created_at: string
  updated_at: string
  claimed_by_runner: string | null
}

// ─── Team Message ─────────────────────────────────────────────────────────────

export type TeamMessageType =
  | 'delegation'
  | 'handoff'
  | 'broadcast'
  | 'tool_call'
  | 'result'
  | 'discussion'
  | 'system'
  | 'rejection'
  | 'revision_request'

export interface TeamMessage {
  id: string
  run_id: string
  sender_agent_id: string | null
  receiver_agent_id: string | null
  message_type: TeamMessageType
  content: string
  metadata: Record<string, unknown>
  step_idx: number | null
  tokens_used: number
  created_at: string
}

// ─── Team Handoff ─────────────────────────────────────────────────────────────

export type HandoffDirection = 'forward' | 'backward'

export interface TeamHandoff {
  id: string
  run_id: string
  from_agent_id: string | null
  to_agent_id: string
  direction: HandoffDirection
  context: Record<string, unknown>
  feedback_reason: string | null
  step_idx: number | null
  created_at: string
}

// ─── Team Memory (Phase 3 stub) ──────────────────────────────────────────────

export interface TeamMemory {
  id: string
  team_id: string
  run_id: string | null
  content: string
  embedding: number[] | null // pgvector
  metadata: Record<string, unknown>
  created_at: string
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  workspace_id: string
  provider: string
  encrypted_key: string
  key_hint: string
  is_valid: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Usage Record ─────────────────────────────────────────────────────────────

export type UsageEventType = 'task_execution' | 'team_run' | 'api_call' | 'storage' | 'marketplace_install'

export interface UsageRecord {
  id: string
  workspace_id: string
  event_type: UsageEventType
  tokens_used: number
  cost_usd: number
  agent_id: string | null
  task_id: string | null
  team_run_id: string | null
  metadata: Record<string, unknown>
  recorded_at: string
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  workspace_id: string
  actor_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export type ProviderBillingModel = 'per-token' | 'subscription-quota' | 'unknown'

// ─── Agent Install ───────────────────────────────────────────────────────────────────

export interface AgentInstall {
  id: string
  agent_id: string
  workspace_id: string
  installed_by: string | null
  source_workspace_id: string | null
  cloned_agent_id: string | null
  installed_at: string
}

// ─── Agent Review ────────────────────────────────────────────────────────────────────

export interface AgentReview {
  id: string
  agent_id: string
  workspace_id: string
  user_id: string
  rating: number
  review_text: string
  created_at: string
  updated_at: string
}

// ─── Database row types (for Supabase typed client) ──────────────────────

export type WorkspaceRow = Workspace
export type WorkspaceMemberRow = WorkspaceMember
export type UserProfileRow = UserProfile
export type AgentRow = Agent
export type TeamRow = Team
export type TeamMemberRow = TeamMember
export type TaskRow = Task
export type AgentTaskRow = AgentTask
export type TeamRunRow = TeamRun
export type TeamMessageRow = TeamMessage
export type TeamHandoffRow = TeamHandoff
export type TeamMemoryRow = TeamMemory
export type ApiKeyRow = ApiKey
export type VoiceProfileRow = VoiceProfile
export type OutputTemplateRow = OutputTemplate
export type UsageRecordRow = UsageRecord
export type AuditLogRow = AuditLog
export type AgentInstallRow = AgentInstall
export type AgentReviewRow = AgentReview

// ─── Custom Tools ─────────────────────────────────────────────────────────────

export interface CustomToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
}

export interface CustomTool {
  id: string
  workspace_id: string
  name: string
  description: string
  parameters: {
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
  webhook_url: string
  webhook_headers: Record<string, string>
  created_at: string
  updated_at: string
}

export type CustomToolRow = CustomTool

