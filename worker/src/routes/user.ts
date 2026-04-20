/**
 * CDM STORES — User profile & address routes
 * PUT  /api/user/profile
 * GET  /api/addresses
 * POST /api/addresses
 * PUT  /api/addresses/:id
 * DEL  /api/addresses/:id
 * POST /api/addresses/:id/default
 * GET  /api/orders/user
 */

import { json, internalError } from '../lib/response.js';
import type { Env } from '../lib/response.js';
import { requireAuth } from '../lib/auth.js';
import { auditLog } from '../lib/security.js';

// ─── PUT /api/user/profile ────────────────────────────────────────────────────
export async function handleUpdateProfile(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const { name, phone, avatar_url } = body as {
      name?: string;
      phone?: string;
      avatar_url?: string;
    };

    if (name !== undefined && (typeof name !== 'string' || name.length < 2 || name.length > 100)) {
      return json({ success: false, error: 'Nome deve ter entre 2 e 100 caracteres' }, 400);
    }
    if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.length > 20)) {
      return json({ success: false, error: 'Telefone inválido' }, 400);
    }
    if (avatar_url !== undefined && avatar_url !== null) {
      if (typeof avatar_url !== 'string' || avatar_url.length > 500) {
        return json({ success: false, error: 'avatar_url inválido' }, 400);
      }
      try {
        const parsed = new URL(avatar_url);
        if (parsed.protocol !== 'https:') {
          throw new Error();
        }
      } catch {
        return json({ success: false, error: 'avatar_url deve ser uma URL HTTPS válida' }, 400);
      }
    }

    await env.DB.prepare(
      'UPDATE users SET name = ?, phone = ?, avatar_url = ?, updated_at = datetime("now") WHERE id = ?',
    )
      .bind(name || null, phone || null, avatar_url || null, authResult.auth.userId)
      .run();

    const user = await env.DB.prepare(
      'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1',
    )
      .bind(authResult.auth.userId)
      .first();

    await auditLog(env, authResult.auth.userId, 'profile_updated', {});
    return json({ ...user, success: true });
  } catch (error) {
    return internalError(error, 'user/profile');
  }
}

// ─── GET /api/addresses ───────────────────────────────────────────────────────
export async function handleGetAddresses(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const addresses = await env.DB.prepare(
      'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    )
      .bind(authResult.auth.userId)
      .all();
    return json(addresses.results);
  } catch (error) {
    return internalError(error, 'addresses/get');
  }
}

// ─── POST /api/addresses ──────────────────────────────────────────────────────
export async function handleCreateAddress(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const {
      label,
      name,
      phone,
      street,
      number,
      complement,
      city,
      state,
      zip,
      country,
      is_default,
    } = body as {
      label?: string;
      name?: string;
      phone?: string;
      street?: string;
      number?: string;
      complement?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      is_default?: boolean;
    };

    if (!label || !name || !phone || !street || !number || !city || !state || !zip || !country) {
      return json({ success: false, error: 'Campos obrigatórios ausentes' }, 400);
    }

    if (is_default) {
      await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
        .bind(authResult.auth.userId)
        .run();
    }

    const result = await env.DB.prepare(
      'INSERT INTO user_addresses (user_id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
    )
      .bind(
        authResult.auth.userId,
        label,
        name,
        phone,
        street,
        number,
        complement || null,
        city,
        state,
        zip,
        country,
        is_default ? 1 : 0,
      )
      .run();

    const address = await env.DB.prepare(
      'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?',
    )
      .bind(result.meta.last_row_id)
      .first();
    return json(address);
  } catch (error) {
    return internalError(error, 'addresses/create');
  }
}

