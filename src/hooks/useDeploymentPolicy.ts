// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
/** Server-owned policy, never inferred from a browser flag or hostname. */
export function useDeploymentPolicy() {
    return useQuery({
        queryKey: ['deployment-policy'],
        queryFn: async () => {
            const result: {data: unknown; error: {message: string} | null} = await supabase.rpc('get_deployment_policy')
            if (result.error) throw new Error(result.error.message)
            const policy = result.data as { hosted?: unknown } | null
            if (typeof policy?.hosted !== 'boolean') throw new Error('Hosting configuration is unavailable')
            return { hosted: policy.hosted }
        },
        staleTime: 5 * 60 * 1000,
    })
}
