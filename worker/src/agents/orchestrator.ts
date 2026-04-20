/**
 * Agent 00 — Orchestrator
 * Central pipeline coordinator for the CDM STORES 90-agent AI system.
 *
 * Execution model:
 *   1. Security gate
 *   2. NLP + Language + Emotion (parallel-safe pure functions)
 *   3. Intent classification
 *   4. Escalation check
 *   5. Memory read
 *   6. Route: fast-path (action agents) OR full-path (AI reasoning)
 *   7. Personality + Style
 *   8. Quality gate → SelfRepair if needed
 *   9. Validation + Correction
 *  10. Async writes (memory, log)
 *  11. Return OrchestratorOutput
 */

import type {
    AgentContext,
    AgentEnv,
    AgentResult,
    IntentCategory,
    OrchestratorOutput,
    SessionMessage,
    SessionState,
} from '../core/types.js';

// ── Agents: Security ──────────────────────────────────────────────────────────
import { securityAgent } from './security.js';

// ── Agents: NLP / Intent / Language ──────────────────────────────────────────
import { intentAgent, languageAgent, nlpAgent } from './nlp.js';

// ── Agents: Memory ────────────────────────────────────────────────────────────
import {
    contextAgent,
    episodicMemoryAgent,
    longMemoryAgent,
    semanticMemoryAgent,
    shortMemoryAgent,
} from './memory.js';

// ── Agents: Reasoning ─────────────────────────────────────────────────────────
import { planningAgent, promptingAgent, reasoningAgent, summarizationAgent } from './reasoning.js';

// ── Agents: Personality ───────────────────────────────────────────────────────
import { emotionAgent, personalityAgent, styleAgent } from './personality.js';

// ── Agents: Actions ───────────────────────────────────────────────────────────
import {
    cartAgent,
    couponAgent,
    escalationAgent,
    fallbackAgent,
    notificationAgent,
    orderAgent,
    paymentAgent,
    productAgent,
    schedulingAgent,
    trackingAgent,
    whatsAppAgent,
} from './actions.js';

// ── Agents: Quality ───────────────────────────────────────────────────────────
import {
    errorCorrectionAgent,
    qualityAgent,
    qualityCheckAgent,
    selfCorrectionAgent,
    selfRepairAgent,
    validationAgent,
} from './quality.js';

// ── Agents: Monitoring ────────────────────────────────────────────────────────
import {
    logAgent,
    monitoringAgent,
    responseCheckAgent,
    securityCheckAgent,
    selfOptimizationAgent,
} from './monitoring.js';

// ─── Pipeline trace ───────────────────────────────────────────────────────────
interface PipelineTrace {
  pipeline: string[];
  metrics: Record<string, number>;
  record(result: AgentResult): void;
}

function createTrace(): PipelineTrace {
  const trace: PipelineTrace = {
    pipeline: [],
    metrics: {},
    record(result: AgentResult) {
      trace.pipeline.push(result.agentId);
      trace.metrics[result.agentId] = result.latencyMs;
    },
  };
  return trace;
}

// ─── Input ────────────────────────────────────────────────────────────────────
export interface OrchestratorInput {
  message: string;
  sessionId: string;
  userId?: string;
  language?: 'pt' | 'en' | 'es';
  isMobile?: boolean;
}

