/**
 * CDM STORES — Agent Bus
 * ─────────────────────────────────────────────────────────────────────────────
 * Protocol for typed, priority-aware inter-agent communication.
 * Workers are single-threaded, so the bus is an in-process event emitter with
 * promise-based async support, a FIFO audit trail and dead-letter capture.
 *
 * Usage:
 *   const bus = new AgentBus();
 *   bus.on('agent:02-intent', (payload, from) => { ... });
 *   await bus.request('agent:02-intent', { message: 'hi' }, '01-nlp');
 *   bus.broadcast('pipeline:start', { sessionId: 'xyz' });
 */

import type { AgentMessage } from './types.js';

// ─── Primitive types ──────────────────────────────────────────────────────────
export type BusMessageType = 'request' | 'response' | 'event' | 'broadcast' | 'error';
export type BusPriority    = 0 | 1 | 2 | 3; // 0 = critical … 3 = low

/** Envelope for every message that flows over the bus. */
export interface BusMessage<T = unknown> {
  id       : string;
  type     : BusMessageType;
  from     : string;         // source agent id
  to       : string | '*';   // target agent id OR '*' for broadcast
  channel  : string;         // logical topic
  payload  : T;
  priority : BusPriority;
  ts       : number;
  replyTo? : string;         // id of message being replied to
  ttl?     : number;         // ms before message expires
}

/** A handler registered for a channel. Returns void or a value used in request/response. */
export type BusHandler<TIn = unknown, TOut = unknown> = (
  payload : TIn,
  from    : string,
) => TOut | Promise<TOut>;

/** Result of a broadcast — collects all handler responses. */
export interface BroadcastResult<T> {
  channel  : string;
  results  : Array<{ handler: number; result: T; error?: string }>;
  failed   : number;
}

// ─── AgentBus class ───────────────────────────────────────────────────────────
export class AgentBus {
  private readonly subscriptions = new Map<string, Array<BusHandler>>();
  private readonly history       : BusMessage[] = [];
  private readonly deadLetters   : BusMessage[] = [];
  private readonly maxHistory    : number;
  private msgCounter = 0;

  constructor(maxHistory = 200) {
    this.maxHistory = maxHistory;
  }

  // ── Subscription management ───────────────────────────────────────────────

  /**
   * Subscribe to a channel. Multiple handlers per channel are supported
   * (first-registered, first-called for request(); all called for broadcast).
   * Returns an unsubscribe function.
   */
  on<TIn = unknown, TOut = unknown>(
    channel : string,
    handler : BusHandler<TIn, TOut>,
  ): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    this.subscriptions.get(channel)!.push(handler as BusHandler);
    return () => {
      const arr = this.subscriptions.get(channel);
      if (arr) {
        const idx = arr.indexOf(handler as BusHandler);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  /** Subscribe once — auto-unsubscribes after first invocation. */
  once<TIn = unknown, TOut = unknown>(
    channel : string,
    handler : BusHandler<TIn, TOut>,
  ): void {
    const unsub = this.on(channel, (...args) => {
      unsub();
      return (handler as BusHandler)(...args);
    });
  }

  // ── Messaging primitives ──────────────────────────────────────────────────

  /** Fire-and-forget event. All handlers on the channel are invoked. */
  emit<T>(
    channel  : string,
    payload  : T,
    from     = 'system',
    priority : BusPriority = 2,
  ): void {
    const msg = this.makeMsg<T>('event', channel, channel, payload, from, priority);
    this.record(msg);
    const handlers = this.subscriptions.get(channel);
    if (!handlers?.length) {
      this.deadLetters.push(msg);
      return;
    }
    for (const h of handlers) {
      try { h(payload, from); } catch (e) {
        console.warn(`[AgentBus] Handler error on "${channel}":`, e);
      }
    }
  }

  /**
   * Request/response — invokes the FIRST handler on the channel and awaits its result.
   * Respects TTL as a timeout.
   */
  async request<TReq, TRes>(
    channel : string,
    payload : TReq,
    from    = 'system',
    timeout = 5000,
  ): Promise<TRes> {
    const handlers = this.subscriptions.get(channel);
    if (!handlers?.length) {
      throw new Error(`[AgentBus] No handler registered for channel "${channel}"`);
    }
    const msg = this.makeMsg<TReq>('request', channel, channel, payload, from, 1, timeout);
    this.record(msg);

    const [handler] = handlers;
    return Promise.race<TRes>([
      Promise.resolve(handler(payload, from)) as Promise<TRes>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`[AgentBus] Timeout (${timeout}ms) on "${channel}"`)), timeout),
      ),
    ]);
  }

  /** Broadcast to ALL handlers on a channel. Collects results. Never throws. */
  async broadcast<T, R = void>(
    channel : string,
    payload : T,
    from    = 'system',
  ): Promise<BroadcastResult<R>> {
    const msg = this.makeMsg<T>('broadcast', '*', channel, payload, from, 0);
    this.record(msg);

    const handlers = this.subscriptions.get(channel) ?? [];
    const results: BroadcastResult<R>['results'] = [];
    let failed = 0;

    await Promise.allSettled(
      handlers.map(async (h, i) => {
        try {
          const result = await h(payload, from) as R;
          results.push({ handler: i, result });
        } catch (e) {
          const error = (e as Error).message;
          results.push({ handler: i, result: undefined as unknown as R, error });
          failed++;
        }
      }),
    );

    return { channel, results, failed };
  }

  /**
   * Route a directed message from one agent to another.
   * Uses the auto-generated channel `agent:<to>`.
   */
  route<T>(from: string, to: string, payload: T): void {
    this.emit(`agent:${to}`, payload, from, 1);
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  getHistory(): Readonly<BusMessage[]> { return this.history; }

  getDeadLetters(): Readonly<BusMessage[]> { return this.deadLetters; }

  getChannelHistory(channel: string): BusMessage[] {
    return this.history.filter(m => m.channel === channel);
  }

  getRegisteredChannels(): string[] {
    return [...this.subscriptions.keys()];
  }

  clear(): void {
    this.history.length = 0;
    this.deadLetters.length = 0;
    this.subscriptions.clear();
  }

  /** Convert bus history to the AgentMessage[] format used by AgentContext */
  toAgentMessages(): AgentMessage[] {
    return this.history.map(m => ({
      from     : m.from,
      to       : String(m.to),
      type     : m.type === 'request' || m.type === 'response' ? m.type : 'event' as const,
      payload  : m.payload as Record<string, unknown>,
      priority : m.priority === 0 ? 'critical' : m.priority === 1 ? 'high' : m.priority === 3 ? 'low' : 'normal',
      ts       : m.ts,
    }));
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private makeMsg<T>(
    type     : BusMessageType,
    to       : string | '*',
    channel  : string,
    payload  : T,
    from     : string,
    priority : BusPriority,
    ttl?     : number,
  ): BusMessage<T> {
    return {
      id: `${++this.msgCounter}-${Date.now()}`,
      type, from, to, channel, payload, priority,
      ts: Date.now(),
      ...(ttl !== undefined && { ttl }),
    };
  }

  private record(msg: BusMessage): void {
    this.history.push(msg);
    if (this.history.length > this.maxHistory) this.history.shift();
  }
}

// ─── Module-level singleton (one bus per Worker invocation) ──────────────────
export const globalBus = new AgentBus(500);
