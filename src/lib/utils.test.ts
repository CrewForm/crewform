// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn utility', () => {
  it('merges class names', () => {
    const result = cn('text-sm', 'font-bold')
    expect(result).toBe('text-sm font-bold')
  })

  it('handles undefined and empty values', () => {
    const result = cn('base', undefined, '', 'visible')
    expect(result).toBe('base visible')
  })

  it('merges conflicting tailwind classes', () => {
    const result = cn('px-4', 'px-6')
    expect(result).toBe('px-6')
  })
})
