/**
 * Agent 15 — Support Escalation (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles requests to speak with a human, schedule support, or escalate due
 * to negative sentiment. Generates WhatsApp deep-links and support context.
 *
 * Escalation reasons:
 *   'whatsapp_request'  — user explicitly asked for WhatsApp chat
 *   'schedule_request'  — user wants to book a support slot
 *   'negative_sentiment'— implicit escalation from emotion agent
 *   'user_request'      — generic "I want to talk to someone"
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace }   from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult }                     from '../core/action-schema.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const WHATSAPP_NUMBER = '5511999999999'; // E.164 without +
const SUPPORT_EMAIL   = 'support@cdmstores.com';
const SCHEDULE_URL    = 'https://cdmstores.com/pages/agendar';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function waLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function whatsappMsg(lang: string): string {
  if (lang === 'en') {return 'Hello! I need help with my CDM STORES order.';}
  if (lang === 'es') {return '¡Hola! Necesito ayuda con mi pedido de CDM STORES.';}
  return 'Olá! Preciso de ajuda com meu pedido na CDM STORES.';
}

function buildEscalationResponse(reason: string, lang: string): string {
  const link = waLink(whatsappMsg(lang));

  if (reason === 'schedule_request') {
    if (lang === 'en') {return `📅 **Book Support**\n\n⏰ Available: Mon–Fri 9am–6pm · Sat 9am–1pm\n\n👉 [Book online](${SCHEDULE_URL})\n💬 [Chat on WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}`;}
    if (lang === 'es') {return `📅 **Agendar Atención**\n\n⏰ Horario: Lun–Vie 9h–18h · Sáb 9h–13h\n\n👉 [Reservar en línea](${SCHEDULE_URL})\n💬 [Chat en WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}`;}
    return `📅 **Agendar Atendimento**\n\n⏰ Horários: Seg–Sex 9h–18h · Sáb 9h–13h\n\n👉 [Agendar online](${SCHEDULE_URL})\n💬 [Chat no WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}`;
  }

  if (reason === 'negative_sentiment') {
    if (lang === 'en') {return `😔 I can see you're having trouble. Let me connect you to our support team.\n\n💬 [Chat on WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}\n\nWe respond within 2 business hours.`;}
    if (lang === 'es') {return `😔 Veo que estás teniendo dificultades. Te conecto con nuestro equipo de soporte.\n\n💬 [Chat en WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}\n\nRespondemos en 2 horas hábiles.`;}
    return `😔 Vejo que está tendo dificuldades. Vou te conectar com nossa equipe de suporte.\n\n💬 [Chat no WhatsApp](${link})\n📧 ${SUPPORT_EMAIL}\n\nRespondemos em até 2 horas úteis.`;
  }

  // whatsapp_request or generic
  if (lang === 'en') {return `💬 **Chat with Us on WhatsApp**\n\n[Click here to start the chat](${link})\n\n📧 Or email us: ${SUPPORT_EMAIL}\n\n⏰ Support hours: Mon–Fri 9am–6pm`;}
  if (lang === 'es') {return `💬 **Chatea con Nosotros en WhatsApp**\n\n[Haz clic aquí para chatear](${link})\n\n📧 O escríbenos a: ${SUPPORT_EMAIL}\n\n⏰ Horario: Lun–Vie 9h–18h`;}
  return `💬 **Fale Conosco no WhatsApp**\n\n[Clique aqui para iniciar o chat](${link})\n\n📧 Ou envie um email: ${SUPPORT_EMAIL}\n\n⏰ Suporte: Seg–Sex 9h–18h`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent15SupportEscalation {
  readonly id   = '15-support-escalation';
  readonly name = 'SupportEscalationAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'support_escalate') {
      return failedResult(req, 'Wrong payload type for SupportEscalation');
    }

    const { reason, language } = req.payload.params;
    const lang     = language ?? req.language ?? 'pt';
    const link     = waLink(whatsappMsg(lang));

    try {
      const response = buildEscalationResponse(reason, lang);

      const actionTag = reason === 'schedule_request' ? 'schedule_support' : 'whatsapp_link';

      const result: ActionResult = {
        id           : req.id,
        actionType   : 'support_escalate',
        success      : true,
        response,
        data         : { reason, whatsappLink: link, scheduleUrl: SCHEDULE_URL },
        action       : actionTag,
        actionPayload: { link, support_email: SUPPORT_EMAIL, reason },
        latencyMs    : Date.now() - start,
        ts           : Date.now(),
      };

      // Mark context so orchestrator skips further AI reasoning
      ctx.shouldEscalate = true;

      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
      return failedResult(req, error, Date.now() - start);
    }
  }
}

export const agent15SupportEscalation = new Agent15SupportEscalation();
export default agent15SupportEscalation;
