/**
 * CDM STORES — Pipeline Executor
 * ─────────────────────────────────────────────────────────────────────────────
 * Composable, typed multi-agent pipeline with:
 *   • Sequential steps
 *   • Parallel step groups (Promise.allSettled)
 *   • Conditional branches
 *   • Per-step timeout guards
 *   • Structured log output in debug mode
 *   • Full execution report (PipelineReport)
 *
 * Usage:
 *   const pipeline = createPipeline<ExtendedAgentContext>('chat');
 *   pipeline
 *     .step('01-nlp',       ctx => nlpAgent.execute(ctx))
 *     .parallel('lang+emo', [
 *       ctx => langAgent.execute(ctx),
 *       ctx => emotionAgent.execute(ctx),
 *     ])
 *     .branch(ctx => ctx.shouldEscalate,
 *       'escalate',  ctx => escalationAgent.execute(ctx),
 *       'continue',  ctx => intentAgent.execute(ctx),
 *     )
 *     .step('finalize', ctx => finalizeResponse(ctx));
 *
 *   const report = await pipeline.run(ctx);
 */

import { addTrace, ExtendedAgentContext } from './agent-context.js';
import type { ActionRequest, ActionResult }          from './action-schema.js';

// ─── Step types ───────────────────────────────────────────────────────────────
/** A single async operation that receives and mutates the context. */
export type StepFn<T = ExtendedAgentContext> = (ctx: T) => Promise<void> | void;

/** Internal step descriptor */
interface PipelineStep<T> {
  kind         : 'sequential' | 'parallel' | 'branch';
  name         : string;
  fns?         : StepFn<T>[];                           // sequential or parallel
  condition?   : (ctx: T) => boolean;                   // branch condition
  thenName?    : string;
  thenFns?     : StepFn<T>[];
  elseName?    : string;
  elseFns?     : StepFn<T>[];
  timeoutMs?   : number;
  skip?        : (ctx: T) => boolean;                   // skip this step entirely
}

// ─── Report ───────────────────────────────────────────────────────────────────
export interface StepReport {
  name       : string;
  kind       : string;
  success    : boolean;
  latencyMs  : number;
  skipped    : boolean;
  error?     : string;
}

export interface Tier4ActionReport {
  actionType  : string;
  success     : boolean;
  latencyMs   : number;
  error?      : string;
}

export interface PipelineReport {
  pipelineName   : string;
  success        : boolean;
  totalMs        : number;
  stepsExecuted  : number;
  stepsSkipped   : number;
  stepsFailed    : number;
  steps          : StepReport[];
  tier4Actions?  : Tier4ActionReport[];
}

// ─── Pipeline class ───────────────────────────────────────────────────────────
export class Pipeline<T extends ExtendedAgentContext = ExtendedAgentContext> {
  private readonly steps : PipelineStep<T>[] = [];

  constructor(private readonly name: string) {}

  // ── Builder API ──────────────────────────────────────────────────────────

  /** Add a sequential step. Execution stops on unhandled error. */
  step(
    name       : string,
    fn         : StepFn<T>,
    options?   : { timeoutMs?: number; skip?: (ctx: T) => boolean },
  ): this {
    this.steps.push({ kind: 'sequential', name, fns: [fn], ...options });
    return this;
  }

  /** Add multiple functions that run concurrently via Promise.allSettled. */
  parallel(
    name     : string,
    fns      : StepFn<T>[],
    options? : { timeoutMs?: number; skip?: (ctx: T) => boolean },
  ): this {
    this.steps.push({ kind: 'parallel', name, fns, ...options });
    return this;
  }

