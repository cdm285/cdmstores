/**
 * CDM STORES — Extended Agent Context
 * ─────────────────────────────────────────────────────────────────────────────
 * Richer runtime context that every agent receives.
 * Extends the base AgentContext (core/types.ts) with:
 *   • Per-agent execution trace (timing, confidence, errors)
 *   • Feature flags controlling which pipeline branches are active
 *   • Convenience accessors for intent, language, sentiment
 *   • Factory function `createContext()` for clean instantiation
 *
 * All agents mutate the same context instance — this is how they communicate
 * without a round-trip through the bus for every value.
 */

import { logger } from '../lib/logger.js';

import type {
  AgentEnv,
  AgentMessage,
  IntentCategory,
  OrchestratorOutput,
  SessionState,
  UserProfile,
} from './types.js';

import type { AgentBus } from './agent-bus.js';

// ─── Trace ────────────────────────────────────────────────────────────────────
export interface TraceEntry {
  agentId: string;
  agentName: string;
  success: boolean;
  latencyMs: number;
  confidence?: number;
  error?: string;
  ts: number;
}

// ─── Feature flags ────────────────────────────────────────────────────────────
export interface ContextFlags {
  /** Use Vectorize RAG in semantic memory */
  semanticMemory: boolean;
  /** Load/save D1 conversation history */
  longMemory: boolean;
  /** Enable KV/D1 session cache */
  shortMemory: boolean;
  /** Force the full AI reasoning path regardless of intent */
  forceFullPath: boolean;
  /** Use the large (70B) model for reasoning */
  useLargeModel: boolean;
  /** Emit verbose logs */
  debug: boolean;
  /** Skip self-repair step (faster, slightly lower quality) */
  skipSelfRepair: boolean;
}

// ─── Extended context ─────────────────────────────────────────────────────────
export interface ExtendedAgentContext {
  // ── From base AgentContext ──────────────────────────────────────────────
  env: AgentEnv;
  session: SessionState;
  user: UserProfile | null;
  bus: AgentMessage[];
  meta: Record<string, unknown>;

  // ── Extensions ──────────────────────────────────────────────────────────
  /** Ordered log of agents that have run, with timing. Used for monitoring. */
  trace: TraceEntry[];
  /** Feature flags for this request */
  flags: ContextFlags;
  /** Unix timestamp (ms) when this context was created */
  startedAt: number;
  /** Live typed bus (optional — set by pipeline when bus is enabled) */
  agentBus?: AgentBus;

  // ── Typed shortcuts into meta (avoids casting everywhere) ──────────────
  entities: Record<string, string | number>;
  intent: IntentCategory | null;
  intentRoute: 'fast' | 'full';
  intentConf: number;
  detectedLang: 'pt' | 'en' | 'es';
  shouldEscalate: boolean;
  aiResponse: string;
  semanticCtx: string;
  recentOrders: unknown[]; // typed as OrderSummary[] by 08-episodic-memory
  conversationId: number | null; // D1 row id from ai_conversations
  promptMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  qualityScore: number;
  lastAction: string | null;
  lastActionPayload: Record<string, unknown>;
}

// ─── Default flags ────────────────────────────────────────────────────────────
const DEFAULT_FLAGS: ContextFlags = {
  semanticMemory: true,
  longMemory: true,
  shortMemory: true,
  forceFullPath: false,
  useLargeModel: false,
  debug: false,
  skipSelfRepair: false,
};

// ─── Input shape for context creation ─────────────────────────────────────────
export interface ContextInput {
  message: string;
  sessionId: string;
  userId?: string;
  language?: 'pt' | 'en' | 'es';
  isMobile?: boolean;
  flags?: Partial<ContextFlags>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────
/**
 * Creates a fresh ExtendedAgentContext for a new request.
 * Called once per /api/chat invocation at the top of the pipeline.
 */
export function createContext(input: ContextInput, env: AgentEnv): ExtendedAgentContext {
  const session: SessionState = {
    sessionId: input.sessionId,
    userId: input.userId,
    language: input.language ?? 'pt',
    turn: 0,
    context: [],
  };

  const ctx: ExtendedAgentContext = {
    // Base fields
    env,
    session,
    user: null,
    bus: [],
    meta: {},

    // Extensions
    trace: [],
    flags: { ...DEFAULT_FLAGS, ...(input.flags ?? {}) },
    startedAt: Date.now(),

    // Typed shortcuts (will be populated by agents)
    entities: {},
    intent: null,
    intentRoute: 'full',
    intentConf: 0,
    detectedLang: input.language ?? 'pt',
    shouldEscalate: false,
    aiResponse: '',
    semanticCtx: '',
    recentOrders: [],
    conversationId: null,
    promptMessages: [],
    qualityScore: 100,
    lastAction: null,
    lastActionPayload: {},
  };

  return ctx;
}

// ─── Trace helpers ────────────────────────────────────────────────────────────
export function addTrace(ctx: ExtendedAgentContext, entry: Omit<TraceEntry, 'ts'>): void {
  ctx.trace.push({ ...entry, ts: Date.now() });
  if (entry.error) {
    logger.warn(`[${entry.agentId}] ${entry.error}`);
  }
  if (ctx.flags.debug) {
    logger.debug(
      `[${entry.agentId}] ${entry.success ? '✓' : '✗'} ${entry.latencyMs}ms conf=${entry.confidence}`,
    );
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
export function getContextSummary(ctx: ExtendedAgentContext): Record<string, unknown> {
  const elapsed = Date.now() - ctx.startedAt;
  return {
    sessionId: ctx.session.sessionId,
    language: ctx.session.language,
    turn: ctx.session.turn,
    intent: ctx.intent,
    route: ctx.intentRoute,
    agentsRan: ctx.trace.length,
    pipeline: ctx.trace.map(t => t.agentId),
    qualityScore: ctx.qualityScore,
    escalated: ctx.shouldEscalate,
    elapsedMs: elapsed,
    avgAgentMs: ctx.trace.length
      ? Math.round(ctx.trace.reduce((s, t) => s + t.latencyMs, 0) / ctx.trace.length)
      : 0,
    errors: ctx.trace.filter(t => !t.success).map(t => ({ id: t.agentId, err: t.error })),
  };
}

// ─── Context → OrchestratorOutput adapter ────────────────────────────────────
/**
 * Converts the context state into the final API response shape.
 * Called at the very end of the pipeline, just before returning the Response.
 */
export function contextToOutput(ctx: ExtendedAgentContext, response: string): OrchestratorOutput {
  const p = ctx.lastActionPayload;
  return {
    success: true,
    response,
    action: ctx.lastAction ?? null,
    data: p.data ?? null,
    coupon_valid: (p.coupon_valid as boolean) ?? null,
    discount: (p.discount as number) ?? null,
    product_id: (p.product_id as number) ?? null,
    product_name: (p.product_name as string) ?? null,
    product_price: (p.product_price as number) ?? null,
    link: (p.link as string) ?? null,
    pipeline: ctx.flags.debug ? ctx.trace.map(t => t.agentId) : undefined,
  };
}
