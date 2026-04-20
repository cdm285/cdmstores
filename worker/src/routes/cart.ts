import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';

// POST /api/cart/add — validates stock server-side
export async function handleCartAdd(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { product_id, quantity } = body as { product_id?: number; quantity?: number };

    if (!product_id || !quantity) {
      return json({ success: false, error: 'product_id e quantity obrigatórios' }, 400);
    }

    const product = await env.DB.prepare('SELECT stock FROM products WHERE id = ? AND active = 1')
      .bind(product_id)
      .first<{ stock: number }>();

    if (!product || product.stock < quantity) {
      return json({ success: false, error: 'Estoque insuficiente' }, 400);
    }

    return json({
      success: true,
      message: 'Item adicionado ao carrinho',
      item: { product_id, quantity },
    });
  } catch (error) {
    return internalError(error, 'cart/add');
  }
}
