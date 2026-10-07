// SPDX-License-Identifier: AGPL-3.0-or-later
import type {Agent} from './types';
/** Public visitors receive explicitly granted read-only capabilities, not workspace tools. */
export function publicWidgetAgent(agent:Agent):Agent {
 const granted=Array.isArray(agent.config?.public_widget_tools) ? agent.config.public_widget_tools as string[] : [];
 const documents=agent.config?.knowledge_base_ids;
 const tools=(agent.tools??[]).filter(tool=>granted.includes(tool) && (tool==='grammar_check' || (tool==='knowledge_search' && Array.isArray(documents) && documents.length>0)));
 return {...agent,max_tokens:Math.min(agent.max_tokens??2048,2048),tools,fallback_model:null};
}
