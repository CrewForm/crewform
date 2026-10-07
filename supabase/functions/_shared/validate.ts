// SPDX-License-Identifier: AGPL-3.0-or-later
import { readJson } from './body.ts';
// Copyright (C) 2026 CrewForm

import { z } from 'https://esm.sh/zod@3.23.8';
import { badRequest } from './response.ts';

/**
 * Parse request body against a Zod schema.
 * Returns parsed data on success, or a 400 Response on failure.
 */
export async function validateBody<T extends z.ZodTypeAny>(
    req: Request,
    schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
    let body: unknown;
    try {
        body = await readJson(req);
    } catch {
        return { error: badRequest('Invalid JSON body') };
    }

    const result = schema.safeParse(body);
    if (!result.success) {
        const fieldErrors = result.error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
        }));
        return { error: badRequest('Validation failed', fieldErrors) };
    }

    return { data: result.data as z.infer<T> };
}

/** Re-export z for convenience */
export { z };
