/**
 * CDM STORES — Tier 4 Action Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Central type library for all Tier 4 action agents.
 *
 * Design principles:
 *   • Every action is a discriminated union — no `any`
 *   • Payloads are validated before dispatch (sanitized strings, range checks)
 *   • Results carry a typed `data` field alongside the human-readable `response`
 *   • All IDs are tagged for traceability
 *   • Sensitive fields (emails, tokens) are listed for log-scrubbing guards
 */

// ─── Action type identifiers ──────────────────────────────────────────────────
export type ActionType =
  | 'product_lookup'
  | 'coupon_validate'
  | 'order_track'
  | 'shipping_estimate'
  | 'support_escalate'
  | 'db_write'
  | 'notification_send';

// ─── Allowed DB tables (allowlist for db_write security) ─────────────────────
const ALLOWED_TABLES = new Set([
  'ai_messages',
  'ai_conversations',
  'notifications',
  'sessions',
  'cart_items',
]);

/** Returns true if the table is on the allowlist */
export function isAllowedTable(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

// ─── Per-action payload shapes ────────────────────────────────────────────────

export interface ProductLookupParams {
  /** D1 product row id (preferred) */
  product_id?: number;
  /** Free-text search term when no product_id known */
  query?: string;
  /** Return full catalog when true and product_id is absent */
  full_catalog?: boolean;
}

export interface CouponValidateParams {
  /** Raw coupon code as typed by the user */
  code: string;
  /** Optional cart subtotal for minimum-spend checks */
  cart_total?: number;
}

export interface OrderTrackParams {
  /** Carrier/postal tracking code (e.g. AA123456789BR) */
  tracking_code?: string;
  /** CDM internal order id */
  order_id?: number;
  /** Customer email — used when no code/id available */
  email?: string;
}

export interface ShippingParams {
  /** Brazilian CEP without hyphen, e.g. "01310100" */
  postal_code: string;
  /** Product ids in the hypothetical cart */
  product_ids?: number[];
  /** Cart total for free-shipping threshold */
  cart_total?: number;
}

export interface SupportEscalateParams {
  /** Short reason for escalation (e.g. "negative_sentiment") */
  reason: string;
  /** Customer email if known */
  email?: string;
  /** Session / conversation id for context lookup */
  session_id: string;
  /** Preferred language for the escalation message */
  language?: 'pt' | 'en' | 'es';
}

export interface DbWriteParams {
  /** DML operation */
  operation: 'insert' | 'update';
  /** D1 table name — validated against allowlist */
  table: string;
  /** Column values to write */
  data: Record<string, string | number | boolean | null>;
  /** WHERE clause columns (update only) */
  where?: Record<string, string | number>;
}

export interface NotificationParams {
  /** Delivery channel */
  channel: 'email' | 'whatsapp' | 'push';
  /** Email address or phone number */
  recipient: string;
  /** Template identifier */
  template: 'order_shipped' | 'coupon_applied' | 'support_reply' | 'generic';
  /** Template variable substitutions */
  vars?: Record<string, string>;
}

// ─── Discriminated union for dispatch ────────────────────────────────────────
export type ActionPayloadData =
  | { type: 'product_lookup'; params: ProductLookupParams }
  | { type: 'coupon_validate'; params: CouponValidateParams }
  | { type: 'order_track'; params: OrderTrackParams }
  | { type: 'shipping_estimate'; params: ShippingParams }
  | { type: 'support_escalate'; params: SupportEscalateParams }
  | { type: 'db_write'; params: DbWriteParams }
  | { type: 'notification_send'; params: NotificationParams };

// ─── Full action request (envelope) ──────────────────────────────────────────
export interface ActionRequest {
  /** Unique per-request ID for correlation */
  id: string;
  actionType: ActionType;
  sessionId: string;
  userId?: string;
  language: 'pt' | 'en' | 'es';
  payload: ActionPayloadData;
  /** Unix ms timestamp */
  ts: number;
}

// ─── Action result (returned by every Tier 4 agent) ──────────────────────────
export interface ActionResult {
  /** Mirrors ActionRequest.id */
  id: string;
  actionType: ActionType;
  success: boolean;
  /** Human-readable response to be included in the final chat reply */
  response: string;
  /** Structured machine-readable data (varies per action) */
  data?: unknown;
  /** Frontend action tag (mirrors existing OrchestratorOutput.action) */
  action?: string;
  /** Frontend payload (mirrors existing OrchestratorOutput + data fields) */
  actionPayload?: Record<string, unknown>;
  error?: string;
  latencyMs: number;
  ts: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────
/**
 * Validates an ActionRequest before dispatch.
 * @returns An error message string, or `null` if the request is valid.
 */
export function validateActionRequest(req: ActionRequest): string | null {
  if (!req.id || typeof req.id !== 'string') {
    return 'Missing request id';
  }
  if (!req.sessionId) {
    return 'Missing sessionId';
  }
  if (!req.payload?.type) {
    return 'Missing payload.type';
  }

  switch (req.payload.type) {
    case 'product_lookup': {
      const p = req.payload.params;
      if (!p.product_id && !p.query && !p.full_catalog) {
        return 'product_lookup: product_id, query, or full_catalog required';
      }
      break;
    }
    case 'coupon_validate': {
      const p = req.payload.params;
      if (!p.code || typeof p.code !== 'string') {
        return 'coupon_validate: code required';
      }
      if (p.code.length > 32) {
        return 'coupon_validate: code too long';
      }
      break;
    }
    case 'order_track': {
      const p = req.payload.params;
      if (!p.tracking_code && !p.order_id && !p.email) {
        return 'order_track: tracking_code, order_id, or email required';
      }
      break;
    }
    case 'shipping_estimate': {
      const p = req.payload.params;
      if (!p.postal_code || !/^\d{8}$/.test(p.postal_code)) {
        return 'shipping_estimate: valid 8-digit postal_code required';
      }
      break;
    }
    case 'support_escalate': {
      const p = req.payload.params;
      if (!p.reason) {
        return 'support_escalate: reason required';
      }
      if (!p.session_id) {
        return 'support_escalate: session_id required';
      }
      break;
    }
    case 'db_write': {
      const p = req.payload.params;
      if (!isAllowedTable(p.table)) {
        return `db_write: table "${p.table}" not allowed`;
      }
      if (!p.data || typeof p.data !== 'object') {
        return 'db_write: data object required';
      }
      if (p.operation !== 'insert' && p.operation !== 'update') {
        return 'db_write: operation must be insert or update';
      }
      if (p.operation === 'update' && (!p.where || Object.keys(p.where).length === 0)) {
        return 'db_write: update requires where clause';
      }
      break;
    }
    case 'notification_send': {
      const p = req.payload.params;
      if (!p.recipient) {
        return 'notification_send: recipient required';
      }
      if (!p.template) {
        return 'notification_send: template required';
      }
      if (!p.channel) {
        return 'notification_send: channel required';
      }
      break;
    }
    default:
      return `Unknown action type`;
  }

  return null;
}

// ─── Factory helpers ──────────────────────────────────────────────────────────
/** Creates an ActionRequest with a generated ID and timestamp. */
export function buildActionRequest(
  actionType: ActionType,
  payload: ActionPayloadData,
  sessionId: string,
  language: 'pt' | 'en' | 'es' = 'pt',
  userId?: string,
): ActionRequest {
  return {
    id: `${actionType}-${sessionId}-${Date.now()}`,
    actionType,
    sessionId,
    userId,
    language,
    payload,
    ts: Date.now(),
  };
}

/** Builds a failed ActionResult quickly. */
export function failedResult(req: ActionRequest, error: string, latencyMs = 0): ActionResult {
  const fallbackMsg: Record<string, string> = {
    pt: 'Não consegui completar essa ação. Tente novamente.',
    en: 'Could not complete that action. Please try again.',
    es: 'No pude completar esa acción. Por favor inténtalo de nuevo.',
  };
  return {
    id: req.id,
    actionType: req.actionType,
    success: false,
    response: fallbackMsg[req.language] ?? fallbackMsg.pt,
    error,
    latencyMs,
    ts: Date.now(),
  };
}
