import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/cj' });

// POST /api/cj/create-order - Criar pedido no CJdropshipping
router.post('/create-order', async (req, env, { DB }) => {
  try {
    const { orderId } = await req.json();
    
    if (!orderId) {
      return json({ success: false, error: 'orderId obrigatório' }, { status: 400 });
    }
    
    // Buscar dados do pedido
    const order = await DB.prepare(
      'SELECT * FROM orders WHERE id = ?'
    ).bind(orderId).first();
    
    if (!order) {
      return json({ success: false, error: 'Pedido não encontrado' }, { status: 404 });
    }
    
    // Buscar itens do pedido
    const items = await DB.prepare(
      `SELECT oi.product_id, oi.quantity, p.name, p.price 
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       WHERE oi.order_id = ?`
    ).bind(orderId).all();
    
    // Placeholder: Chamar API do CJdropshipping
    // const cjResponse = await fetch('https://api.cjdropshipping.com/v1/orders/create', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${env.CJ_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     items: items.results,
    //     shipping_address: order.shipping_address,
    //     customer_email: order.customer_email
    //   })
    // });
    
    // const cjOrder = await cjResponse.json();
    
    // Simular resposta
    const cjOrderId = `CJ-${Date.now()}`;
    
    // Salvar CJ Order ID
    await DB.prepare(
      'UPDATE orders SET cj_order_id = ?, status = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(cjOrderId, 'processing', orderId).run();
    
    return json({ 
      success: true, 
      cj_order_id: cjOrderId,
      message: 'Pedido criado no CJdropshipping'
    });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

// GET /api/cj/tracking/:cjOrderId - Obter rastreio do CJ
router.get('/tracking/:cjOrderId', async (req, env, { DB }) => {
  try {
    const { cjOrderId } = req.params;
    
    // Placeholder: Chamar API do CJdropshipping para tracking
    // const response = await fetch(`https://api.cjdropshipping.com/v1/orders/${cjOrderId}/tracking`, {
    //   headers: {
    //     'Authorization': `Bearer ${env.CJ_API_KEY}`
    //   }
    // });
    
    return json({ 
      success: true, 
      tracking: {
        status: 'in_transit',
        estimated_delivery: '2026-03-05'
      }
    });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

// POST /api/cj/webhook - Webhook do CJdropshipping para atualizações
router.post('/webhook', async (req, env, { DB }) => {
  try {
    const { cj_order_id, status, tracking_number, estimated_delivery } = await req.json();
    
    // Atualizar pedido com informações do CJ
    await DB.prepare(
      `UPDATE orders 
       SET status = ?, tracking_code = ?, updated_at = datetime("now") 
       WHERE cj_order_id = ?`
    ).bind(status, tracking_number, cj_order_id).run();
    
    console.log(`Pedido ${cj_order_id} atualizado: ${status}`);
    
    return json({ success: true, message: 'Webhook processado' });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

export default router;
