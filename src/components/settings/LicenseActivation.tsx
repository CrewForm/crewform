// SPDX-License-Identifier: MIT
/** Retains old settings links without accepting activation keys. */
export function LicenseActivation() {
    return <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-100">MIT licence</h2>
        <p className="text-sm text-gray-300">All CrewForm features are free to use and self-host. No activation key is required.</p>
        <p className="text-sm text-gray-300">CrewForm Cloud plans cover hosted resources. Your AI provider usage remains separate.</p>
        <a className="text-sm text-brand-primary underline underline-offset-4" href="https://github.com/CrewForm/crewform/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Read the MIT licence</a>
    </div>
}
