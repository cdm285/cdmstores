/**
 * CDM STORES — Agent System Core Types
 * Shared interfaces for all 90 agents
 */

// ─── Env (minimal surface agents need) ────────────────────────────────────────
export interface AgentEnv {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  KV?: KVNamespace;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
}

// ─── Messages ──────────────────────────────────────────────────────────────────
export interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'event';
  payload: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  ts: number;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts?: number;
}

// ─── Session ───────────────────────────────────────────────────────────────────
export interface SessionState {
  sessionId: string;
  userId?: string;
  language: 'pt' | 'en' | 'es';
  turn: number;
  intent?: IntentCategory;
  sentiment?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
  lastAction?: string;
  context: SessionMessage[];
}

export interface UserProfile {
  id: number;
  email: string;
  name?: string;
}

// ─── Context passed to every agent ────────────────────────────────────────────
export interface AgentContext {
  env: AgentEnv;
  session: SessionState;
  user: UserProfile | null;
  bus: AgentMessage[];
  meta: Record<string, unknown>;
}

// ─── Agent result ──────────────────────────────────────────────────────────────
export interface AgentResult {
  agentId: string;
  success: boolean;
  data?: Record<string, unknown>;
  response?: string;
  action?: string;
  actionPayload?: Record<string, unknown>;
  confidence: number; // 0–100
  error?: string;
  latencyMs: number;
}

// ─── Final pipeline output (maps to /api/chat response shape) ─────────────────
export interface OrchestratorOutput {
  success: boolean;
  response: string;
  action?: string | null;
  data?: unknown;
  coupon_valid?: boolean | null;
  discount?: number | null;
  product_id?: number | null;
  product_name?: string | null;
  product_price?: number | null;
  link?: string | null;
  /** Which agents ran (debug) */
  pipeline?: string[];
}

// ─── Intent ───────────────────────────────────────────────────────────────────
export type IntentCategory =
  | 'greeting'
  | 'product_query'
  | 'tracking'
  | 'coupon'
  | 'order_history'
  | 'cart_action'
  | 'support'
  | 'schedule'
  | 'whatsapp'
  | 'payment'
  | 'notification'
  | 'farewell'
  | 'complex'
  | 'unknown';

export interface Intent {
  category: IntentCategory;
  confidence: number; // 0–100
  entities: Record<string, string | number>;
  route: 'fast' | 'full';
}

// ─── Sentiment ────────────────────────────────────────────────────────────────
export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  score: number;
  shouldEscalate: boolean;
}

// ─── Quality ──────────────────────────────────────────────────────────────────
export interface QualityReport {
  score: number;           // 0–100
  passed: boolean;         // score >= QUALITY_THRESHOLD
  issues: string[];
  suggestions: string[];
}

// ─── Base Agent contract ──────────────────────────────────────────────────────
export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly name: string;

  protected start(): number {
    return Date.now();
  }

  protected elapsed(startMs: number): number {
    return Date.now() - startMs;
  }

  protected ok(agentId: string, data: Partial<AgentResult>, startMs: number): AgentResult {
    return {
      agentId,
      success: true,
      confidence: 80,
      latencyMs: this.elapsed(startMs),
      ...data,
    };
  }

  protected fail(agentId: string, error: string, startMs: number): AgentResult {
    return { agentId, success: false, error, confidence: 0, latencyMs: this.elapsed(startMs) };
  }
}

export const QUALITY_THRESHOLD = 55; // minimum score to pass quality gate
