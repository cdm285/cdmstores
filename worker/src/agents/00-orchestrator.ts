/**
 * Agent 00 — Main Orchestrator (Pipeline-based)
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates all numbered agents (01–09) through core/pipeline.ts.
 *
 * ┌──────────────────── Pipeline ─────────────────────────────────────────┐
 * │  SECURITY GATE      securityAgent + contentFilterAgent                │
 * │  TIER 1 (parallel)  agent01NLP + agent03Language → agent02Intent      │
 * │  EMOTION            emotionAgent (fast, no DB)                        │
 * │  MEMORY READ        agent05ShortMemory (read) + agent06LongMemory     │
 * │  EPISODIC           agent08EpisodicMemory (if email in entities)      │
 * │  ─── ROUTE BRANCH ─────────────────────────────────────────────────── │
 * │  TIER 4 FAST PATH   agent10ActionRouter dispatches 11–17              │
 * │  FULL AI PATH       agent04Context + agent07SemanticMemory            │
 * │                     + agent09Reasoning + personalityAgent + styleAgent│
 * │  ─── POST ─────────────────────────────────────────────────────────── │
 * │  QUALITY CHECK      qualityAgent + validationAgent                    │
 * │  MEMORY WRITE       agent05 (write) + agent06 (save) [async fire]     │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Returns OrchestratorOutput — same shape as the existing orchestrator.ts.
 */

import type { ContextInput, ExtendedAgentContext } from '../core/agent-context.js';
import { contextToOutput, createContext } from '../core/agent-context.js';
import type { AgentEnv, OrchestratorOutput } from '../core/types.js';

// ── Tier 4 action router ───────────────────────────────────────────────────────
import { agent10ActionRouter, buildRequestFromContext } from './10-action-router.js';

// ── Numbered agents (new architecture) ───────────────────────────────────────
import { agent01NLP } from './01-nlp.js';
import { agent02Intent } from './02-intent.js';
import { agent03Language } from './03-language.js';
import { agent04Context } from './04-context.js';
import { agent05ShortMemory } from './05-short-memory.js';
import { agent06LongMemory } from './06-long-memory.js';
import { agent07SemanticMemory } from './07-semantic-memory.js';
import { agent08EpisodicMemory } from './08-episodic-memory.js';
import { agent09Reasoning } from './09-reasoning.js';

// ── Existing action / quality / personality agents ────────────────────────────
import { whatsAppAgent } from './actions.js';
import { emotionAgent, personalityAgent, styleAgent } from './personality.js';
import { qualityAgent, selfRepairAgent, validationAgent } from './quality.js';
import { contentFilterAgent, securityAgent } from './security.js';

// ─── Helper: apply ActionResult fields to context ─────────────────────────────
function applyActionResult(
  ctx: ExtendedAgentContext,
  r: { action?: string; actionPayload?: Record<string, unknown>; response?: string },
): void {
  if (r.action) {
    ctx.lastAction = r.action;
  }
  if (r.actionPayload) {
    ctx.lastActionPayload = r.actionPayload ?? {};
  }
}

// ─── Fallback responses ───────────────────────────────────────────────────────
const FALLBACK: Record<string, string> = {
  pt: 'Desculpe, não consegui processar sua mensagem. Pode reformular?',
  en: 'Sorry, I could not process your message. Can you rephrase?',
  es: 'Lo siento, no pude procesar tu mensaje. ¿Puedes reformularlo?',
};

