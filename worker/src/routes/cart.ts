import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/cart' });

// POST /api/cart/add - Adicionar ao carrinho
router.post('/add', async (req, { DB }) => {
  try {
    const { product_id, quantity, customer_id } = await req.json() as { product_id: string; quantity: number; customer_id?: string };
    
    if (!product_id || !quantity) {
      return json({ success: false, error: 'product_id e quantity obrigatórios' }, { status: 400 });
    }
    
    // Verificar estoque
    const product = await DB.prepare(
      'SELECT stock FROM products WHERE id = ?'
    ).bind(product_id).first();
    
    if (!product || product.stock < quantity) {
      return json({ success: false, error: 'Estoque insuficiente' }, { status: 400 });
    }
    
    // Adicionar ao carrinho (usando local storage no frontend por enquanto)
    return json({ 
      success: true, 
      message: 'Item adicionado ao carrinho',
      item: { product_id, quantity }
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// DELETE /api/cart/remove - Remover do carrinho
router.delete('/remove', async (req) => {
  try {
    const { product_id } = await req.json() as { product_id: string };
    return json({ success: true, message: 'Item removido do carrinho' });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

// GET /api/cart/calculate-shipping - Calcular frete
router.get('/calculate-shipping', async (req, { DB }) => {
  try {
    const { cep, items } = req.query;
    
    if (!cep || !items) {
      return json({ success: false, error: 'CEP e items obrigatórios' }, { status: 400 });
    }
    
    // Placeholder: Integrar com CJ API para calcular frete
    const shippingCost = 25.00; // Exemplo fixo
    
    return json({ 
      success: true, 
      shipping_cost: shippingCost,
      estimated_days: 7
    });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, { status: 500 });
  }
});

export default router;
