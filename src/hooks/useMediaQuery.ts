// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'

/**
 * Hook that tracks whether a CSS media query matches.
 * Updates reactively when the viewport changes.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.matchMedia(query).matches
    })

    useEffect(() => {
        const mql = window.matchMedia(query)
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches)

        // Set initial value
        setMatches(mql.matches)

        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [query])

    return matches
}

/** True when viewport < 768px (xs/sm breakpoints) */
export function useIsMobile(): boolean {
    return useMediaQuery('(max-width: 767px)')
}

/** True when viewport 768px–1023px (md breakpoint) */
export function useIsTablet(): boolean {
    return useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
}

/** True when viewport >= 1024px (lg+ breakpoints) */
export function useIsDesktop(): boolean {
    return useMediaQuery('(min-width: 1024px)')
}