  /**
   * Conditional branch. Evaluates `condition(ctx)` at run-time.
   * Exactly one branch is executed; the other is skipped.
   */
  branch(
    condition  : (ctx: T) => boolean,
    thenName   : string,
    thenFns    : StepFn<T>[],
    elseName?  : string,
    elseFns?   : StepFn<T>[],
  ): this {
    this.steps.push({
      kind      : 'branch',
      name      : `branch(${thenName}|${elseName ?? 'skip'})`,
      condition,
      thenName,
      thenFns,
      elseName,
      elseFns,
    });
    return this;
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /** Execute the pipeline. Returns a detailed report. */
  async run(ctx: T): Promise<PipelineReport> {
    const startTotal = Date.now();
    const steps: StepReport[] = [];
    let failed = 0;
    let skipped = 0;

    for (const step of this.steps) {
      if (step.skip?.(ctx)) {
        steps.push({ name: step.name, kind: step.kind, success: true, latencyMs: 0, skipped: true });
        skipped++;
        continue;
      }

      const start = Date.now();
      let success = true;
      let error: string | undefined;

      try {
        switch (step.kind) {
          case 'sequential':
            await this.runWithTimeout(step.fns![0], ctx, step.timeoutMs);
            break;

          case 'parallel':
            await this.runParallel(step.fns!, ctx, step.timeoutMs);
            break;

          case 'branch': {
            const takeThen = step.condition!(ctx);
            const branchFns = takeThen ? step.thenFns : step.elseFns;
            const branchName = takeThen ? (step.thenName ?? 'then') : (step.elseName ?? 'else');
            if (branchFns?.length) {
              await this.runParallel(branchFns, ctx, step.timeoutMs);
              if (ctx.flags.debug) console.log(`[Pipeline:${this.name}] branch → ${branchName}`);
            }
            break;
          }
        }
      } catch (e) {
        success = false;
        error = (e as Error).message;
        failed++;
        // Record in trace
        addTrace(ctx, {
          agentId    : step.name,
          agentName  : step.name,
          success    : false,
          latencyMs  : Date.now() - start,
          confidence : 0,
          error,
        });
        if (ctx.flags.debug) console.error(`[Pipeline:${this.name}] STEP FAILED: ${step.name}`, e);
        // Critical steps (no error handler) halt the pipeline
        if (step.kind === 'sequential') break;
      }

      steps.push({
        name      : step.name,
        kind      : step.kind,
        success,
        latencyMs : Date.now() - start,
        skipped   : false,
        error,
      });
    }

    return {
      pipelineName   : this.name,
      success        : failed === 0,
      totalMs        : Date.now() - startTotal,
      stepsExecuted  : steps.filter(s => !s.skipped).length,
      stepsSkipped   : skipped,
      stepsFailed    : failed,
      steps,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async runWithTimeout(fn: StepFn<T>, ctx: T, ms?: number): Promise<void> {
    if (!ms) return Promise.resolve(fn(ctx));
    return Promise.race([
      Promise.resolve(fn(ctx)) as Promise<void>,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Step timeout after ${ms}ms`)), ms),
      ),
    ]);
  }

  private async runParallel(fns: StepFn<T>[], ctx: T, ms?: number): Promise<void> {
    const tasks = fns.map(fn => this.runWithTimeout(fn, ctx, ms));
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === 'rejected') {
        // Log but don't halt — parallel steps are treated as best-effort
        if (ctx.flags.debug) console.warn(`[Pipeline] Parallel step rejected:`, r.reason);
      }
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────
/** Convenience factory — returns a typed pipeline builder. */
export function createPipeline<T extends ExtendedAgentContext = ExtendedAgentContext>(
  name: string,
): Pipeline<T> {
  return new Pipeline<T>(name);
}

// ─── Tier runner ─────────────────────────────────────────────────────────────
/**
 * Run a group of steps as a "tier" — all run in parallel, failures are logged
 * but do NOT stop execution.
 */
export async function runTier(
  ctx   : ExtendedAgentContext,
  name  : string,
  fns   : StepFn<ExtendedAgentContext>[],
): Promise<void> {
  const start = Date.now();
  const results = await Promise.allSettled(fns.map(f => Promise.resolve(f(ctx))));
  const errors = results.filter(r => r.status === 'rejected');
  if (ctx.flags.debug) {
    console.log(`[Tier:${name}] ${fns.length} agents, ${errors.length} errors, ${Date.now() - start}ms`);
  }
}

// ─── Tier 4 runner ───────────────────────────────────────────────────────────
/**
 * Run Tier 4 action requests in parallel.
 *
 * @param ctx      Agent context (mutated in-place by each action agent)
 * @param requests Array of typed ActionRequests to dispatch
 * @param dispatch The router function — typically `agent10ActionRouter.execute`
 * @returns        Structured per-action reports (used for PipelineReport.tier4Actions)
 *
 * Example:
 *   const t4 = await runTier4(ctx, [req1, req2], agent10ActionRouter.execute.bind(agent10ActionRouter));
 */
export async function runTier4(
  ctx      : ExtendedAgentContext,
  requests : ActionRequest[],
  dispatch : (ctx: ExtendedAgentContext, req: ActionRequest) => Promise<ActionResult>,
): Promise<Tier4ActionReport[]> {
  const settled = await Promise.allSettled(
    requests.map(async (req): Promise<Tier4ActionReport> => {
      const t0     = Date.now();
      const result = await dispatch(ctx, req);
      return {
        actionType : req.payload.type,
        success    : result.success,
        latencyMs  : Date.now() - t0,
        error      : result.error,
      };
    }),
  );

  const reports: Tier4ActionReport[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      actionType : requests[i].payload.type,
      success    : false,
      latencyMs  : 0,
      error      : (r.reason as Error)?.message ?? 'unknown error',
    };
  });

  // Write structured log to ctx.meta for downstream surfacing
  const existing = (ctx.meta.tier4Actions as Tier4ActionReport[] | undefined) ?? [];
  ctx.meta.tier4Actions = [...existing, ...reports];

  if (ctx.flags.debug) {
    const ok  = reports.filter(r => r.success).length;
    const err = reports.length - ok;
    console.log(`[Tier4] ${reports.length} actions — ${ok} ok, ${err} failed`);
  }

  return reports;
}
