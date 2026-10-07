-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Core orchestration and template sharing are community capabilities.
INSERT INTO public.plan_limits (plan, resource, max_value)
VALUES ('free', 'a2a_publish', 1), ('free', 'orchestrator', 1)
ON CONFLICT (plan, resource) DO UPDATE SET max_value = EXCLUDED.max_value;
