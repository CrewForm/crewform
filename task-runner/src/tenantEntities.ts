// SPDX-License-Identifier: AGPL-3.0-or-later
import {supabase} from './supabase';
/** Configuration UUIDs do not confer authority to read privileged tenant records. */
export async function loadTenantEntities<T>(table: 'agents'|'custom_tools',workspaceId:string,ids:string[]):Promise<T[]> {
 const unique=[...new Set(ids)];
 if(!unique.length) return [];
 if(unique.length>100) throw new Error('Too many configured entities');
 const result=await supabase.from(table).select('*').eq('workspace_id',workspaceId).in('id',unique);
 if(result.error || result.data?.length!==unique.length || result.data.some(row=>row.workspace_id!==workspaceId)) throw new Error('Configured entity is unavailable in this workspace');
 return result.data as T[];
}
