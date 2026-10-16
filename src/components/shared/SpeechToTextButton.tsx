// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff } from 'lucide-react'

// ─── Web Speech API type augmentation ────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: Event & { error: string }) => void) | null
    onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
    const w = window as unknown as Record<string, unknown>
    return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionConstructor | null
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SpeechToTextButtonProps {
    /** Called with the transcribed text (final results only) */
    onTranscript: (text: string) => void
    /** Language code (default: 'en-US') */
    lang?: string
    /** Additional CSS classes */
    className?: string
}

/**
 * Microphone button for speech-to-text input.
 * Uses the Web Speech API (SpeechRecognition).
 * Gracefully hidden when the browser doesn't support it.
 */
export function SpeechToTextButton({
    onTranscript,
    lang = 'en-US',
    className = '',
}: SpeechToTextButtonProps) {
    const [isListening, setIsListening] = useState(false)
    const [isSupported, setIsSupported] = useState(false)
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

    // Check support on mount
    useEffect(() => {
        setIsSupported(getSpeechRecognition() !== null)
    }, [])

    const toggle = useCallback(() => {
        if (isListening) {
            // Stop
            recognitionRef.current?.stop()
            setIsListening(false)
            return
        }

        const SpeechRecognitionClass = getSpeechRecognition()
        if (!SpeechRecognitionClass) return

        const recognition = new SpeechRecognitionClass()
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = lang

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const results = event.results
            let transcript = ''
            for (let i = event.resultIndex; i < results.length; i++) {
                if (results[i].isFinal) {
                    transcript += results[i][0].transcript
                }
            }
            if (transcript.trim()) {
                onTranscript(transcript.trim())
            }
        }

        recognition.onerror = (event: Event & { error: string }) => {
            console.warn('[SpeechToText] Error:', event.error)
            setIsListening(false)
        }

        recognition.onend = () => {
            setIsListening(false)
            recognitionRef.current = null
        }

        recognitionRef.current = recognition
        recognition.start()
        setIsListening(true)
    }, [isListening, lang, onTranscript])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            recognitionRef.current?.abort()
        }
    }, [])

    // Don't render if browser doesn't support it
    if (!isSupported) return null

    return (
        <button
            type="button"
            onClick={toggle}
            title={isListening ? 'Stop listening' : 'Speak to type'}
            className={`rounded-lg p-1.5 transition-colors ${isListening
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse'
                    : 'text-gray-500 hover:bg-surface-elevated hover:text-gray-300'
                } ${className}`}
        >
            {isListening ? (
                <MicOff className="h-4 w-4" />
            ) : (
                <Mic className="h-4 w-4" />
            )}
        </button>
    )
}
