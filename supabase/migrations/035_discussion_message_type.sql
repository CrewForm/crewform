-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 035_discussion_message_type.sql — Add 'discussion' to team_messages type CHECK
-- Required for Collaboration Mode discussion messages.

ALTER TABLE public.team_messages
  DROP CONSTRAINT team_messages_message_type_check,
  ADD CONSTRAINT team_messages_message_type_check
    CHECK (message_type IN (
      'delegation', 'handoff', 'broadcast', 'tool_call', 'result',
      'system', 'rejection', 'revision_request', 'discussion'
    ));
