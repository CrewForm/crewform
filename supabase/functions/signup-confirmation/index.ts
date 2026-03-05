// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Signup Confirmation Edge Function
 *
 * Triggered by a Supabase Database Webhook on auth.users INSERT.
 * Sends a branded welcome email via Resend.
 *
 * Setup:
 * 1. Configure Supabase Database Webhook:
 *    - Table: auth.users
 *    - Events: INSERT
 *    - Function: signup-confirmation
 * 2. Set environment vars in Supabase Dashboard → Edge Functions:
 *    - RESEND_API_KEY: your Resend API key
 *    - RESEND_FROM_ADDRESS: e.g. "CrewForm <noreply@crewform.tech>"
 */

import { handleCors } from '../_shared/cors.ts';
import { ok, serverError } from '../_shared/response.ts';

interface WebhookPayload {
    type: 'INSERT';
    table: string;
    record: {
        id: string;
        email: string;
        raw_user_meta_data?: {
            full_name?: string;
            name?: string;
        };
        created_at: string;
    };
}

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    try {
        const payload = (await req.json()) as WebhookPayload;
        const { record } = payload;

        if (!record?.email) {
            return ok({ skipped: true, reason: 'No email in record' });
        }

        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!resendKey) {
            console.error('[signup-confirmation] RESEND_API_KEY not set');
            return ok({ skipped: true, reason: 'Resend not configured' });
        }

        const fromAddress = Deno.env.get('RESEND_FROM_ADDRESS') ?? 'CrewForm <noreply@crewform.tech>';
        const userName = record.raw_user_meta_data?.full_name
            ?? record.raw_user_meta_data?.name
            ?? record.email.split('@')[0];

        // Send branded welcome email via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [record.email],
                subject: 'Welcome to CrewForm — Your AI crew awaits 🚀',
                html: buildWelcomeEmail(userName),
            }),
        });

        if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error(`[signup-confirmation] Resend error: ${errBody}`);
            return serverError(`Failed to send welcome email: ${errBody}`);
        }

        console.log(`[signup-confirmation] Welcome email sent to ${record.email}`);
        return ok({ success: true, email: record.email });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[signup-confirmation] Error: ${message}`);
        return serverError(message);
    }
});

// ─── Email Template ──────────────────────────────────────────────────────────

function buildWelcomeEmail(userName: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to CrewForm</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0D0F1A; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0D0F1A; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #141828; border-radius: 16px; border: 1px solid #2E3450; overflow: hidden;">
                    <!-- Header with gradient -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #5B6EF5, #8B5CF6); padding: 40px 40px 32px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">
                                CrewForm
                            </h1>
                            <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.85);">
                                AI Orchestration for Everyone
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #FFFFFF;">
                                Welcome, ${userName}! 👋
                            </h2>
                            <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #9CA3AF;">
                                Your account is ready. CrewForm lets you build, manage, and deploy AI agents and multi-agent teams — all from one platform.
                            </p>

                            <!-- Feature highlights -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 12px 16px; background-color: #1C2035; border-radius: 10px; margin-bottom: 8px;">
                                        <p style="margin: 0; font-size: 13px; color: #D1D5DB;">
                                            🤖 <strong style="color: #FFFFFF;">Create AI Agents</strong> — Configure models, tools, and prompts
                                        </p>
                                    </td>
                                </tr>
                                <tr><td style="height: 8px;"></td></tr>
                                <tr>
                                    <td style="padding: 12px 16px; background-color: #1C2035; border-radius: 10px;">
                                        <p style="margin: 0; font-size: 13px; color: #D1D5DB;">
                                            🔗 <strong style="color: #FFFFFF;">Build Teams</strong> — Pipeline, Orchestrator, and Collaboration modes
                                        </p>
                                    </td>
                                </tr>
                                <tr><td style="height: 8px;"></td></tr>
                                <tr>
                                    <td style="padding: 12px 16px; background-color: #1C2035; border-radius: 10px;">
                                        <p style="margin: 0; font-size: 13px; color: #D1D5DB;">
                                            🔑 <strong style="color: #FFFFFF;">Bring Your Own Keys</strong> — Zero markup on LLM costs
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="https://app.crewform.tech" style="display: inline-block; padding: 14px 32px; background: linear-gradient(90deg, #5B6EF5, #9333EA); color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 12px;">
                                            Get Started →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px 32px; border-top: 1px solid #2E3450;">
                            <p style="margin: 0; font-size: 12px; color: #4B5563; text-align: center;">
                                Questions? Reply to this email or reach us at
                                <a href="mailto:team@crewform.tech" style="color: #5B6EF5; text-decoration: none;">team@crewform.tech</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 11px; color: #374151; text-align: center;">
                                CrewForm · crewform.tech · Open Source AI Orchestration
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}