// ─── PUT /api/addresses/:id ───────────────────────────────────────────────────
export async function handleUpdateAddress(
  req: Request,
  env: Env,
  addressId: string,
): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const address = await env.DB.prepare('SELECT user_id FROM user_addresses WHERE id = ?')
      .bind(addressId)
      .first<{ user_id: number }>();
    if (!address || address.user_id !== authResult.auth.userId) {
      return json({ success: false, error: 'Endereço não encontrado' }, 404);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const {
      label,
      name,
      phone,
      street,
      number,
      complement,
      city,
      state,
      zip,
      country,
      is_default,
    } = body as {
      label?: string;
      name?: string;
      phone?: string;
      street?: string;
      number?: string;
      complement?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      is_default?: boolean;
    };

    if (is_default) {
      await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
        .bind(authResult.auth.userId)
        .run();
    }

    await env.DB.prepare(
      'UPDATE user_addresses SET label = ?, name = ?, phone = ?, street = ?, number = ?, complement = ?, city = ?, state = ?, zip = ?, country = ?, is_default = ? WHERE id = ?',
    )
      .bind(
        label,
        name,
        phone,
        street,
        number,
        complement || null,
        city,
        state,
        zip,
        country,
        is_default ? 1 : 0,
        addressId,
      )
      .run();

    const updated = await env.DB.prepare(
      'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?',
    )
      .bind(addressId)
      .first();
    return json(updated);
  } catch (error) {
    return internalError(error, 'addresses/update');
  }
}

// ─── DELETE /api/addresses/:id ────────────────────────────────────────────────
export async function handleDeleteAddress(
  req: Request,
  env: Env,
  addressId: string,
): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const address = await env.DB.prepare('SELECT user_id FROM user_addresses WHERE id = ?')
      .bind(addressId)
      .first<{ user_id: number }>();
    if (!address || address.user_id !== authResult.auth.userId) {
      return json({ success: false, error: 'Endereço não encontrado' }, 404);
    }

    await env.DB.prepare('DELETE FROM user_addresses WHERE id = ?').bind(addressId).run();
    return json({ success: true, message: 'Endereço deletado' });
  } catch (error) {
    return internalError(error, 'addresses/delete');
  }
}

// ─── POST /api/addresses/:id/default ─────────────────────────────────────────
export async function handleSetDefaultAddress(
  req: Request,
  env: Env,
  addressId: string,
): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const address = await env.DB.prepare('SELECT user_id FROM user_addresses WHERE id = ?')
      .bind(addressId)
      .first<{ user_id: number }>();
    if (!address || address.user_id !== authResult.auth.userId) {
      return json({ success: false, error: 'Endereço não encontrado' }, 404);
    }

    await env.DB.prepare('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?')
      .bind(authResult.auth.userId)
      .run();
    await env.DB.prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')
      .bind(addressId)
      .run();
    return json({ success: true, message: 'Endereço marcado como padrão' });
  } catch (error) {
    return internalError(error, 'addresses/default');
  }
}

// ─── GET /api/orders/user ─────────────────────────────────────────────────────
export async function handleUserOrders(req: Request, env: Env): Promise<Response> {
  try {
    const authResult = await requireAuth(req, env);
    if (!authResult.ok) {
      return authResult.response;
    }

    const orders = await env.DB.prepare(
      'SELECT id, customer_name, customer_email, total, status, shipping_cost, tracking_code, created_at, updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    )
      .bind(authResult.auth.userId)
      .all();

    const ordersWithItems = await Promise.all(
      orders.results.map(async (order: Record<string, unknown>) => {
        const items = await env.DB.prepare(
          'SELECT product_id, quantity, price, (quantity * price) as total_price FROM order_items WHERE order_id = ?',
        )
          .bind(order.id)
          .all();
        const enriched = await Promise.all(
          items.results.map(async (item: Record<string, unknown>) => {
            const product = await env.DB.prepare('SELECT name FROM products WHERE id = ?')
              .bind(item.product_id)
              .first<{ name: string }>();
            return { ...item, product_name: product?.name || 'Produto desconhecido' };
          }),
        );
        return { ...order, items: enriched };
      }),
    );
    return json(ordersWithItems);
  } catch (error) {
    return internalError(error, 'orders/user');
  }
}
