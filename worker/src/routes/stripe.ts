import { Router } from 'itty-router';
import { json } from 'itty-router';
import Stripe from 'stripe';

const router = Router({ base: '/api/stripe' });

// POST /api/stripe/create-payment - Criar sessão de pagamento
router.post('/create-payment', async (req, env: { STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string }) => {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const { orderId, items, total, customerEmail } = await req.json() as { orderId: string; items: Array<{ name: string; price: number; quantity: number }>; total: number; customerEmail: string };
    
    if (!orderId || !total) {
      return json({ success: false, error: 'Incomplete request data' }, { status: 400 });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map(item => ({
        price_data: {
          currency: 'usd',
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
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// POST /api/stripe/webhook - Webhook do Stripe
router.post('/webhook', async (req, env: { STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string }, { DB }) => {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      return json({ success: false, error: 'Missing Stripe signature' }, { status: 400 });
    }
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return json({ success: false, error: 'Invalid Stripe signature' }, { status: 400 });
    }
    
    // Processar eventos
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      
      // Atualizar status do pedido para "paid"
      await DB.prepare(
        'UPDATE orders SET status = ?, stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind('paid', session.id, orderId).run();
      
      // Aqui você criaria o pedido no CJdropshipping
      console.log(`Order ${orderId} paid successfully.`);
    }
    
    return json({ success: true, received: true });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
