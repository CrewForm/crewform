// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const buttonVariants = {
  default: 'bg-brand-primary text-black hover:bg-brand-hover',
  destructive: 'bg-status-error text-white hover:bg-red-600',
  outline: 'border border-border bg-transparent text-gray-200 hover:bg-surface-overlay',
  secondary: 'bg-surface-elevated text-gray-200 hover:bg-surface-overlay',
  ghost: 'text-gray-300 hover:bg-surface-overlay hover:text-gray-100',
  link: 'text-brand-primary underline-offset-4 hover:underline',
} as const

const buttonSizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
} as const

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-surface-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          buttonVariants[variant],
          buttonSizes[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button }
