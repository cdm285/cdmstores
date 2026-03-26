import { Router } from 'itty-router';
import { json } from 'itty-router';
import Stripe from 'stripe';

const router = Router({ base: '/api/stripe' });
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// POST /api/stripe/create-payment - Criar sessão de pagamento
router.post('/create-payment', async (req, env) => {
  try {
    const { orderId, items, total, customerEmail } = await req.json();
    
    if (!orderId || !total) {
      return json({ success: false, error: 'Dados incompletos' }, { status: 400 });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map(item => ({
        price_data: {
          currency: 'brl',
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: `https://cdmstores.com/pages/checkout.html?status=success&order_id=${orderId}`,
      cancel_url: `https://cdmstores.com/pages/checkout.html?status=cancelled`,
      customer_email: customerEmail,
      metadata: {
        order_id: orderId,
      }
    });
    
    return json({ 
      success: true, 
      payment_url: session.url,
      session_id: session.id
    });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

// POST /api/stripe/webhook - Webhook do Stripe
router.post('/webhook', async (req, env, { DB }) => {
  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return json({ success: false, error: 'Assinatura inválida' }, { status: 400 });
    }
    
    // Processar eventos
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata.order_id;
      
      // Atualizar status do pedido para "paid"
      await DB.prepare(
        'UPDATE orders SET status = ?, stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind('paid', session.id, orderId).run();
      
      // Aqui você criaria o pedido no CJdropshipping
      console.log(`Pedido ${orderId} pago com sucesso!`);
    }
    
    return json({ success: true, received: true });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

export default router;
