/**
 * CDM STORES — Stripe routes (manual HTTP, no SDK)
 * POST /api/stripe/create-payment
 * POST /api/stripe/webhook
 */

import { requireAuth } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import type { Env } from '../lib/response.js';
import { internalError, json } from '../lib/response.js';
import { auditLog, verifyStripeWebhookSignature } from '../lib/security.js';
import { calculateOrderTotal } from './orders.js';

// POST /api/stripe/create-payment
export async function handleStripeCreatePayment(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    if (!env.STRIPE_SECRET_KEY) {
      return json({ success: false, error: 'Stripe não configurado' }, 500);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const { orderId, items } = body as {
      orderId?: number;
      items?: Array<{ product_id: number; quantity: number; price: number }>;
    };

    if (!orderId || !items || !Array.isArray(items)) {
      return json({ success: false, error: 'Dados incompletos' }, 400);
    }

    // [CRÍTICO-03] Recalcular total no servidor — never trust client price
    const calculated = await calculateOrderTotal(env, items);
    if (!calculated) {
      return json({ success: false, error: 'Produto inválido ou sem estoque' }, 400);
    }

    const lineItems = calculated.enrichedItems.map(item => ({
      price_data: {
        currency: 'brl',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    lineItems.push({
      price_data: { currency: 'brl', product_data: { name: 'Frete' }, unit_amount: 1500 },
      quantity: 1,
    } as (typeof lineItems)[0]);

    const stripeData = new URLSearchParams();
    stripeData.append('payment_method_types[]', 'card');
    stripeData.append('mode', 'payment');
    stripeData.append('success_url', 'https://cdmstores.com/pages/checkout.html?success=true');
    stripeData.append('cancel_url', 'https://cdmstores.com/pages/checkout.html?canceled=true');
    stripeData.append('metadata[order_id]', orderId.toString());

    lineItems.forEach((item, index) => {
      stripeData.append(`line_items[${index}][price_data][currency]`, item.price_data.currency);
      stripeData.append(
        `line_items[${index}][price_data][unit_amount]`,
        item.price_data.unit_amount.toString(),
      );
      stripeData.append(
        `line_items[${index}][price_data][product_data][name]`,
        item.price_data.product_data.name,
      );
      stripeData.append(`line_items[${index}][quantity]`, item.quantity.toString());
    });

    const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeData,
    });

    const stripeSession = (await stripeResponse.json()) as Record<string, unknown>;

    if (!stripeResponse.ok) {
      logger.error('Stripe error:', stripeSession.error);
      return json({ success: false, error: 'Erro ao criar sessão de pagamento' }, 400);
    }

    await env.DB.prepare(
      'UPDATE orders SET stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?',
    )
      .bind(stripeSession.id, orderId, authResult.auth.userId)
      .run();

    return json({ success: true, checkout_url: stripeSession.url, session_id: stripeSession.id });
  } catch (error) {
    return internalError(error, 'stripe/create-payment');
  }
}

// POST /api/stripe/webhook
export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      logger.error('[Webhook] STRIPE_WEBHOOK_SECRET não configurado');
      return json({ error: 'Webhook não configurado' }, 500);
    }

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!verifyStripeWebhookSignature(body, sig, env.STRIPE_WEBHOOK_SECRET)) {
      logger.warn('[Webhook] Assinatura inválida ou evento expirado');
      await auditLog(env, null, 'stripe_webhook_invalid_signature', { sig: sig?.substring(0, 20) });
      return json({ error: 'Assinatura inválida' }, 401);
    }

    const event = JSON.parse(body);
    logger.log(`[Webhook] Evento verificado: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;

      if (orderId && /^\d+$/.test(String(orderId))) {
        const existing = await env.DB.prepare(
          'SELECT id FROM orders WHERE stripe_payment_id = ? LIMIT 1',
        )
          .bind(session.id)
          .first();

        if (!existing) {
          await env.DB.prepare(
            'UPDATE orders SET status = ?, stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?',
          )
            .bind('paid', session.id, Number(orderId))
            .run();
          await auditLog(env, null, 'payment_confirmed', {
            order_id: orderId,
            session_id: session.id,
          });
          logger.log(`✅ Pedido ${orderId} pago`);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return internalError(error, 'stripe/webhook');
  }
}
