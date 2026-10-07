// SPDX-License-Identifier: AGPL-3.0-or-later
import {describe,it,expect} from 'vitest';
import type {Agent} from './types';
import {publicWidgetAgent} from './publicWidgetPolicy';
describe('public widget capability and output budgets',()=>{
 it('does not inherit private workspace tools or paid API fallback',()=>{
  const agent={tools:['custom:private','http_request','a2a_delegate','knowledge_search'],max_tokens:128000,fallback_model:'expensive',config:{}} as unknown as Agent;
  const publicAgent=publicWidgetAgent(agent);
  expect(publicAgent.tools).toEqual([]);expect(publicAgent.max_tokens).toBe(2048);expect(publicAgent.fallback_model).toBeNull();expect(agent.max_tokens).toBe(128000);
 });
 it('knowledge access requires both an explicit public grant and document scope',()=>{
  const agent={tools:['knowledge_search','custom:private'],max_tokens:1024,config:{public_widget_tools:['knowledge_search','custom:private']}} as unknown as Agent;
  expect(publicWidgetAgent(agent).tools).toEqual([]);
  agent.config.knowledge_base_ids=['document-fixture'];expect(publicWidgetAgent(agent).tools).toEqual(['knowledge_search']);expect(publicWidgetAgent(agent).max_tokens).toBe(1024);
 });
});