const BLOCKED: Record<string, string> = {
  pt: '⚠️ Sua mensagem não pôde ser processada por violar nossas políticas de uso.',
  en: '⚠️ Your message could not be processed as it violates our usage policies.',
  es: '⚠️ Tu mensaje no pudo ser procesado ya que viola nuestras políticas de uso.',
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export class MainOrchestrator {
  async process(
    input: ContextInput & { message: string },
    env: AgentEnv,
  ): Promise<OrchestratorOutput> {
    const ctx = createContext(input, env);
    const msg = input.message;

    // ── 1. Security gate ─────────────────────────────────────────────────────
    const secResult = await securityAgent.run(ctx, msg);
    if (!secResult.success) {
      const lang = ctx.detectedLang ?? 'pt';
      return { success: false, response: BLOCKED[lang] ?? BLOCKED.pt };
    }

    const filterResult = await contentFilterAgent.run(ctx, msg);
    if (!filterResult.success) {
      const lang = ctx.detectedLang ?? 'pt';
      return { success: false, response: BLOCKED[lang] ?? BLOCKED.pt };
    }

    // ── 2. Tier 1: NLP + Language (can run independently) ───────────────────
    await Promise.all([agent01NLP.execute(ctx, msg), agent03Language.execute(ctx, msg)]);

    // Intent needs entities from NLP (sequential after NLP)
    agent02Intent.execute(ctx, msg);

    // ── 3. Emotion ───────────────────────────────────────────────────────────
    const emotResult = await emotionAgent.run(ctx, msg);
    ctx.shouldEscalate = !!emotResult.data?.shouldEscalate;

    // ── 4. Memory read ────────────────────────────────────────────────────────
    const sessionId = ctx.session.sessionId;

    if (ctx.flags.shortMemory) {
      await agent05ShortMemory.execute(ctx, sessionId, 'read');
    }
    if (ctx.flags.longMemory) {
      await agent06LongMemory.execute(ctx, sessionId, 'load');
    }

    // ── 5. Episodic memory (only if email known) ─────────────────────────────
    await agent08EpisodicMemory.execute(ctx);

    // ── 6. Escalation shortcut ────────────────────────────────────────────────
    if (ctx.shouldEscalate) {
      const r = await whatsAppAgent.run(ctx);
      applyActionResult(ctx, r);
      return this.finalize(
        ctx,
        r.response ?? FALLBACK[ctx.detectedLang] ?? FALLBACK.pt,
        sessionId,
        msg,
      );
    }

    // ── 7. Route ──────────────────────────────────────────────────────────────
    const intent = ctx.intent;
    const route = ctx.flags.forceFullPath ? 'full' : (ctx.intentRoute ?? 'full');

    let finalResponse: string | null = null;

    // ── 7a. Tier 4 fast path — ActionRouter ──────────────────────────────────
    if (
      route === 'fast' &&
      intent &&
      intent !== 'unknown' &&
      intent !== 'greeting' &&
      intent !== 'farewell'
    ) {
      const actionReq = buildRequestFromContext(ctx);
      if (actionReq) {
        const actionResult = await agent10ActionRouter.execute(ctx, actionReq);
        applyActionResult(ctx, actionResult);
        if (actionResult.success && actionResult.response) {
          finalResponse = actionResult.response;
        }
        // On failure, fall through to full AI path (graceful degradation)
      }
    }

    // ── 7b. Greetings / farewells — no AI needed ─────────────────────────────
    if (!finalResponse && (intent === 'greeting' || intent === 'farewell')) {
      const greetMap: Record<string, Record<string, string>> = {
        greeting: {
          pt: '👋 Olá! Como posso te ajudar hoje com a CDM STORES?',
          en: '👋 Hello! How can I help you with CDM STORES today?',
          es: '👋 ¡Hola! ¿Cómo puedo ayudarte con CDM STORES hoy?',
        },
        farewell: {
          pt: '😊 Até logo! Foi um prazer te atender!',
          en: '😊 Goodbye! It was a pleasure helping you!',
          es: '😊 ¡Hasta luego! ¡Fue un placer atenderte!',
        },
      };
      finalResponse = greetMap[intent]?.[ctx.detectedLang] ?? greetMap[intent]?.pt ?? null;
    }

    // ── 8. Full AI path if no fast response ───────────────────────────────────
    if (!finalResponse) {
      // Assemble context window
      agent04Context.execute(ctx);

      // Semantic memory (RAG)
      if (ctx.flags.semanticMemory) {
        await agent07SemanticMemory.execute(ctx, msg);
      }

      // Main reasoning
      await agent09Reasoning.execute(ctx, msg);

      finalResponse = ctx.aiResponse || null;
    }

    // ── 9. Personality + style post-processing ────────────────────────────────
    if (finalResponse) {
      ctx.meta.ai_response = finalResponse;
      ctx.meta.ai_language = ctx.detectedLang;
      const personResult = await personalityAgent.run(ctx, finalResponse);
      const styleResult = await styleAgent.run(ctx, personResult.response ?? finalResponse);
      const styled = styleResult.response ?? personResult.response ?? finalResponse;
      if (styled) {
        finalResponse = styled;
      }
    }

    if (finalResponse) {
      ctx.meta.ai_response = finalResponse;
      const qualResult = await qualityAgent.run(ctx, finalResponse);
      ctx.qualityScore = (qualResult.data?.score as number) ?? 70;

      if (!qualResult.data?.passed && !ctx.flags.skipSelfRepair) {
        const repairResult = await selfRepairAgent.run(ctx, finalResponse);
        if (repairResult.response) {
          finalResponse = repairResult.response;
        }
      }

      const valResult = await validationAgent.run(ctx, finalResponse ?? '');
      if (valResult.response) {
        finalResponse = valResult.response;
      }
    }

    finalResponse ??= FALLBACK[ctx.detectedLang] ?? FALLBACK.pt;

    // ── 11. Async memory writes (fire-and-forget) ────────────────────────────
    if (ctx.flags.shortMemory) {
      agent05ShortMemory.execute(ctx, sessionId, 'write').catch(() => void 0);
    }
    if (ctx.flags.longMemory && ctx.conversationId) {
      agent06LongMemory.execute(ctx, sessionId, 'save', msg, finalResponse).catch(() => void 0);
    }

    return this.finalize(ctx, finalResponse, sessionId, msg);
  }

  private finalize(
    ctx: ExtendedAgentContext,
    response: string,
    _sessionId: string,
    _msg: string,
  ): OrchestratorOutput {
    return contextToOutput(ctx, response);
  }
}

export const mainOrchestrator = new MainOrchestrator();
export default mainOrchestrator;
