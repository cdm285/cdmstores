/**
 * Agent 09 — Reasoning (prompt build + AI inference)
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 3: Reasoning — orchestrates two sub-steps in sequence:
 *   1. PROMPT BUILD   — assembles the final message array from prior context
 *   2. AI INFERENCE   — calls Llama 3.1 via Workers AI
 *   3. SELF-REPAIR    — single retry with a shorter prompt if response is bad
 *
 * Writes to ctx:
 *   ctx.aiResponse       — raw text from the model
 *   ctx.promptMessages   — full messages array (system + history + user)
 *   ctx.meta.aiModel     — model ID actually used
 *
 * Reads from ctx (populated by prior agents):
 *   ctx.semanticCtx      — RAG snippets (07-semantic-memory)
 *   ctx.recentOrders     — order history (08-episodic-memory)
 *   ctx.meta.contextStr  — formatted conversation window (04-context)
 *   ctx.session.language — preferred language (03-language)
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { AgentEnv } from '../core/types.js';

// ─── Model IDs ────────────────────────────────────────────────────────────────
const MODEL_SMALL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const MODEL_LARGE = '@cf/meta/llama-3.1-70b-instruct';

// ─── System prompt ────────────────────────────────────────────────────────────
const PERSONA_PT = `Você é o assistente virtual da CDM STORES, uma loja de eletrônicos premium.
Seja prestativo, conciso e amigável. Responda em Português do Brasil.
Nunca invente informações sobre preços, estoque ou pedidos que não esteja no contexto.
Seja direto. Máximo 3 frases por resposta, a menos que o usuário peça detalhes.`;

const PERSONA_EN = `You are the virtual assistant for CDM STORES, a premium electronics store.
Be helpful, concise, and friendly. Respond in English.
Never invent information about prices, stock, or orders not present in the context.
Be direct. Maximum 3 sentences per response unless the user asks for details.`;

const PERSONA_ES = `Eres el asistente virtual de CDM STORES, una tienda de electrónicos premium.
Sé servicial, conciso y amigable. Responde en español.
Nunca inventes información sobre precios, stock o pedidos que no estén en el contexto.
Sé directo. Máximo 3 oraciones por respuesta, a menos que el usuario pida detalles.`;

function getPersona(lang: string): string {
  if (lang === 'en') {return PERSONA_EN;}
  if (lang === 'es') {return PERSONA_ES;}
  return PERSONA_PT;
}

// ─── AiFlex cast (Workers AI dynamic typing) ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiFlex = { run(model: string, params: Record<string, unknown>): Promise<any> };

type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(ctx: ExtendedAgentContext, userMessage: string): PromptMessage[] {
  const lang = ctx.session.language ?? 'pt';
  let system  = getPersona(lang);

  // Append semantic RAG context
  if (ctx.semanticCtx) {
    system += `\n\nInformações relevantes da base de conhecimento:\n${ctx.semanticCtx}`;
  }

  // Append episodic (order history)
  if (ctx.recentOrders?.length) {
    const ordersText = ctx.recentOrders
      .map(o => {
        const id      = (o as Record<string, unknown>).orderId ?? (o as Record<string, unknown>).id;
        const status  = (o as Record<string, unknown>).status;
        const total   = (o as Record<string, unknown>).total;
        return `Pedido #${id}: ${status} (R$ ${total})`;
      })
      .join(', ');
    system += `\n\nHistórico recente do cliente: ${ordersText}`;
  }

  // Build messages array from conversation history
  const history: PromptMessage[] = ctx.session.context.map(m => ({
    role   : m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const messages: PromptMessage[] = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMessage },
  ];

  return messages;
}

// ─── AI call ──────────────────────────────────────────────────────────────────
async function callAI(ai: unknown, model: string, messages: PromptMessage[]): Promise<string> {
  const result = await (ai as AiFlex).run(model, { messages });
  return (result?.response ?? '').trim();
}

// ─── Quality check on response ────────────────────────────────────────────────
function isGoodResponse(response: string): boolean {
  return response.length >= 20 && response.length <= 2000;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent09Reasoning {
  readonly id   = '09-reasoning';
  readonly name = 'ReasoningAgent';
  readonly tier = 3;

  async execute(ctx: ExtendedAgentContext, userMessage: string): Promise<void> {
    const start = Date.now();
    const env   = ctx.env as AgentEnv;

    if (!env.AI) {
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: 0, error: 'AI binding missing' });
      return;
    }

    const useLarge = ctx.flags.useLargeModel;
    const model    = useLarge ? MODEL_LARGE : MODEL_SMALL;

    try {
      // 1. Build prompt
      const messages = buildPrompt(ctx, userMessage);
      ctx.promptMessages = messages;

      // 2. Primary AI call
      let response = await callAI(env.AI, model, messages);

      // 3. Self-repair: if response is bad and we're allowed to retry
      if (!isGoodResponse(response) && !ctx.flags.skipSelfRepair) {
        const shortMessages: PromptMessage[] = [
          messages[0], // system
          { role: 'user', content: userMessage },
        ];
        response = await callAI(env.AI, model, shortMessages);
      }

      if (!response) {
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error: 'Empty AI response after retry' });
        return;
      }

      ctx.aiResponse    = response;
      ctx.meta.aiModel  = model;

      addTrace(ctx, {
        agentId   : this.id,
        agentName : this.name,
        success   : true,
        latencyMs : Date.now() - start,
        confidence: isGoodResponse(response) ? 85 : 55,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
    }
  }
}

export const agent09Reasoning = new Agent09Reasoning();
export default agent09Reasoning;
