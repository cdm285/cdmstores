import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';

// GET /api/products
export async function handleProductList(_req: Request, env: Env): Promise<Response> {
  try {
    const products = await env.DB.prepare(
      'SELECT id, name, description, price, image_url, stock FROM products WHERE active = 1'
    ).all();
    return json({ success: true, data: products.results });
  } catch (error) {
    return internalError(error, 'products/list');
  }
}

// GET /api/products/:id
export async function handleProductGet(_req: Request, env: Env, id: string): Promise<Response> {
  try {
    const product = await env.DB.prepare(
      'SELECT id, name, description, price, image_url, stock FROM products WHERE id = ? AND active = 1'
    ).bind(id).first();
    if (!product) return json({ success: false, error: 'Produto não encontrado' }, 404);
    return json({ success: true, data: product });
  } catch (error) {
    return internalError(error, 'products/get');
  }
}