// ─── Fast-path action router ──────────────────────────────────────────────────
// Maps intent → action agent call.
// Returns null for intents that need the full AI reasoning path.
async function routeFastPath(
  intent: IntentCategory,
  entities: Record<string, string | number>,
  ctx: AgentContext,
  userEmail: string | undefined,
): Promise<AgentResult | null> {
  switch (intent) {
    case 'tracking': {
      const code = (entities.tracking_code as string | undefined) ?? '';
      if (code) {
        return trackingAgent.run(ctx, code);
      }
      // No code found → ask user
      const msgs: Record<string, string> = {
        pt: '🔍 Por favor, informe seu código de rastreio para que eu possa verificar o status do pedido.',
        en: '🔍 Please provide your tracking code so I can check your order status.',
        es: '🔍 Por favor, proporciona tu código de seguimiento para que pueda verificar el estado de tu pedido.',
      };
      return {
        agentId: '19-tracking',
        success: true,
        response: msgs[ctx.session.language] ?? msgs.pt,
        confidence: 80,
        latencyMs: 0,
      };
    }

    case 'coupon': {
      const code = (entities.coupon as string | undefined) ?? '';
      if (code) {
        return couponAgent.run(ctx, code);
      }
      const msgs: Record<string, string> = {
        pt: '🎟️ Qual é o código do cupom? Temos cupons disponíveis: NEWYEAR, PROMO, DESCONTO10, SAVE20, CDM10.',
        en: '🎟️ What is the coupon code? Available coupons: NEWYEAR, PROMO, DESCONTO10, SAVE20, CDM10.',
        es: '🎟️ ¿Cuál es el código del cupón? Cupones disponibles: NEWYEAR, PROMO, DESCONTO10, SAVE20, CDM10.',
      };
      return {
        agentId: '20-coupon',
        success: true,
        response: msgs[ctx.session.language] ?? msgs.pt,
        confidence: 70,
        latencyMs: 0,
      };
    }

    case 'order_history': {
      const email = (entities.email as string | undefined) ?? userEmail;
      if (email) {
        return orderAgent.run(ctx, email);
      }
      const msgs: Record<string, string> = {
        pt: '📋 Por favor, informe seu email para que eu possa buscar seus pedidos.',
        en: '📋 Please provide your email so I can look up your orders.',
        es: '📋 Por favor, proporciona tu email para que pueda buscar tus pedidos.',
      };
      return {
        agentId: '18-order',
        success: true,
        response: msgs[ctx.session.language] ?? msgs.pt,
        confidence: 70,
        latencyMs: 0,
      };
    }

    case 'cart_action': {
      const productId = entities.product_id as number | undefined;
      if (productId) {
        return cartAgent.run(ctx, productId);
      }
      return productAgent.run(ctx); // show catalog if no specific product
    }

    case 'product_query':
      return productAgent.run(ctx, entities.product_id as number | undefined);

    case 'payment':
      return paymentAgent.run(ctx);

    case 'schedule':
      return schedulingAgent.run(ctx);

    case 'whatsapp':
      return whatsAppAgent.run(ctx);

    case 'notification':
      return notificationAgent.run(ctx);

    default:
      return null; // → full AI path
  }
}

