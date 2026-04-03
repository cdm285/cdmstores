import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/orders' });

// GET /api/orders/:id - Obter pedido
router.get('/:id', async (req, { DB }) => {
  try {
    const { id } = req.params;
    
    const order = await DB.prepare(
      `SELECT id, customer_email, total, status, created_at, updated_at, 
              stripe_payment_id, cj_order_id, tracking_code 
       FROM orders WHERE id = ?`
    ).bind(id).first();
    
    if (!order) {
      return json({ success: false, error: 'Pedido não encontrado' }, { status: 404 });
    }
    
    return json({ success: true, data: order });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// GET /api/orders/customer/:email - Listar pedidos do cliente
router.get('/customer/:email', async (req, { DB }) => {
  try {
    const { email } = req.params;
    
    const orders = await DB.prepare(
      `SELECT id, total, status, created_at, tracking_code 
       FROM orders WHERE customer_email = ? ORDER BY created_at DESC`
    ).bind(email).all();
    
    return json({ success: true, data: orders.results });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// POST /api/orders - Criar novo pedido
router.post('/', async (req, { DB }) => {
  try {
    const { 
      customer_name, 
      customer_email, 
      items,
      total,
      shipping_address,
      shipping_cost
    } = await req.json() as { customer_name: string; customer_email: string; items: Array<{ product_id: string; quantity: number; price: number }>; total: number; shipping_address: string; shipping_cost: number };
    
    if (!customer_email || !items || !total) {
      return json({ success: false, error: 'Dados incompletos' }, { status: 400 });
    }
    
    const result = await DB.prepare(
      `INSERT INTO orders 
       (customer_name, customer_email, total, shipping_cost, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 'pending', datetime("now"), datetime("now"))`
    ).bind(customer_name, customer_email, total, shipping_cost).run();
    
    const orderId = result.meta.last_row_id;
    
    // Salvar itens do pedido
    for (const item of items) {
      await DB.prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, price) 
         VALUES (?, ?, ?, ?)`
      ).bind(orderId, item.product_id, item.quantity, item.price).run();
    }
    
    return json({ 
      success: true, 
      order_id: orderId,
      total: total,
      status: 'pending'
    }, { status: 201 });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
