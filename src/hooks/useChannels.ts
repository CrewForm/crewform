// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useEffect, useState } from 'react'
import { fetchRoutes, type OutputRoute } from '@/db/webhooks'
import { useWorkspace } from '@/hooks/useWorkspace'

export function useOutputRoutes() {
    const { workspace } = useWorkspace()
    const [routes, setRoutes] = useState<OutputRoute[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!workspace?.id) return
        setLoading(true)
        fetchRoutes(workspace.id)
            .then((data) => setRoutes(data.filter((r) => r.is_active)))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [workspace?.id])

    return { routes, loading }
}
