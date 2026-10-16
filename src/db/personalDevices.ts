// SPDX-License-Identifier: MIT
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
  pipeline_busy?: boolean
}
export async function fetchPersonalDevices(workspaceId: string): Promise<PersonalDevice[]> {
  const result = await supabase
    .from('personal_devices')
    .select('id,name,runtime,agent_ids,approved_until,revoked_at,last_seen_at,active_task_id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (result.error) throw result.error
  const jobs = await supabase.from('personal_pipeline_jobs').select('device_id').eq('workspace_id',workspaceId).eq('status','running')
  if (jobs.error) throw jobs.error
  const busy = new Set(jobs.data.map(job=>job.device_id as string))
  return (result.data as PersonalDevice[]).map(device=>({...device,pipeline_busy:busy.has(device.id)}))
}
export async function deviceRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(name, args)
  if (result.error) throw result.error
  return result.data as T
}