// ─── Response finalization pipeline ──────────────────────────────────────────
// Runs personality → style → quality_gate with optional self-repair.
async function finalizeResponse(
  initialResponse: string,
  _actionResult: AgentResult,
  ctx: AgentContext,
  trace: PipelineTrace,
  isMobile: boolean,
): Promise<string> {
  let response = initialResponse;

  // Personality adjustment
  const personalResult = await personalityAgent.run(ctx, response);
  trace.record(personalResult);
  if (personalResult.success && personalResult.response) {
    response = personalResult.response;
  }

  // Style formatting
  const styleResult = await styleAgent.run(ctx, response, isMobile ? 'mobile' : 'web');
  trace.record(styleResult);
  if (styleResult.success && styleResult.response) {
    response = styleResult.response;
  }

  // Quality score
  const qualityResult = await qualityAgent.run(ctx, response);
  trace.record(qualityResult);

  // Validation (sensitive data, broken markdown)
  const validResult = await validationAgent.run(ctx, response);
  trace.record(validResult);
  if (!validResult.success) {
    // Sensitive data detected — use fallback
    const msgs: Record<string, string> = {
      pt: 'Desculpe, houve um erro ao preparar a resposta. Por favor, tente novamente.',
      en: 'Sorry, there was an error preparing the response. Please try again.',
      es: 'Lo siento, hubo un error al preparar la respuesta. Por favor, inténtalo de nuevo.',
    };
    response = msgs[ctx.session.language] ?? msgs.pt;
  }

  // Error correction (broken markdown, debug artifacts)
  const corrResult = await errorCorrectionAgent.run(ctx, response);
  trace.record(corrResult);
  if (corrResult.success && corrResult.response) {
    response = corrResult.response;
  }

  // Language self-correction
  const selfCorrResult = await selfCorrectionAgent.run(ctx, response);
  trace.record(selfCorrResult);
  if (selfCorrResult.success && selfCorrResult.response) {
    response = selfCorrResult.response;
  }

  // Quality gate check
  const gateResult = await qualityCheckAgent.run(ctx, response);
  trace.record(gateResult);

  if (!gateResult.success) {
    // Gate failed → try self-repair (one attempt only)
    const repairResult = await selfRepairAgent.run(ctx, response);
    trace.record(repairResult);
    if (repairResult.success && repairResult.response) {
      response = repairResult.response;

      // Re-run quality after repair (skip gate this time — accept result)
      const requalResult = await qualityAgent.run(ctx, response);
      trace.record(requalResult);
    }
  }

  // Security check on final response (prevent system prompt leakage)
  const secCheckResult = await securityCheckAgent.run(ctx, response);
  trace.record(secCheckResult);
  if (!secCheckResult.success) {
    response =
      ctx.session.language === 'en'
        ? 'Sorry, I encountered an error. Please try again.'
        : ctx.session.language === 'es'
          ? 'Lo siento, encontré un error. Por favor, inténtalo de nuevo.'
          : 'Desculpe, encontrei um erro. Por favor, tente novamente.';
  }

  // Response format check
  const respCheckResult = await responseCheckAgent.run(ctx, response);
  trace.record(respCheckResult);

  return response;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export class Orchestrator {
  async process(input: OrchestratorInput, env: AgentEnv): Promise<OrchestratorOutput> {
    const startMs = Date.now();
    const trace = createTrace();
    const { message, sessionId, userId, isMobile = false } = input;

    // ── Build initial session state ───────────────────────────────────────────
    const initialSession: SessionState = {
      sessionId,
      userId,
      language: input.language ?? 'pt',
      turn: 0,
      context: [],
    };

    const ctx: AgentContext = {
      env,
      session: initialSession,
      user: null,
      bus: [],
      meta: {},
    };

    // ── 1. Security gate ──────────────────────────────────────────────────────
    const secResult = await securityAgent.run(ctx, message);
    trace.record(secResult);
    if (!secResult.success) {
      return {
        success: false,
        response:
          ctx.session.language === 'en'
            ? 'Your message could not be processed due to security restrictions.'
            : ctx.session.language === 'es'
              ? 'Tu mensaje no pudo procesarse por restricciones de seguridad.'
              : 'Sua mensagem não pôde ser processada por restrições de segurança.',
        pipeline: trace.pipeline,
      };
    }

    // ── 2. NLP + Language + Emotion (all pure, no AI) ─────────────────────────
    const nlpResult = await nlpAgent.run(ctx, message);
    trace.record(nlpResult);
    const entities = (nlpResult.data?.entities as Record<string, string | number>) ?? {};

    const [langResult, emotionResult] = await Promise.all([
      languageAgent.run(ctx, message),
      emotionAgent.run(ctx, message),
    ]);
    trace.record(langResult);
    trace.record(emotionResult);

    // ── 3. Intent classification ──────────────────────────────────────────────
    const intentResult = await intentAgent.run(ctx, message, entities);
    trace.record(intentResult);
    const intent = (intentResult.data?.intent as {
      category: IntentCategory;
      route: 'fast' | 'full';
      confidence: number;
    }) ?? {
      category: 'unknown' as IntentCategory,
      route: 'full',
      confidence: 40,
    };

    // ── 4. Escalation check ───────────────────────────────────────────────────
    if (ctx.meta.should_escalate) {
      const escResult = await escalationAgent.run(ctx);
      trace.record(escResult);
      const response = escResult.response ?? '';

      // Async logging
      logAgent
        .run(ctx, 'escalation_triggered', { message_preview: message.slice(0, 50) })
        .catch(() => {});

      return {
        success: true,
        response,
        action: escResult.action ?? null,
        link: (escResult.actionPayload?.link as string) ?? null,
        pipeline: trace.pipeline,
      };
    }

    // ── 5. Memory read ────────────────────────────────────────────────────────
    const [shortMemResult, longMemResult] = await Promise.all([
      shortMemoryAgent.run(ctx, 'read', sessionId),
      longMemoryAgent.run(ctx, 'read', sessionId),
    ]);
    trace.record(shortMemResult);
    trace.record(longMemResult);

    // Update turn counter after loading context
    ctx.session.turn = ctx.session.context.filter(m => m.role === 'user').length;

    // Load episodic memory if user email is known
    const userEmail = entities.email as string | undefined;
    if (userEmail) {
      const epicResult = await episodicMemoryAgent.run(ctx, userEmail);
      trace.record(epicResult);
    }

    // ── 6. Route by intent: fast-path OR full AI path ─────────────────────────
    // eslint-disable-next-line no-useless-assignment
    let finalActionResult: AgentResult | null = null;
    // eslint-disable-next-line no-useless-assignment
    let rawResponse = '';

    const fastPathResult = await routeFastPath(intent.category, entities, ctx, userEmail);

    if (fastPathResult) {
      // Fast path: action agent returned a response
      trace.record(fastPathResult);
      rawResponse = fastPathResult.response ?? '';
      finalActionResult = fastPathResult;
    } else {
      // Full path: use AI reasoning pipeline
      // Context management
      const ctxTrimResult = await contextAgent.run(ctx);
      trace.record(ctxTrimResult);
      const sumResult = await summarizationAgent.run(ctx, 15);
      trace.record(sumResult);

      // Semantic memory (RAG) — async-safe, non-blocking
      try {
        const semResult = await semanticMemoryAgent.run(ctx, 'read', message);
        trace.record(semResult);
      } catch {
        /* RAG is optional */
      }

      // Planning (pure function — no AI cost)
      const planResult = await planningAgent.run(ctx, intent.category);
      trace.record(planResult);

      // Build prompt
      const promptResult = await promptingAgent.run(ctx, message);
      trace.record(promptResult);

      // AI call (Llama 3.1 8B fast or 70B for complex intents)
      const useLargeModel = intent.category === 'complex' && intent.confidence < 60;
      const reasonResult = await reasoningAgent.run(ctx, useLargeModel);
      trace.record(reasonResult);

      if (reasonResult.success && reasonResult.response) {
        rawResponse = reasonResult.response;
        finalActionResult = reasonResult;
      } else {
        // AI failed — fallback
        const fallResult = await fallbackAgent.run(ctx);
        trace.record(fallResult);
        rawResponse = fallResult.response ?? '';
        finalActionResult = fallResult;
      }
    }

    // ── 7–9. Finalize response (personality → style → quality gate) ───────────
    // finalActionResult is guaranteed non-null: both fast-path and full-path branches assign it
    const finalResponse = await finalizeResponse(
      rawResponse,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      finalActionResult!,
      ctx,
      trace,
      isMobile,
    );

    // ── 10. Add message to session context ────────────────────────────────────
    const userMsg: SessionMessage = { role: 'user', content: message, ts: Date.now() };
    const botMsg: SessionMessage = { role: 'assistant', content: finalResponse, ts: Date.now() };
    ctx.session.context.push(userMsg, botMsg);

    // ── 11. Async writes (fire and forget) ───────────────────────────────────
    const totalMs = Date.now() - startMs;
    Promise.allSettled([
      shortMemoryAgent.run(ctx, 'write', sessionId),
      longMemoryAgent.run(ctx, 'write', sessionId, message, finalResponse),
      monitoringAgent.run(ctx, trace.metrics),
      logAgent.run(ctx, 'chat_turn', {
        intent: intent.category,
        route: fastPathResult ? 'fast' : 'full',
        totalMs,
        pipeline_length: trace.pipeline.length,
      }),
      // Learn from high-confidence successful interactions
      selfOptimizationAgent
        .run(ctx, finalResponse)
        .then(r => {
          if (intent.confidence > 85 && r.success) {
            return semanticMemoryAgent.run(
              ctx,
              'write',
              undefined,
              `Q: ${message}\nA: ${r.response ?? finalResponse}`,
            );
          }
          return undefined;
        })
        .catch(() => {}),
    ]).catch(() => {});

    // ── 12. Build and return output ───────────────────────────────────────────
    const action = finalActionResult?.action ?? null;
    const actionPayload = finalActionResult?.actionPayload ?? {};

    return {
      success: true,
      response: finalResponse,
      action: action ?? null,
      data: actionPayload.data ?? null,
      coupon_valid: (actionPayload.coupon_valid as boolean) ?? null,
      discount: (actionPayload.discount as number) ?? null,
      product_id: (actionPayload.product_id as number) ?? null,
      product_name: (actionPayload.product_name as string) ?? null,
      product_price: (actionPayload.product_price as number) ?? null,
      link: (actionPayload.link as string) ?? null,
      pipeline: process.env.NODE_ENV === 'development' ? trace.pipeline : undefined,
    };
  }
}

export const orchestrator = new Orchestrator();
