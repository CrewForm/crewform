// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Beta Approved Edge Function
 *
 * Called by the admin panel when a beta user is approved.
 * Sends a branded "You're in!" email via Resend.
 *
 * Endpoint: POST /functions/v1/beta-approved
 * Body: { "email": "...", "full_name": "..." }
 *
 * Env vars required:
 *   - RESEND_API_KEY
 *   - RESEND_FROM_ADDRESS (optional, defaults to CrewForm <noreply@crewform.tech>)
 */

import { handleCors } from '../_shared/cors.ts';
import { ok, badRequest, serverError } from '../_shared/response.ts';

interface ApprovalPayload {
    email: string;
    full_name?: string;
}

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    try {
        const payload = (await req.json()) as ApprovalPayload;

        if (!payload.email) {
            return badRequest('Missing email field');
        }

        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!resendKey) {
            console.error('[beta-approved] RESEND_API_KEY not set');
            return ok({ skipped: true, reason: 'Resend not configured' });
        }

        const fromAddress = Deno.env.get('RESEND_FROM_ADDRESS') ?? 'CrewForm <noreply@crewform.tech>';
        const userName = payload.full_name || payload.email.split('@')[0];

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [payload.email],
                subject: 'You\'re in! Your CrewForm beta access is approved 🎉',
                html: buildApprovalEmail(userName),
            }),
        });

        if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error(`[beta-approved] Resend error: ${errBody}`);
            return serverError(`Failed to send approval email: ${errBody}`);
        }

        console.log(`[beta-approved] Approval email sent to ${payload.email}`);
        return ok({ success: true, email: payload.email });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[beta-approved] Error: ${message}`);
        return serverError(message);
    }
});

// ─── Email Template ──────────────────────────────────────────────────────────

function buildApprovalEmail(userName: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beta Access Approved</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0D0F1A; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0D0F1A; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #141828; border-radius: 16px; border: 1px solid #2E3450; overflow: hidden;">
                    <!-- Header with gradient -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #10B981, #5B6EF5); padding: 40px 40px 32px; text-align: center;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">
                                You're In! 🎉
                            </h1>
                            <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.85);">
                                Your CrewForm beta access has been approved
                            </p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #FFFFFF;">
                                Hey ${userName}! 👋
                            </h2>
                            <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #9CA3AF;">
                                Great news — your CrewForm beta access has been approved! You can now log in and start building your AI crew.
                            </p>

                            <!-- What you can do -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 12px 16px; background-color: #1C2035; border-radius: 10px; margin-bottom: 8px;">
                                        <p style="margin: 0; font-size: 13px; color: #D1D5DB;">
                                            🤖 <strong style="color: #FFFFFF;">Create AI Agents</strong> — Configure models, prompts, and connect your own API keys
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
                                            📊 <strong style="color: #FFFFFF;">Real-Time Dashboard</strong> — Track tasks, costs, and performance at a glance
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="https://app.crewform.tech" style="display: inline-block; padding: 14px 32px; background: linear-gradient(90deg, #10B981, #5B6EF5); color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 12px;">
                                            Start Building →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.6; color: #6B7280; text-align: center;">
                                As a beta tester, your feedback is invaluable. If you run into any issues or have suggestions, don't hesitate to reach out.
                            </p>
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
