-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 065_feature_tier_limits.sql — Add plan limits for Knowledge Base and A2A publishing

INSERT INTO public.plan_limits (plan, resource, max_value) VALUES
    -- Knowledge Base document limits
    ('free', 'knowledge_documents', 3),
    ('pro', 'knowledge_documents', 25),
    ('team', 'knowledge_documents', -1),
    ('enterprise', 'knowledge_documents', -1),

    -- A2A publishing (0 = disabled, 1 = enabled feature flag)
    ('free', 'a2a_publish', 0),
    ('pro', 'a2a_publish', 1),
    ('team', 'a2a_publish', 1),
    ('enterprise', 'a2a_publish', 1)
ON CONFLICT DO NOTHING;
