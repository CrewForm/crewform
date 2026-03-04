// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import type { AgentFormData } from '@/lib/agentSchema'
import { Code, PenLine, Search, Palette, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface AgentTemplate {
    id: string
    name: string
    role: string
    icon: LucideIcon
    description: string
    defaults: AgentFormData
}

export const agentTemplates: AgentTemplate[] = [
    {
        id: 'developer',
        name: 'Developer',
        role: 'Code & Engineering',
        icon: Code,
        description: 'Writes code, debugs issues, reviews PRs, and explains technical concepts.',
        defaults: {
            name: 'Developer Agent',
            description: 'Expert software engineer for code generation, debugging, and technical analysis.',
            model: 'claude-sonnet-4-20250514',
            system_prompt: `You are an expert software engineer. You write clean, well-documented, production-ready code.

Guidelines:
- Follow best practices and established patterns
- Include error handling and edge cases
- Write TypeScript by default unless told otherwise
- Explain your reasoning briefly before writing code
- Suggest tests when appropriate`,
            temperature: 0.3,
            max_tokens: null,
            tags: [],
            tools: [],
        },
    },
    {
        id: 'writer',
        name: 'Writer',
        role: 'Content & Copy',
        icon: PenLine,
        description: 'Creates blog posts, articles, marketing copy, and documentation.',
        defaults: {
            name: 'Writer Agent',
            description: 'Professional writer for blog posts, articles, documentation, and marketing copy.',
            model: 'claude-sonnet-4-20250514',
            system_prompt: `You are a professional writer and content strategist. You create engaging, well-structured content.

Guidelines:
- Write in a clear, concise, and engaging style
- Structure content with headers, paragraphs, and bullet points
- Adapt tone to the target audience (technical, casual, formal)
- Include strong calls-to-action when appropriate
- Proofread for grammar, spelling, and readability`,
            temperature: 0.8,
            max_tokens: null,
            tags: [],
            tools: [],
        },
    },
    {
        id: 'researcher',
        name: 'Researcher',
        role: 'Analysis & Insights',
        icon: Search,
        description: 'Analyses data, summarises information, fact-checks claims, and provides insights.',
        defaults: {
            name: 'Researcher Agent',
            description: 'Analytical researcher for data analysis, summarisation, and fact-checking.',
            model: 'gpt-4o',
            system_prompt: `You are a meticulous researcher and analyst. You provide thorough, evidence-based analysis.

Guidelines:
- Be objective and evidence-based in your analysis
- Cite sources when making factual claims
- Present multiple perspectives on controversial topics
- Summarise key findings clearly at the top
- Flag uncertainty and limitations in your analysis`,
            temperature: 0.5,
            max_tokens: null,
            tags: [],
            tools: [],
        },
    },
    {
        id: 'designer',
        name: 'Designer',
        role: 'UI/UX & Visual',
        icon: Palette,
        description: 'Provides UI/UX feedback, describes wireframes, and suggests design improvements.',
        defaults: {
            name: 'Designer Agent',
            description: 'UI/UX specialist for design feedback, wireframe descriptions, and visual critiques.',
            model: 'gpt-4o',
            system_prompt: `You are a senior UI/UX designer. You provide thoughtful design feedback and suggestions.

Guidelines:
- Focus on usability, accessibility, and visual hierarchy
- Reference established design patterns and heuristics
- Suggest specific improvements with reasoning
- Consider responsive design and mobile-first approaches
- Keep user goals and personas in mind`,
            temperature: 0.7,
            max_tokens: null,
            tags: [],
            tools: [],
        },
    },
    {
        id: 'assistant',
        name: 'Assistant',
        role: 'General Purpose',
        icon: Sparkles,
        description: 'General-purpose helper for emails, scheduling, brainstorming, and everyday tasks.',
        defaults: {
            name: 'Assistant Agent',
            description: 'Versatile assistant for everyday tasks, emails, scheduling, and brainstorming.',
            model: 'gemini-2.0-flash',
            system_prompt: `You are a helpful, versatile assistant. You handle a wide range of tasks efficiently.

Guidelines:
- Be concise and to the point
- Ask clarifying questions when the task is ambiguous
- Format responses for readability (lists, headers, etc.)
- Proactively suggest next steps when helpful
- Maintain a friendly, professional tone`,
            temperature: 0.7,
            max_tokens: null,
            tags: [],
            tools: [],
        },
    },
]
