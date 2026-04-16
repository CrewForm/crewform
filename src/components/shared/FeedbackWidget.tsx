// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Send, MessageCircleHeart, Bug, Lightbulb, MessageCircle, Heart, Check, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// ─── Category Config ────────────────────────────────────────────────────────

type FeedbackCategory = 'bug' | 'idea' | 'thought' | 'love'

interface CategoryMeta {
  id: FeedbackCategory
  label: string
  icon: typeof Bug
  emoji: string
  title: string
  subtitle: string
  placeholder: string
  gradient: string
  accentColor: string
  borderColor: string
  bgGlow: string
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'bug',
    label: 'Bug',
    icon: Bug,
    emoji: '🐛',
    title: "Let's squash it!",
    subtitle: 'The more detail, the faster we fix it',
    placeholder: 'What happened? Steps to reproduce help a ton...',
    gradient: 'from-red-500/80 via-rose-500/60 to-orange-400/40',
    accentColor: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgGlow: 'rgba(239, 68, 68, 0.08)',
  },
  {
    id: 'idea',
    label: 'Idea',
    icon: Lightbulb,
    emoji: '💡',
    title: 'Dream big!',
    subtitle: 'Paint us a picture of your ideal feature',
    placeholder: 'Describe your dream feature in detail...',
    gradient: 'from-amber-500/80 via-orange-400/60 to-yellow-400/40',
    accentColor: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgGlow: 'rgba(245, 158, 11, 0.08)',
  },
  {
    id: 'thought',
    label: 'Thought',
    icon: MessageCircle,
    emoji: '💬',
    title: "We're all ears!",
    subtitle: 'Every thought helps us get better',
    placeholder: "What's on your mind? We'd love to hear it...",
    gradient: 'from-blue-500/80 via-indigo-500/60 to-cyan-400/40',
    accentColor: 'text-blue-400',
    borderColor: 'border-blue-500/40',
    bgGlow: 'rgba(59, 130, 246, 0.08)',
  },
  {
    id: 'love',
    label: 'Love',
    icon: Heart,
    emoji: '❤️',
    title: 'You made our day!',
    subtitle: 'Tell us what you love about CrewForm',
    placeholder: 'What do you love most? We appreciate it!',
    gradient: 'from-pink-500/80 via-rose-400/60 to-fuchsia-400/40',
    accentColor: 'text-pink-400',
    borderColor: 'border-pink-500/40',
    bgGlow: 'rgba(236, 72, 153, 0.08)',
  },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function FeedbackWidget() {
  const { user, session } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory>('thought')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const activeCat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[2]
  const userEmail = user?.email ?? ''

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Click-outside handler
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking the fab button itself
        const fab = document.getElementById('feedback-fab')
        if (fab?.contains(e.target as Node)) return
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Reset success state after delay
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false)
        setIsOpen(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [showSuccess])

  const displayName = (() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    return typeof meta.full_name === 'string' ? meta.full_name
      : typeof meta.name === 'string' ? meta.name
      : undefined
  })()

  const handleSend = useCallback(async () => {
    if (!message.trim() || isSending) return

    setIsSending(true)
    try {
      if (!session?.access_token) {
        toast.error('You must be logged in to send feedback')
        return
      }

      const res = await supabase.functions.invoke('feedback', {
        body: {
          category,
          message: message.trim(),
          email: userEmail || undefined,
          displayName,
        },
      })

      if (res.error) {
        const errMsg = res.error instanceof Error ? res.error.message : 'Failed to submit feedback'
        throw new Error(errMsg)
      }

      setMessage('')
      setShowSuccess(true)
      toast.success('Thank you! Your feedback has been submitted 🎉')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(msg)
    } finally {
      setIsSending(false)
    }
  }, [message, isSending, category, session, userEmail, displayName])

  return (
    <>
      {/* ─── Floating Action Button ─── */}
      <button
        id="feedback-fab"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'fixed bottom-6 right-6 z-[60] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300',
          'bg-brand-primary text-gray-950 hover:bg-brand-hover hover:scale-110',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary',
          isOpen && 'rotate-90 scale-95',
        )}
        aria-label={isOpen ? 'Close feedback' : 'Send feedback'}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircleHeart className="h-5 w-5" />
        )}
      </button>

      {/* ─── Feedback Panel ─── */}
      <div
        ref={panelRef}
        className={cn(
          'fixed bottom-20 right-6 z-[60] w-[380px] origin-bottom-right transition-all duration-300',
          isOpen
            ? 'scale-100 opacity-100 translate-y-0'
            : 'scale-90 opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        <div
          className="overflow-hidden rounded-2xl border border-gray-700/60 bg-surface-card shadow-2xl"
          style={{ boxShadow: `0 0 80px ${activeCat.bgGlow}, 0 20px 60px rgba(0,0,0,0.5)` }}
        >
          {/* ─── Gradient Header ─── */}
          <div className={cn('relative px-6 pt-6 pb-5 bg-gradient-to-br', activeCat.gradient)}>
            {/* Close button */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1 text-white/60 transition-colors hover:text-white hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Emoji + Title */}
            <div className="flex flex-col items-center text-center">
              <span className="mb-2 text-3xl animate-bounce" role="img" aria-label={activeCat.id}>
                {activeCat.emoji}
              </span>
              <h3 className="text-lg font-bold text-white">{activeCat.title}</h3>
              <p className="mt-0.5 text-sm text-white/70">{activeCat.subtitle}</p>
            </div>
          </div>

          {/* ─── Body ─── */}
          <div className="px-5 pb-5 pt-4">
            {/* Greeting */}
            <p className="mb-3 text-sm text-gray-400">
              Hey <span className="font-semibold text-gray-200">
                {(() => {
                  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
                  const name = typeof meta.full_name === 'string' ? meta.full_name
                    : typeof meta.name === 'string' ? meta.name
                    : 'Crew'
                  return name
                })()}
              </span>, what do you think?
            </p>

            {/* ─── Category Tabs ─── */}
            <div className="mb-4 flex gap-2">
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.id
                const Icon = cat.icon
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      isActive
                        ? cn(cat.borderColor, cat.accentColor, 'bg-white/5 shadow-sm')
                        : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.label}
                  </button>
                )
              })}
            </div>

            {/* ─── Success State ─── */}
            {showSuccess ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-status-success/20">
                  <Check className="h-6 w-6 text-status-success" />
                </div>
                <p className="text-sm font-medium text-gray-200">Feedback sent!</p>
                <p className="mt-1 text-xs text-gray-500">Thank you for helping us improve</p>
              </div>
            ) : (
              <>
                {/* ─── Textarea ─── */}
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder={activeCat.placeholder}
                  rows={4}
                  maxLength={5000}
                  className={cn(
                    'w-full resize-none rounded-xl border bg-surface-primary px-4 py-3 text-sm text-gray-200',
                    'placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-all',
                    'border-gray-700/60 hover:border-gray-600',
                  )}
                />

                {/* ─── Email (auto-filled, read-only) ─── */}
                {userEmail && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-700/60 bg-surface-primary px-4 py-2.5">
                    <span className="flex-1 truncate text-sm text-gray-300">{userEmail}</span>
                    <Check className="h-4 w-4 shrink-0 text-status-success" />
                  </div>
                )}
                {userEmail && (
                  <p className="mt-1.5 text-[11px] text-status-success-text">
                    Auto-filled from your account
                  </p>
                )}

                {/* ─── Send Button ─── */}
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!message.trim() || isSending}
                  className={cn(
                    'mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card',
                    message.trim() && !isSending
                      ? 'bg-brand-primary text-gray-950 hover:bg-brand-hover shadow-md shadow-brand-primary/20 hover:shadow-lg hover:shadow-brand-primary/30'
                      : 'bg-surface-elevated text-gray-600 cursor-not-allowed',
                  )}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send it!
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </button>

                {/* ─── Privacy notice ─── */}
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-600">
                  <Lock className="h-3 w-3" />
                  Your feedback is private &amp; read by real humans
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
