// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Feedback Edge Function
 *
 * Receives user feedback from the in-app widget and routes it to GitHub:
 *   - Bug     → GitHub Issue (label: bug, user-feedback)
 *   - Idea    → GitHub Discussion (Ideas category)
 *   - Thought → GitHub Discussion (General category)
 *   - Love    → GitHub Discussion (Show and Tell category)
 *
 * Auth: Supabase JWT (logged-in users only).
 * Env: GITHUB_FEEDBACK_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME,
 *       GITHUB_REPO_ID, GITHUB_DISCUSSION_CATEGORY_IDS (JSON map)
 */

import { handleCors } from '../_shared/cors.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { ok, badRequest, methodNotAllowed, serverError, unauthorized } from '../_shared/response.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

const FeedbackCategory = z.enum(['bug', 'idea', 'thought', 'love']);
type FeedbackCategoryType = z.infer<typeof FeedbackCategory>;

const FeedbackSchema = z.object({
    category: FeedbackCategory,
    message: z.string().min(5, 'Message must be at least 5 characters').max(5000),
    email: z.string().email().optional(),
});

// ─── GitHub helpers ─────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    repoId: string;
    discussionCategoryIds: Record<string, string>;
}

function getGitHubConfig(): GitHubConfig {
    const token = Deno.env.get('GITHUB_FEEDBACK_TOKEN');
    if (!token) throw new Error('GITHUB_FEEDBACK_TOKEN is not configured');

    const owner = Deno.env.get('GITHUB_REPO_OWNER') ?? 'vincentgrobler';
    const repo = Deno.env.get('GITHUB_REPO_NAME') ?? 'crewform';
    const repoId = Deno.env.get('GITHUB_REPO_ID') ?? '';

    // Category IDs for GitHub Discussions — JSON map like:
    // {"ideas":"DIC_xxx","general":"DIC_yyy","show_and_tell":"DIC_zzz"}
    let discussionCategoryIds: Record<string, string> = {};
    const catIdsRaw = Deno.env.get('GITHUB_DISCUSSION_CATEGORY_IDS');
    if (catIdsRaw) {
        try {
            discussionCategoryIds = JSON.parse(catIdsRaw);
        } catch { /* use empty */ }
    }

    return { token, owner, repo, repoId, discussionCategoryIds };
}

/** Create a GitHub Issue (for bugs) */
async function createGitHubIssue(
    config: GitHubConfig,
    title: string,
    body: string,
    labels: string[],
): Promise<{ url: string; number: number }> {
    const res = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/issues`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ title, body, labels }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`GitHub Issue API error ${res.status}: ${errBody}`);
    }

    const data = await res.json() as { html_url: string; number: number };
    return { url: data.html_url, number: data.number };
}

/** Create a GitHub Discussion (for ideas/thoughts/love) */
async function createGitHubDiscussion(
    config: GitHubConfig,
    title: string,
    body: string,
    categoryId: string,
): Promise<{ url: string; number: number }> {
    if (!config.repoId) {
        throw new Error('GITHUB_REPO_ID is required for creating discussions');
    }

    const query = `
        mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
            createDiscussion(input: {
                repositoryId: $repoId,
                categoryId: $categoryId,
                title: $title,
                body: $body
            }) {
                discussion {
                    url
                    number
                }
            }
        }
    `;

    const res = await fetch(GITHUB_GRAPHQL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            variables: { repoId: config.repoId, categoryId, title, body },
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`GitHub GraphQL API error ${res.status}: ${errBody}`);
    }

    const result = await res.json() as {
        data?: { createDiscussion?: { discussion?: { url: string; number: number } } };
        errors?: { message: string }[];
    };

    if (result.errors?.length) {
        throw new Error(`GitHub GraphQL error: ${result.errors[0].message}`);
    }

    const discussion = result.data?.createDiscussion?.discussion;
    if (!discussion) {
        throw new Error('Discussion creation returned no data');
    }

    return { url: discussion.url, number: discussion.number };
}

// ─── Category metadata ─────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<FeedbackCategoryType, {
    titlePrefix: string;
    labels?: string[];
    discussionCategory?: string; // key in GITHUB_DISCUSSION_CATEGORY_IDS
}> = {
    bug: {
        titlePrefix: '🐛 Bug Report',
        labels: ['bug', 'user-feedback'],
    },
    idea: {
        titlePrefix: '💡 Feature Idea',
        discussionCategory: 'ideas',
    },
    thought: {
        titlePrefix: '💬 Thought',
        discussionCategory: 'general',
    },
    love: {
        titlePrefix: '❤️ Love',
        discussionCategory: 'show_and_tell',
    },
};

// ─── Rate Limiter (in-memory, per-isolate) ──────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10; // max 10 feedback per hour per user

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(userId, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count++;
    return true;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method !== 'POST') {
        return methodNotAllowed();
    }

    try {
        // ── Auth (JWT only — this is for logged-in app users) ───────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return unauthorized('Authentication required');
        }

        // We don't need to fully resolve workspace context — just extract the
        // token to validate the user and get their email for the report.
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return unauthorized('Invalid or expired session');
        }

        // ── Rate limit ──────────────────────────────────────────────────
        if (!checkRateLimit(user.id)) {
            return new Response(
                JSON.stringify({ error: 'Rate limit exceeded. Maximum 10 feedback submissions per hour.' }),
                { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
            );
        }

        // ── Validate body ───────────────────────────────────────────────
        const parsed = await validateBody(req, FeedbackSchema);
        if ('error' in parsed) return parsed.error;

        const { category, message, email } = parsed.data;
        const userEmail = email ?? user.email ?? 'unknown';
        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
        const displayName = (typeof metadata.full_name === 'string' ? metadata.full_name : null)
            ?? (typeof metadata.name === 'string' ? metadata.name : null)
            ?? userEmail;

        // ── Build title and body ────────────────────────────────────────
        const catConfig = CATEGORY_CONFIG[category];
        const title = `${catConfig.titlePrefix} from ${displayName}`;

        const bodyParts = [
            message,
            '',
            '---',
            '',
            `**Submitted by:** ${displayName} (${userEmail})`,
            `**Category:** ${category}`,
            `**Date:** ${new Date().toISOString()}`,
            `**Source:** In-app feedback widget`,
        ];
        const body = bodyParts.join('\n');

        // ── Route to GitHub ─────────────────────────────────────────────
        const ghConfig = getGitHubConfig();
        let result: { url: string; number: number };

        if (category === 'bug') {
            // Bugs → GitHub Issues
            result = await createGitHubIssue(ghConfig, title, body, catConfig.labels ?? []);
        } else {
            // Ideas, Thoughts, Love → GitHub Discussions
            const discussionCatKey = catConfig.discussionCategory;
            if (!discussionCatKey) {
                return serverError(`No discussion category configured for '${category}'`);
            }

            const categoryId = ghConfig.discussionCategoryIds[discussionCatKey];
            if (!categoryId) {
                // Fallback: create as an issue with a different label if discussions aren't configured
                result = await createGitHubIssue(ghConfig, title, body, [`${category}`, 'user-feedback']);
            } else {
                result = await createGitHubDiscussion(ghConfig, title, body, categoryId);
            }
        }

        return ok({
            success: true,
            category,
            github_url: result.url,
            message: 'Thank you! Your feedback has been submitted.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[feedback] Error:', message);
        return serverError(message);
    }
});
