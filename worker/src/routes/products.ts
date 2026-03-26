import { Router } from 'itty-router';
import { json } from 'itty-router';

const router = Router({ base: '/api/products' });

// GET /api/products - Listar todos os produtos
router.get('/', async (req, { DB }) => {
  try {
    const products = await DB.prepare(
      'SELECT id, name, description, price, image_url, stock FROM products WHERE active = 1'
    ).all();
    
    return json({ success: true, data: products.results });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

// GET /api/products/:id - Obter um produto específico
router.get('/:id', async (req, { DB }) => {
  try {
    const { id } = req.params;
    const product = await DB.prepare(
      'SELECT id, name, description, price, image_url, stock FROM products WHERE id = ?'
    ).bind(id).first();
    
    if (!product) {
      return json({ success: false, error: 'Produto não encontrado' }, { status: 404 });
    }
    
    return json({ success: true, data: product });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

// POST /api/products - Criar novo produto (admin)
router.post('/', async (req, { DB }) => {
  try {
    const { name, description, price, image_url, stock } = await req.json();
    
    const result = await DB.prepare(
      'INSERT INTO products (name, description, price, image_url, stock, active, created_at) VALUES (?, ?, ?, ?, ?, 1, datetime("now"))'
    ).bind(name, description, price, image_url, stock).run();
    
    return json({ success: true, id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
});

export default router;
