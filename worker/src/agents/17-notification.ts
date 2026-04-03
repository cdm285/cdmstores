/**
 * Agent 17 — Notification Sender (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatches notifications via email (Resend API) or WhatsApp deep-link.
 * Push notifications are recorded but stubbed (requires a push service).
 *
 * Templates:
 *   order_shipped    — "Your order has been shipped"
 *   coupon_applied   — "Your coupon was applied successfully"
 *   support_reply    — "Our support team has replied"
 *   generic          — Plain message with vars substituted
 *
 * Security:
 *   • Recipient email validated with regex before use
 *   • Template vars sanitized (stripped HTML + max length)
 *   • API key never logged
 *   • Resend API called only when env.RESEND_API_KEY is set
 */

import { addTrace, ExtendedAgentContext }   from '../core/agent-context.js';
import type { ActionRequest, ActionResult } from '../core/action-schema.js';
import { failedResult }                     from '../core/action-schema.js';
import type { AgentEnv }                    from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const RESEND_URL       = 'https://api.resend.com/emails';
const FROM_EMAIL       = 'no-reply@cdmstores.com';
const FROM_NAME        = 'CDM STORES';
const WHATSAPP_NUMBER  = '5511999999999';
const EMAIL_SAFE_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Template renderer ────────────────────────────────────────────────────────
const TEMPLATES: Record<string, (vars: Record<string, string>, lang: string) => { subject: string; html: string }> = {
  order_shipped: (vars, lang) => {
    const ord = vars.order_id ?? '—';
    const trk = vars.tracking_code ?? '—';
    if (lang === 'en') return { subject: `Your order #${ord} has been shipped!`, html: `<p>Great news! Your order <b>#${ord}</b> is on its way.<br>Tracking code: <b>${trk}</b></p>` };
    if (lang === 'es') return { subject: `¡Tu pedido #${ord} fue enviado!`, html: `<p>¡Buenas noticias! Tu pedido <b>#${ord}</b> está en camino.<br>Código de seguimiento: <b>${trk}</b></p>` };
    return { subject: `Seu pedido #${ord} foi enviado!`, html: `<p>Ótimas notícias! Seu pedido <b>#${ord}</b> está a caminho.<br>Código de rastreio: <b>${trk}</b></p>` };
  },
  coupon_applied: (vars, lang) => {
    const code = vars.code ?? '—';
    const disc = vars.discount ?? '0';
    if (lang === 'en') return { subject: `Coupon ${code} applied!`, html: `<p>Your coupon <b>${code}</b> was applied. You saved <b>R$ ${disc}</b> 🎉</p>` };
    if (lang === 'es') return { subject: `¡Cupón ${code} aplicado!`, html: `<p>Tu cupón <b>${code}</b> fue aplicado. ¡Ahorraste <b>R$ ${disc}</b> 🎉</p>` };
    return { subject: `Cupom ${code} aplicado!`, html: `<p>Seu cupom <b>${code}</b> foi aplicado. Você economizou <b>R$ ${disc}</b> 🎉</p>` };
  },
  support_reply: (vars, lang) => {
    const msg = vars.message ?? '';
    if (lang === 'en') return { subject: 'Our support team has replied', html: `<p>Our team responded to your request:<br><br><em>${msg}</em></p>` };
    if (lang === 'es') return { subject: 'Nuestro equipo de soporte respondió', html: `<p>Nuestro equipo respondió a tu solicitud:<br><br><em>${msg}</em></p>` };
    return { subject: 'Nossa equipe de suporte respondeu', html: `<p>Nossa equipe respondeu à sua solicitação:<br><br><em>${msg}</em></p>` };
  },
  generic: (vars, lang) => {
    const msg = vars.message ?? (lang === 'en' ? 'You have a new notification.' : lang === 'es' ? 'Tienes una nueva notificación.' : 'Você tem uma nova notificação.');
    if (lang === 'en') return { subject: 'CDM STORES Notification', html: `<p>${msg}</p>` };
    if (lang === 'es') return { subject: 'Notificación CDM STORES', html: `<p>${msg}</p>` };
    return { subject: 'Notificação CDM STORES', html: `<p>${msg}</p>` };
  },
};

function sanitizeVar(v: string): string {
  return v.replace(/<[^>]*>/g, '').slice(0, 512);
}

function sanitizeVars(vars?: Record<string, string>): Record<string, string> {
  if (!vars) return {};
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, sanitizeVar(v)]));
}

