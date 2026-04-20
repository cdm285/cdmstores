/**
 * CDM STORES — Structured Logger for Cloudflare Workers
 * ─────────────────────────────────────────────────────────────────────────────
 * Outputs JSON lines — visible in `wrangler tail` and the Cloudflare Logs dashboard.
 * Use this instead of bare `console.*` calls to satisfy the `no-console` rule
 * and to produce machine-readable, structured log output in production.
 *
 * Usage:
 *   import { logger } from '../lib/logger.js';
 *   logger.info('Payment confirmed', { orderId: 42, amount: 89.90 });
 *   logger.warn('[CircuitBreaker:ai] OPEN', { failures: 3 });
 *   logger.error('[Cron] DB cleanup failed', err);
 */

/* eslint-disable no-console */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, msg: string, data?: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data !== undefined ? { data } : {}),
  });
  switch (level) {
    case 'debug': {
      console.debug(line);
      break;
    }
    case 'info': {
      console.log(line);
      break;
    }
    case 'warn': {
      console.warn(line);
      break;
    }
    case 'error': {
      console.error(line);
      break;
    }
  }
}

export const logger = {
  /** Verbose debug output — only emitted when `ctx.flags.debug` is true. */
  debug: (msg: string, data?: unknown): void => emit('debug', msg, data),
  /** General operational info — pipeline milestones, cron heartbeats. */
  info: (msg: string, data?: unknown): void => emit('info', msg, data),
  /** Recoverable conditions — slow agents, circuit half-open, fallback used. */
  warn: (msg: string, data?: unknown): void => emit('warn', msg, data),
  /** Unrecoverable errors — failed payments, auth failures, unhandled throws. */
  error: (msg: string, data?: unknown): void => emit('error', msg, data),
  /** Alias for `info` — drop-in replacement for `console.log`. */
  log: (msg: string, data?: unknown): void => emit('info', msg, data),
};
