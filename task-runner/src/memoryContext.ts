// SPDX-License-Identifier: MIT
export function buildMemoryContext(memories: string[]): string {
    if (memories.length === 0) return '';

    const formatted = memories
        .map((m, i) => `${i + 1}. ${m}`)
        .join('\n\n');

    return `\n\n## Team Memory\nThe following are relevant past outputs from this team. Use them as context to improve your response:\n\n${formatted}`;
}

