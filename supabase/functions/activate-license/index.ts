// SPDX-License-Identifier: MIT
// Compatibility endpoint: software activation and licence sales are retired.
import { handleCors } from '../_shared/cors.ts';
Deno.serve((req: Request) => handleCors(req) ?? new Response(JSON.stringify({
    error: 'Software activation is no longer required. All CrewForm features are available under MIT; only CrewForm Cloud hosting is paid.',
}), {status: 410, headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}}));
