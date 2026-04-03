import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/tracking' });

// GET /api/tracking/:code - Rastrear pedido por código
router.get('/:code', async (req, { DB }) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return json({ success: false, error: 'Código de rastreio obrigatório' }, { status: 400 });
    }
    
    const order = await DB.prepare(
      `SELECT id, customer_name, tracking_code, status, created_at, updated_at 
       FROM orders WHERE tracking_code = ?`
    ).bind(code).first();
    
    if (!order) {
      return json({ success: false, error: 'Código de rastreio não encontrado' }, { status: 404 });
    }
    
    return json({ 
      success: true, 
      data: {
        order_id: order.id,
        customer_name: order.customer_name,
        tracking_code: order.tracking_code,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at
      }
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// GET /api/tracking/status/:orderId - Status do pedido
router.get('/status/:orderId', async (req, { DB }) => {
  try {
    const { orderId } = req.params;
    
    const order = await DB.prepare(
      'SELECT id, status, tracking_code, updated_at FROM orders WHERE id = ?'
    ).bind(orderId).first();
    
    if (!order) {
      return json({ success: false, error: 'Pedido não encontrado' }, { status: 404 });
    }
    
    return json({ 
      success: true, 
      data: order 
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
