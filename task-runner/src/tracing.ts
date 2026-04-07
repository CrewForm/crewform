/**
 * OpenTelemetry Tracing Module
 *
 * Provides opt-in observability for the CrewForm task runner.
 * Supports Langfuse (via langfuse SDK) and generic OTLP backends (Datadog, Jaeger, Grafana Tempo).
 *
 * Env vars (all optional — if none set, tracing is disabled with zero overhead):
 *   LANGFUSE_PUBLIC_KEY    → Langfuse mode
 *   LANGFUSE_SECRET_KEY    → Langfuse mode
 *   LANGFUSE_BASE_URL      → Langfuse self-hosted URL (default: https://cloud.langfuse.com)
 *   OTEL_EXPORTER_OTLP_ENDPOINT → Generic OTLP HTTP mode
 *   OTEL_EXPORTER_OTLP_HEADERS  → Auth headers for OTLP endpoint
 */

import { trace, context, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

// ─── State ───────────────────────────────────────────────────────────────────

let _tracer: Tracer | null = null;
let _initialized = false;

/**
 * Check if tracing is enabled (any observability env vars are set).
 */
export function isTracingEnabled(): boolean {
    return !!(
        process.env.LANGFUSE_PUBLIC_KEY ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    );
}

/**
 * Initialize OpenTelemetry SDK. Must be called once at startup.
 * No-op if no tracing env vars are set.
 */
export async function initTracing(): Promise<void> {
    if (_initialized) return;
    _initialized = true;

    if (!isTracingEnabled()) {
        console.log('[Tracing] No observability env vars set — tracing disabled.');
        return;
    }

    try {
        const { NodeSDK } = await import('@opentelemetry/sdk-node');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

        let spanProcessor;

        // Langfuse mode
        if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
            try {
                const { Langfuse } = await import('langfuse');
                const langfuse = new Langfuse({
                    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                    secretKey: process.env.LANGFUSE_SECRET_KEY,
                    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
                });

                // Use Langfuse's trace/span wrapper via the CallbackHandler approach
                // Store Langfuse client for manual tracing
                _langfuseClient = langfuse;
                console.log('[Tracing] Langfuse client initialized.');
            } catch (err) {
                console.warn('[Tracing] Failed to load Langfuse SDK, falling back to OTLP:', err);
            }
        }

        // OTLP mode (fallback or explicit)
        if (!_langfuseClient && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
            const { SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
            const exporter = new OTLPTraceExporter({
                url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
            });
            spanProcessor = new SimpleSpanProcessor(exporter);

            const sdk = new NodeSDK({
                serviceName: 'crewform-task-runner',
                spanProcessors: [spanProcessor],
            });
            sdk.start();
            console.log(`[Tracing] OTLP exporter initialized → ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
        }

        _tracer = trace.getTracer('crewform-task-runner', '1.0.0');
    } catch (err) {
        console.warn('[Tracing] Failed to initialize OpenTelemetry (non-fatal):', err);
    }
}

// ─── Langfuse Client (for manual tracing) ───────────────────────────────────

interface LangfuseClient {
    trace(params: Record<string, unknown>): LangfuseTrace;
    flushAsync(): Promise<unknown>;
    shutdownAsync(): Promise<unknown>;
}

interface LangfuseTrace {
    span(params: Record<string, unknown>): LangfuseSpan;
    generation(params: Record<string, unknown>): LangfuseGeneration;
    update(params: Record<string, unknown>): void;
}

interface LangfuseSpan {
    span(params: Record<string, unknown>): LangfuseSpan;
    generation(params: Record<string, unknown>): LangfuseGeneration;
    end(params?: Record<string, unknown>): void;
    update(params: Record<string, unknown>): void;
}

interface LangfuseGeneration {
    end(params?: Record<string, unknown>): void;
    update(params: Record<string, unknown>): void;
}

let _langfuseClient: LangfuseClient | null = null;

// ─── Trace Context ──────────────────────────────────────────────────────────

/** Active trace context for correlating spans in team runs. */
export interface TraceContext {
    /** Langfuse trace object (if Langfuse mode) */
    langfuseTrace?: LangfuseTrace;
    /** Langfuse parent span for nesting */
    langfuseParentSpan?: LangfuseSpan;
    /** OTEL parent span */
    otelParentSpan?: Span;
    /** Shared attributes */
    attributes: Record<string, string | number>;
}

/**
 * Start a new root trace (for a team run or standalone task).
 */
export function startTrace(
    name: string,
    attributes: Record<string, string | number> = {},
): TraceContext {
    const ctx: TraceContext = { attributes };

    if (_langfuseClient) {
        ctx.langfuseTrace = _langfuseClient.trace({
            name,
            metadata: attributes,
        });
    }

    if (_tracer) {
        const span = _tracer.startSpan(name, { attributes });
        ctx.otelParentSpan = span;
    }

    return ctx;
}

/**
 * Create a child span under a trace context.
 */
export function startSpan(
    traceCtx: TraceContext,
    name: string,
    attributes: Record<string, string | number> = {},
): SpanHandle {
    const handle: SpanHandle = {
        name,
        startTime: Date.now(),
        langfuseSpan: undefined,
        otelSpan: undefined,
    };

    if (traceCtx.langfuseTrace) {
        const parent = traceCtx.langfuseParentSpan ?? traceCtx.langfuseTrace;
        handle.langfuseSpan = parent.span({
            name,
            metadata: attributes,
        });
    }

    if (_tracer && traceCtx.otelParentSpan) {
        const parentCtx = trace.setSpan(context.active(), traceCtx.otelParentSpan);
        handle.otelSpan = _tracer.startSpan(name, { attributes }, parentCtx);
    }

    return handle;
}

/**
 * Create a Langfuse "generation" span (for LLM calls — shows up with special UI in Langfuse).
 */
export function startGeneration(
    traceCtx: TraceContext,
    params: {
        name: string;
        model: string;
        provider: string;
        input?: string;
    },
): GenerationHandle {
    const handle: GenerationHandle = {
        name: params.name,
        startTime: Date.now(),
        langfuseGeneration: undefined,
        otelSpan: undefined,
    };

    if (traceCtx.langfuseTrace) {
        const parent = traceCtx.langfuseParentSpan ?? traceCtx.langfuseTrace;
        handle.langfuseGeneration = parent.generation({
            name: params.name,
            model: params.model,
            metadata: { provider: params.provider },
            input: params.input,
        });
    }

    if (_tracer && traceCtx.otelParentSpan) {
        const parentCtx = trace.setSpan(context.active(), traceCtx.otelParentSpan);
        handle.otelSpan = _tracer.startSpan('llm.call', {
            attributes: {
                'llm.model': params.model,
                'llm.provider': params.provider,
                'gen_ai.system': params.provider,
                'gen_ai.request.model': params.model,
            },
        }, parentCtx);
    }

    return handle;
}

/**
 * End a generation span with LLM usage data.
 */
export function endGeneration(
    handle: GenerationHandle,
    result: {
        output?: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        costUsd?: number;
    },
): void {
    const durationMs = Date.now() - handle.startTime;

    if (handle.langfuseGeneration) {
        handle.langfuseGeneration.end({
            output: result.output,
            usage: {
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                totalTokens: result.totalTokens,
            },
            metadata: {
                cost_usd: result.costUsd,
                duration_ms: durationMs,
            },
        });
    }

    if (handle.otelSpan) {
        handle.otelSpan.setAttributes({
            'gen_ai.usage.prompt_tokens': result.promptTokens ?? 0,
            'gen_ai.usage.completion_tokens': result.completionTokens ?? 0,
            'llm.token.total': result.totalTokens ?? 0,
            'llm.cost_usd': result.costUsd ?? 0,
            'llm.duration_ms': durationMs,
        });
        handle.otelSpan.end();
    }
}

export interface SpanHandle {
    name: string;
    startTime: number;
    langfuseSpan?: LangfuseSpan;
    otelSpan?: Span;
}

export interface GenerationHandle {
    name: string;
    startTime: number;
    langfuseGeneration?: LangfuseGeneration;
    otelSpan?: Span;
}

/**
 * End a span (success).
 */
export function endSpan(
    handle: SpanHandle,
    attributes: Record<string, string | number> = {},
): void {
    const durationMs = Date.now() - handle.startTime;

    if (handle.langfuseSpan) {
        handle.langfuseSpan.end({
            metadata: { ...attributes, duration_ms: durationMs },
        });
    }

    if (handle.otelSpan) {
        handle.otelSpan.setAttributes({ ...attributes, 'duration_ms': durationMs });
        handle.otelSpan.end();
    }
}

/**
 * End a span with an error.
 */
export function endSpanWithError(handle: SpanHandle, error: Error | string): void {
    const errMsg = typeof error === 'string' ? error : error.message;

    if (handle.langfuseSpan) {
        handle.langfuseSpan.update({ level: 'ERROR', statusMessage: errMsg });
        handle.langfuseSpan.end();
    }

    if (handle.otelSpan) {
        handle.otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
        handle.otelSpan.recordException(typeof error === 'string' ? new Error(error) : error);
        handle.otelSpan.end();
    }
}

/**
 * End a trace (root span).
 */
export function endTrace(
    traceCtx: TraceContext,
    status: 'success' | 'error' = 'success',
    errorMessage?: string,
): void {
    if (traceCtx.langfuseTrace) {
        traceCtx.langfuseTrace.update({
            output: status === 'success' ? 'completed' : errorMessage,
            metadata: { status },
        });
    }

    if (traceCtx.otelParentSpan) {
        if (status === 'error' && errorMessage) {
            traceCtx.otelParentSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        }
        traceCtx.otelParentSpan.end();
    }
}

/**
 * Flush all pending traces. Call before process exit.
 */
export async function flushTraces(): Promise<void> {
    if (_langfuseClient) {
        try {
            await _langfuseClient.flushAsync();
        } catch {
            // non-fatal
        }
    }
}
