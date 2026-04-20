/**
 * Agent 09 — ReasoningAgent     Chain-of-thought via Llama 3 (only AI-call agent in fast path)
 * Agent 10 — PlanningAgent      Decompose complex tasks
 * Agent 12 — SummarizationAgent Compress long history
 * Agent 16 — PromptingAgent     Build optimal system prompt
 */

import type { AgentContext, AgentResult} from '../core/types.js';
import { BaseAgent, SessionMessage } from '../core/types.js';

const SYSTEM_PROMPT_BASE = `Você é o assistente da CDM STORES, uma loja online premium de eletrônicos.
Seja prestativo, conciso e focado em ajudar o cliente.
Produtos: Fone Bluetooth (R$ 89,90), Carregador USB-C 65W (R$ 49,90), Cabo Lightning 2m (R$ 29,90), Caixa de Som Portátil (R$ 149,90).
Frete: R$ 15,00. Parcela em até 12x. Cupons: NEWYEAR, PROMO, DESCONTO10, SAVE20, CDM10.
Horário de atendimento: Seg-Sex 9h-18h, Sáb 9h-13h.
Responda no mesmo idioma do usuário. Seja direto.`;

// ─── Agent 16 — PromptingAgent ────────────────────────────────────────────────
export class PromptingAgent extends BaseAgent {
  readonly id = '16-prompting';
  readonly name = 'PromptingAgent';

  async run(ctx: AgentContext, userMessage: string): Promise<AgentResult> {
    const t = this.start();

    let systemContent = SYSTEM_PROMPT_BASE;

    // Append semantic context if retrieved
    if (ctx.meta.semantic_context) {
      systemContent += `\n\nContexto relevante da base de conhecimento:\n${ctx.meta.semantic_context}`;
    }

    // Append episodic context if available
    const orders = ctx.meta.recent_orders as Array<{ id: number; status: string; total: number }> | undefined;
    if (orders?.length) {
      const ordersText = orders.map(o => `Pedido #${o.id}: ${o.status} (R$ ${o.total})`).join(', ');
      systemContent += `\n\nHistórico recente do cliente: ${ordersText}`;
    }

    // Language-specific tone
    const lang = ctx.session.language;
    if (lang === 'en') {
      systemContent = systemContent
        .replace('Você é o assistente', 'You are the assistant')
        .replace('Seja prestativo, conciso', 'Be helpful, concise')
        .replace('Responda no mesmo idioma do usuário.', 'Respond in English.')
        .replace('Seja direto.', 'Be direct.');
    } else if (lang === 'es') {
      systemContent = systemContent
        .replace('Você é o assistente', 'Eres el asistente')
        .replace('Seja prestativo, conciso', 'Sé servicial, conciso')
        .replace('Responda no mesmo idioma do usuário.', 'Responde en español.')
        .replace('Seja direto.', 'Sé directo.');
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
      ...ctx.session.context.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    ctx.meta.prompt_messages = messages;

    return this.ok(this.id, { data: { messages: messages.length, systemLength: systemContent.length } }, t);
  }
}

// ─── Agent 09 — ReasoningAgent ────────────────────────────────────────────────
export class ReasoningAgent extends BaseAgent {
  readonly id = '09-reasoning';
  readonly name = 'ReasoningAgent';

  async run(ctx: AgentContext, useLargeModel = false): Promise<AgentResult> {
    const t = this.start();

    const messages = ctx.meta.prompt_messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    if (!messages?.length) {
      return this.fail(this.id, 'No prompt prepared — run PromptingAgent first', t);
    }

    try {
      const model = useLargeModel
        ? '@cf/meta/llama-3.1-70b-instruct'
        : '@cf/meta/llama-3.1-8b-instruct-fp8';

      // Cast required: Workers AI TypeScript types may lag behind available models
      type AiFlex = { run(model: string, params: unknown): Promise<{ response: string }> };
      const result = await (ctx.env.AI as unknown as AiFlex).run(model, { messages });
      const response = result.response?.trim() ?? '';

      if (!response) {return this.fail(this.id, 'Empty AI response', t);}

      ctx.meta.ai_response = response;
      ctx.meta.ai_model = model;

      return this.ok(this.id, { response, data: { model, chars: response.length }, confidence: 80 }, t);
    } catch (error) {
      return this.fail(this.id, `AI call failed: ${(error as Error).message}`, t);
    }
  }
}

// ─── Agent 10 — PlanningAgent ─────────────────────────────────────────────────
export class PlanningAgent extends BaseAgent {
  readonly id = '10-planning';
  readonly name = 'PlanningAgent';

  async run(ctx: AgentContext, task: string): Promise<AgentResult> {
    const t = this.start();

    // Decompose complex tasks into steps (rule-based, no AI cost)
    const steps: string[] = [];

    if (task.includes('pedido') || task.includes('order')) {
      steps.push('extract_email', 'query_orders', 'format_response');
    } else if (task.includes('rastr') || task.includes('track')) {
      steps.push('extract_tracking_code', 'query_db', 'format_status');
    } else if (task.includes('cupom') || task.includes('coupon')) {
      steps.push('extract_coupon_code', 'validate_coupon', 'apply_discount');
    } else if (task.includes('adicionar') || task.includes('cart')) {
      steps.push('identify_product', 'add_to_cart', 'confirm');
    } else {
      steps.push('analyze_intent', 'retrieve_context', 'generate_response');
    }

    ctx.meta.plan_steps = steps;
    return this.ok(this.id, { data: { steps, count: steps.length } }, t);
  }
}

// ─── Agent 12 — SummarizationAgent ───────────────────────────────────────────
export class SummarizationAgent extends BaseAgent {
  readonly id = '12-summarization';
  readonly name = 'SummarizationAgent';

  // Compress history when too long (rule-based — no AI call to save neurons)
  async run(ctx: AgentContext, maxMessages = 10): Promise<AgentResult> {
    const t = this.start();

    if (ctx.session.context.length <= maxMessages) {
      return this.ok(this.id, { data: { compressed: false, count: ctx.session.context.length } }, t);
    }

    // Keep system messages and last N turns
    const system = ctx.session.context.filter(m => m.role === 'system');
    const recent = ctx.session.context
      .filter(m => m.role !== 'system')
      .slice(-maxMessages);

    ctx.session.context = [...system, ...recent];

    return this.ok(this.id, { data: { compressed: true, reduced_to: ctx.session.context.length } }, t);
  }
}

export const promptingAgent = new PromptingAgent();
export const reasoningAgent = new ReasoningAgent();
export const planningAgent = new PlanningAgent();
export const summarizationAgent = new SummarizationAgent();
