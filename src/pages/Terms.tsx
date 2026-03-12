// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function Terms() {
    return (
        <div className="min-h-screen bg-surface-base px-4 py-16">
            <div className="mx-auto max-w-3xl">
                <Link
                    to="/"
                    className="mb-8 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                </Link>

                <h1 className="mb-2 text-3xl font-bold text-gray-100">Terms of Service</h1>
                <p className="mb-8 text-sm text-gray-500">Last updated: March 12, 2026</p>

                <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-gray-300">
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using CrewForm (&quot;the Service&quot;), operated by CrewForm
                            (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these
                            Terms of Service. If you do not agree to these terms, do not use the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">2. Description of Service</h2>
                        <p>
                            CrewForm is an AI agent management platform that allows users to create,
                            configure, and orchestrate AI agents and workflows. The Service is provided
                            on a subscription basis with free and paid tiers.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">3. User Accounts</h2>
                        <p>
                            You must provide accurate and complete information when creating an account.
                            You are responsible for maintaining the security of your account credentials
                            and for all activities that occur under your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">4. Subscriptions &amp; Billing</h2>
                        <p>
                            Paid features require a subscription. Subscriptions are billed in advance on a
                            monthly basis. You may cancel your subscription at any time; access continues
                            until the end of the current billing period. Refunds are handled on a
                            case-by-case basis at our discretion.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">5. Acceptable Use</h2>
                        <p>You agree not to:</p>
                        <ul className="ml-4 mt-2 list-disc space-y-1 text-gray-400">
                            <li>Use the Service for any unlawful purpose</li>
                            <li>Attempt to gain unauthorized access to any part of the Service</li>
                            <li>Interfere with or disrupt the Service&apos;s infrastructure</li>
                            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                            <li>Use the Service to transmit malicious code or harmful content</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">6. Intellectual Property</h2>
                        <p>
                            The Service and its original content, features, and functionality are owned by
                            CrewForm and are protected by international copyright, trademark, and other
                            intellectual property laws. You retain ownership of any data or content you
                            submit to the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">7. Limitation of Liability</h2>
                        <p>
                            To the fullest extent permitted by law, CrewForm shall not be liable for any
                            indirect, incidental, special, consequential, or punitive damages resulting
                            from your use of the Service. Our total liability shall not exceed the amount
                            you paid us in the 12 months preceding the claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">8. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate your account at any time for
                            violation of these terms. Upon termination, your right to use the Service
                            ceases immediately.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">9. Changes to Terms</h2>
                        <p>
                            We may modify these terms at any time. We will notify you of material changes
                            via email or through the Service. Continued use after changes constitutes
                            acceptance of the new terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">10. Contact</h2>
                        <p>
                            Questions about these Terms? Contact us at{' '}
                            <a href="mailto:team@crewform.tech" className="text-brand-primary hover:underline">
                                team@crewform.tech
                            </a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