// ─── Email sender via Resend ──────────────────────────────────────────────────
async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const resp = await fetch(RESEND_URL, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], subject, html }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `Resend ${resp.status}: ${text.slice(0, 200)}` };
    }

    const json = await resp.json() as { id?: string };
    return { success: true, id: json.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent17Notification {
  readonly id   = '17-notification';
  readonly name = 'NotificationAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'notification_send') {
      return failedResult(req, 'Wrong payload type for Notification');
    }

    const { channel, recipient, template, vars } = req.payload.params;
    const lang      = req.language ?? 'pt';
    const safeVars  = sanitizeVars(vars);
    const env       = ctx.env as AgentEnv;

    try {
      // ── Email channel ─────────────────────────────────────────────────────
      if (channel === 'email') {
        if (!EMAIL_SAFE_RE.test(recipient)) {
          return failedResult(req, `Invalid email address: ${recipient.slice(0, 50)}`, Date.now() - start);
        }

        if (!env.RESEND_API_KEY) {
          // Dry-run: log to D1 ai_messages and return a success stub
          const dryMsg: Record<string, string> = {
            pt: `📧 Email de notificação será enviado para **${recipient}** (modo simulado — chave API não configurada).`,
            en: `📧 Notification email will be sent to **${recipient}** (dry-run — API key not set).`,
            es: `📧 Se enviará un email de notificación a **${recipient}** (modo simulado — clave API no configurada).`,
          };
          const result: ActionResult = { id: req.id, actionType: 'notification_send', success: true, response: dryMsg[lang] ?? dryMsg.pt, data: { channel, recipient, template, dryRun: true }, action: 'notification_sent', latencyMs: Date.now() - start, ts: Date.now() };
          addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
          return result;
        }

        const tmplFn      = TEMPLATES[template] ?? TEMPLATES.generic;
        const { subject, html } = tmplFn(safeVars, lang);
        const send        = await sendEmail(env.RESEND_API_KEY, recipient, subject, html);

        if (!send.success) {
          addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error: send.error });
          return failedResult(req, send.error ?? 'Email send failed', Date.now() - start);
        }

        const okMsg: Record<string, string> = {
          pt: `📧 Email enviado para **${recipient}** com sucesso!`,
          en: `📧 Email successfully sent to **${recipient}**!`,
          es: `📧 ¡Email enviado a **${recipient}** exitosamente!`,
        };
        const result: ActionResult = { id: req.id, actionType: 'notification_send', success: true, response: okMsg[lang] ?? okMsg.pt, data: { channel, recipient, emailId: send.id }, action: 'notification_sent', actionPayload: { channel, recipient }, latencyMs: Date.now() - start, ts: Date.now() };
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
        return result;
      }

      // ── WhatsApp channel ─────────────────────────────────────────────────
      if (channel === 'whatsapp') {
        const text = safeVars.message ?? (lang === 'en' ? 'You have a new notification from CDM STORES.' : lang === 'es' ? 'Tienes una nueva notificación de CDM STORES.' : 'Você tem uma nova notificação da CDM STORES.');
        const link = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
        const msg: Record<string, string> = {
          pt: `💬 [Clique aqui para ver sua notificação no WhatsApp](${link})`,
          en: `💬 [Click here to see your notification on WhatsApp](${link})`,
          es: `💬 [Haz clic aquí para ver tu notificación en WhatsApp](${link})`,
        };
        const result: ActionResult = { id: req.id, actionType: 'notification_send', success: true, response: msg[lang] ?? msg.pt, data: { channel, link }, action: 'notification_sent', actionPayload: { channel, link }, latencyMs: Date.now() - start, ts: Date.now() };
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
        return result;
      }

      // ── Push (stub) ──────────────────────────────────────────────────────
      const pushMsg: Record<string, string> = {
        pt: '🔔 Notificação push registrada. (Integração push pendente de configuração)',
        en: '🔔 Push notification registered. (Push integration pending setup)',
        es: '🔔 Notificación push registrada. (Integración push pendiente de configuración)',
      };
      const result: ActionResult = { id: req.id, actionType: 'notification_send', success: true, response: pushMsg[lang] ?? pushMsg.pt, data: { channel, recipient, template, stub: true }, action: 'notification_sent', latencyMs: Date.now() - start, ts: Date.now() };
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
      return failedResult(req, error, Date.now() - start);
    }
  }
}

export const agent17Notification = new Agent17Notification();
export default agent17Notification;
