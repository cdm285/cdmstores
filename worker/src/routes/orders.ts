import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';
import { requireAuth } from '../lib/auth.js';
import { auditLog, EMAIL_REGEX } from '../lib/security.js';

const SHIPPING_COST = 15.00;

async function calculateOrderTotal(
  env  : Env,
  items: Array<{ product_id: number; quantity: number }>,
): Promise<{ total: number; enrichedItems: Array<{ product_id: number; quantity: number; price: number; name: string }> } | null> {
  let subtotal = 0;
  const enrichedItems: Array<{ product_id: number; quantity: number; price: number; name: string }> = [];
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1 || item.quantity > 100) return null;
    const product = await env.DB.prepare(
      'SELECT id, name, price, stock FROM products WHERE id = ? AND active = 1'
    ).bind(item.product_id).first<{ id: number; name: string; price: number; stock: number }>();
    if (!product || product.stock < item.quantity) return null;
    subtotal += product.price * item.quantity;
    enrichedItems.push({ product_id: product.id, quantity: item.quantity, price: product.price, name: product.name });
  }
  return { total: subtotal + SHIPPING_COST, enrichedItems };
}

export { calculateOrderTotal };

// GET /api/orders/:id — requires auth, enforces ownership
export async function handleOrderGet(req: Request, env: Env, id: string): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) return authResult.response;
    const order = await env.DB.prepare(
      'SELECT id, total, status, created_at, updated_at, stripe_payment_id, tracking_code FROM orders WHERE id = ? AND user_id = ?'
    ).bind(Number(id), authResult.auth.userId).first();
    if (!order) return json({ success: false, error: 'Pedido não encontrado' }, 404);
    return json({ success: true, data: order });
  } catch (error) {
    return internalError(error, 'orders/get');
  }
}

// POST /api/orders — requires auth, server-side total calculation [CRÍTICO-03]
export async function handleOrderCreate(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) return authResult.response;

    const body = await req.json() as Record<string, unknown>;
    const { customer_name, customer_email, items } = body as {
      customer_name?: string;
      customer_email?: string;
      items?: Array<{ product_id: number; quantity: number }>;
    };

    if (!customer_email || !items || !Array.isArray(items) || items.length === 0) {
      return json({ success: false, error: 'Dados incompletos' }, 400);
    }
    if (customer_email.length > 254 || !EMAIL_REGEX.test(customer_email)) {
      return json({ success: false, error: 'Email inválido' }, 400);
    }

    const calculated = await calculateOrderTotal(env, items);
    if (!calculated) return json({ success: false, error: 'Produto inválido ou sem estoque' }, 400);

    const result = await env.DB.prepare(
      'INSERT INTO orders (user_id, customer_name, customer_email, total, shipping_cost, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, "pending", datetime("now"), datetime("now"))'
    ).bind(
      authResult.auth.userId,
      typeof customer_name === 'string' ? customer_name.substring(0, 100) : null,
      customer_email,
      calculated.total,
      SHIPPING_COST,
    ).run();

    const orderId = result.meta.last_row_id;
    for (const item of calculated.enrichedItems) {
      await env.DB.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
      ).bind(orderId, item.product_id, item.quantity, item.price).run();
    }

    await auditLog(env, authResult.auth.userId, 'order_created', { order_id: orderId, total: calculated.total });
    return json({ success: true, order_id: orderId, total: calculated.total, status: 'pending' }, 201);
  } catch (error) {
    return internalError(error, 'orders/create');
  }
}
