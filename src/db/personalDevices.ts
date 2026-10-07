// SPDX-License-Identifier: AGPL-3.0-or-later
import { supabase } from '@/lib/supabase'
export interface PersonalDevice {
  id: string
  name: string
  runtime: string
  agent_ids: string[]
  approved_until: string
  revoked_at: string | null
  last_seen_at: string | null
  active_task_id: string | null
}
export async function fetchPersonalDevices(workspaceId: string): Promise<PersonalDevice[]> {
  const result = await supabase
    .from('personal_devices')
    .select('id,name,runtime,agent_ids,approved_until,revoked_at,last_seen_at,active_task_id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (result.error) throw result.error
  return result.data as PersonalDevice[]
}
export async function deviceRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(name, args)
  if (result.error) throw result.error
  return result.data as T
}
