// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function Privacy() {
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

                <h1 className="mb-2 text-3xl font-bold text-gray-100">Privacy Policy</h1>
                <p className="mb-8 text-sm text-gray-500">Last updated: March 12, 2026</p>

                <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-gray-300">
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">1. Information We Collect</h2>
                        <p>We collect information you provide directly to us, including:</p>
                        <ul className="ml-4 mt-2 list-disc space-y-1 text-gray-400">
                            <li><strong>Account information:</strong> email address, name, and password when you create an account</li>
                            <li><strong>Usage data:</strong> how you interact with the Service, including agents created, tasks executed, and feature usage</li>
                            <li><strong>Payment information:</strong> billing details processed securely by Stripe — we do not store your card number</li>
                            <li><strong>Device information:</strong> browser type, IP address, and device identifiers for security and analytics</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">2. How We Use Your Information</h2>
                        <p>We use collected information to:</p>
                        <ul className="ml-4 mt-2 list-disc space-y-1 text-gray-400">
                            <li>Provide, maintain, and improve the Service</li>
                            <li>Process transactions and send related communications</li>
                            <li>Send you technical notices, security alerts, and support messages</li>
                            <li>Respond to your comments, questions, and support requests</li>
                            <li>Monitor and analyze trends, usage, and activities</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">3. Data Storage &amp; Security</h2>
                        <p>
                            Your data is stored securely on Supabase infrastructure with encryption at rest
                            and in transit. We implement appropriate technical and organizational measures
                            to protect your personal data against unauthorized access, alteration,
                            disclosure, or destruction.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">4. Third-Party Services</h2>
                        <p>We use the following third-party services that may process your data:</p>
                        <ul className="ml-4 mt-2 list-disc space-y-1 text-gray-400">
                            <li><strong>Supabase:</strong> Database hosting and authentication</li>
                            <li><strong>Stripe:</strong> Payment processing</li>
                            <li><strong>Vercel:</strong> Application hosting</li>
                            <li><strong>Resend:</strong> Transactional email delivery</li>
                        </ul>
                        <p className="mt-2">
                            Each third-party service has its own privacy policy governing how they
                            handle your data.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">5. Data Retention</h2>
                        <p>
                            We retain your personal data for as long as your account is active or as
                            needed to provide you with the Service. You may request deletion of your
                            account and associated data at any time by contacting us.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">6. Your Rights</h2>
                        <p>Depending on your jurisdiction, you may have the right to:</p>
                        <ul className="ml-4 mt-2 list-disc space-y-1 text-gray-400">
                            <li>Access, correct, or delete your personal data</li>
                            <li>Object to or restrict processing of your data</li>
                            <li>Request portability of your data</li>
                            <li>Withdraw consent at any time</li>
                        </ul>
                        <p className="mt-2">
                            To exercise any of these rights, contact us at{' '}
                            <a href="mailto:team@crewform.tech" className="text-brand-primary hover:underline">
                                team@crewform.tech
                            </a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">7. Cookies</h2>
                        <p>
                            We use essential cookies for authentication and session management.
                            We do not use third-party advertising cookies. Analytics cookies, if used,
                            are privacy-respecting and do not track individuals across websites.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">8. Children&apos;s Privacy</h2>
                        <p>
                            The Service is not directed to individuals under 16. We do not knowingly
                            collect personal data from children. If we become aware that a child has
                            provided us with personal data, we will take steps to delete it.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">9. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you
                            of any changes by posting the new policy on this page and updating the
                            &quot;Last updated&quot; date.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-200">10. Contact Us</h2>
                        <p>
                            If you have questions about this Privacy Policy, please contact us at{' '}
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
