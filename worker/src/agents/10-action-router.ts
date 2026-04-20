/**
 * Agent 10 — Action Router (Tier 4 Gateway)
 * ─────────────────────────────────────────────────────────────────────────────
 * Central dispatch point for all Tier 4 action agents.
 *
 * Responsibilities:
 *   1. Receive an ActionRequest from the Orchestrator
 *   2. Validate the request against the action schema
 *   3. Route to the correct Tier 4 agent
 *   4. Return a typed ActionResult
 *   5. Record a trace entry in the ExtendedAgentContext
 *
 * The router itself is stateless — it does not mutate ctx beyond calling
 * addTrace and writing the result to ctx.meta.lastActionResult.
 *
 * Intent → ActionType mapping (built-in shortcut used by the orchestrator):
 *   tracking      → order_track
 *   coupon        → coupon_validate
 *   product_query → product_lookup
 *   cart_action   → product_lookup (then add_to_cart frontend action)
 *   order_history → order_track (by email)
 *   schedule      → support_escalate (with reason='schedule')
 *   whatsapp      → support_escalate (with reason='whatsapp')
 *   notification  → notification_send
 *   payment       → product_lookup (payment info template)
 *   shipping      → shipping_estimate
 */

import type { ExtendedAgentContext } from '../core/agent-context.js';
import { addTrace } from '../core/agent-context.js';
import type { ActionRequest, ActionResult, ActionType } from '../core/action-schema.js';
import { validateActionRequest, failedResult, buildActionRequest } from '../core/action-schema.js';
import type { IntentCategory } from '../core/types.js';

// ── Tier 4 agents ─────────────────────────────────────────────────────────────
import { agent11ProductLookup } from './11-product-lookup.js';
import { agent12CouponValidation } from './12-coupon-validation.js';
import { agent13OrderTracking } from './13-order-tracking.js';
import { agent14Shipping } from './14-shipping.js';
import { agent15SupportEscalation } from './15-support-escalation.js';
import { agent16DatabaseWrite } from './16-database-write.js';
import { agent17Notification } from './17-notification.js';

// ─── Intent → ActionType map ──────────────────────────────────────────────────
const INTENT_TO_ACTION: Partial<Record<IntentCategory, ActionType>> = {
  tracking: 'order_track',
  coupon: 'coupon_validate',
  product_query: 'product_lookup',
  cart_action: 'product_lookup',
  order_history: 'order_track',
  schedule: 'support_escalate',
  whatsapp: 'support_escalate',
  notification: 'notification_send',
  payment: 'product_lookup',
};

/** Maps an intent to the Tier 4 ActionType, or null if not actionable. */
export function intentToActionType(intent: IntentCategory | null): ActionType | null {
  if (!intent) {
    return null;
  }
  return INTENT_TO_ACTION[intent] ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export class Agent10ActionRouter {
  readonly id = '10-action-router';
  readonly name = 'ActionRouter';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, request: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    // 1. Schema validation
    const validationError = validateActionRequest(request);
    if (validationError) {
      const result = failedResult(request, `Validation: ${validationError}`);
      addTrace(ctx, {
        agentId: this.id,
        agentName: this.name,
        success: false,
        latencyMs: 0,
        error: result.error,
      });
      ctx.meta.lastActionResult = result;
      return result;
    }

    // 2. Dispatch
    let result: ActionResult;

    try {
      switch (request.payload.type) {
        case 'product_lookup':
          result = await agent11ProductLookup.execute(ctx, request);
          break;
        case 'coupon_validate':
          result = await agent12CouponValidation.execute(ctx, request);
          break;
        case 'order_track':
          result = await agent13OrderTracking.execute(ctx, request);
          break;
        case 'shipping_estimate':
          result = await agent14Shipping.execute(ctx, request);
          break;
        case 'support_escalate':
          result = await agent15SupportEscalation.execute(ctx, request);
          break;
        case 'db_write':
          result = await agent16DatabaseWrite.execute(ctx, request);
          break;
        case 'notification_send':
          result = await agent17Notification.execute(ctx, request);
          break;
        default:
          result = failedResult(request, 'Unknown action type');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result = failedResult(request, `Router dispatch error: ${error}`, Date.now() - start);
    }

    // 3. Write result to context for downstream agents
    ctx.meta.lastActionResult = result;
    if (result.action) {
      ctx.lastAction = result.action;
    }
    if (result.actionPayload) {
      ctx.lastActionPayload = result.actionPayload;
    }

    // 4. Trace
    addTrace(ctx, {
      agentId: this.id,
      agentName: this.name,
      success: result.success,
      latencyMs: Date.now() - start,
      error: result.error,
    });

    return result;
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────
/**
 * Builds an ActionRequest from the current context's intent and entities.
 * Returns null if the intent is not actionable via Tier 4.
 */
export function buildRequestFromContext(ctx: ExtendedAgentContext): ActionRequest | null {
  const intent = ctx.intent;
  const actionType = intentToActionType(intent);
  if (!actionType) {
    return null;
  }

  const lang = ctx.session.language ?? 'pt';
  const sessionId = ctx.session.sessionId;
  const userId = ctx.session.userId;
  const entities = ctx.entities ?? {};

  switch (actionType) {
    case 'product_lookup':
      return buildActionRequest(
        'product_lookup',
        {
          type: 'product_lookup',
          params: {
            product_id: entities.product_id !== undefined ? Number(entities.product_id) : undefined,
            query: entities.product_name !== undefined ? String(entities.product_name) : undefined,
            full_catalog: !entities.product_id && !entities.product_name,
          },
        },
        sessionId,
        lang,
        userId,
      );

    case 'coupon_validate':
      return buildActionRequest(
        'coupon_validate',
        {
          type: 'coupon_validate',
          params: {
            code: String(entities.coupon ?? '')
              .toUpperCase()
              .trim(),
            cart_total: entities.quantity ? Number(entities.quantity) : undefined,
          },
        },
        sessionId,
        lang,
        userId,
      );

    case 'order_track': {
      const params = {
        tracking_code: entities.tracking_code ? String(entities.tracking_code) : undefined,
        order_id: entities.order_id ? Number(entities.order_id) : undefined,
        email: entities.email ? String(entities.email) : undefined,
      };
      if (!params.tracking_code && !params.order_id && !params.email) {
        return null;
      }
      return buildActionRequest(
        'order_track',
        { type: 'order_track', params },
        sessionId,
        lang,
        userId,
      );
    }

    case 'support_escalate': {
      const reason =
        intent === 'whatsapp'
          ? 'whatsapp_request'
          : intent === 'schedule'
            ? 'schedule_request'
            : 'user_request';
      return buildActionRequest(
        'support_escalate',
        {
          type: 'support_escalate',
          params: {
            reason,
            email: entities.email ? String(entities.email) : undefined,
            session_id: sessionId,
            language: lang,
          },
        },
        sessionId,
        lang,
        userId,
      );
    }

    case 'notification_send':
      return buildActionRequest(
        'notification_send',
        {
          type: 'notification_send',
          params: {
            channel: 'email',
            recipient: entities.email ? String(entities.email) : '',
            template: 'generic',
          },
        },
        sessionId,
        lang,
        userId,
      );

    default:
      return null;
  }
}

export const agent10ActionRouter = new Agent10ActionRouter();
export default agent10ActionRouter;
