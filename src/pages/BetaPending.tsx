// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useAuth } from '@/hooks/useAuth'
import { Clock, LogOut, Rocket } from 'lucide-react'

/**
 * Shown to beta users who have signed up but are not yet approved.
 * Once an admin sets beta_approved = true in their user_metadata, the
 * AuthGuard will let them through to the main app.
 */
export function BetaPending() {
    const { signOut } = useAuth()

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950 px-4">
            {/* Ambient glow */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-1/3 top-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
                <div className="absolute bottom-1/4 right-1/3 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-white/10">
                    <Rocket className="h-10 w-10 text-blue-400" />
                </div>

                {/* Heading */}
                <h1 className="mb-3 text-3xl font-bold text-white">
                    You're on the list!
                </h1>

                <p className="mb-8 text-base leading-relaxed text-gray-400">
                    Thanks for joining the <span className="font-semibold text-blue-400">CrewForm</span> beta.
                    We're reviewing applications and will notify you by email once your access is approved.
                </p>

                {/* Status card */}
                <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-center gap-3 text-sm">
                        <Clock className="h-4 w-4 text-amber-400" />
                        <span className="font-medium text-amber-300">Pending approval</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        You'll receive an email at the address you signed up with once your account is activated.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-center gap-3">
                    <a
                        href="https://discord.gg/TAFasJCTWs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                    >
                        Join our Discord
                    </a>
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-300"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    )
}
