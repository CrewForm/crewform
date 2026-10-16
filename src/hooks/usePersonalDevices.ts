// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { fetchPersonalDevices } from '@/db/personalDevices'
export function usePersonalDevices(workspaceId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['personal-devices', workspaceId, user?.id],
    queryFn: () => {
      if (!workspaceId) throw new Error('Select a workspace')
      return fetchPersonalDevices(workspaceId)
    },
    enabled: !!workspaceId && !!user,
    refetchInterval: 5000,
  })
}
