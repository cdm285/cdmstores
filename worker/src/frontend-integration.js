// ============================================
// CDM STORES - Frontend Integration Script
// Conecta seu site ao backend Cloudflare Workers
// ============================================

const API_URL = 'https://api.cdmstores.com'; // Ou http://localhost:8787 em desenvolvimento

// ==================================
// 📦 FUNÇÕES DE PRODUTOS
// ==================================

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/api/products`);
    const data = await response.json();
    
    if (data.success) {
      return data.data; // Array de produtos
    } else {
      console.error('Erro ao carregar produtos:', data.error);
      return [];
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
    return [];
  }
}

// ==================================
// 🛒 FUNÇÕES DE CARRINHO
// ==================================

// LocalStorage para carrinho (antes de sincronizar com backend)
const CART_STORAGE_KEY = 'cdm_cart';

function getCart() {
  const cart = localStorage.getItem(CART_STORAGE_KEY);
  return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function addToCart(productId, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item => item.product_id === productId);
  
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ product_id: productId, quantity });
  }
  
  saveCart(cart);
  console.log(`✅ Produto ${productId} adicionado ao carrinho`);
  
  // Atualizar UI
  updateCartUI();
}

function removeFromCart(productId) {
  let cart = getCart();
  cart = cart.filter(item => item.product_id !== productId);
  saveCart(cart);
  updateCartUI();
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  updateCartUI();
}

function updateCartUI() {
  const cart = getCart();
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  
  // Atualizar contador de carrinho (se existir elemento)
  const cartEl = document.getElementById('cart-count');
  if (cartEl) {
    cartEl.textContent = cartCount;
  }
}

async function calculateShipping(cep) {
  try {
    const response = await fetch(`${API_URL}/api/cart/calculate-shipping`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao calcular frete:', error);
    return null;
  }
}

// ==================================
// 💳 FUNÇÕES DE PEDIDO E CHECKOUT
// ==================================

async function createOrder(customerData) {
  try {
    const cart = getCart();
    
    if (cart.length === 0) {
      alert('❌ Seu carrinho está vazio!');
      return null;
    }
    
    // Buscar preços dos produtos
    const products = await loadProducts();
    const items = cart.map(cartItem => {
      const product = products.find(p => p.id === cartItem.product_id);
      return {
        product_id: cartItem.product_id,
        quantity: cartItem.quantity,
        name: product.name,
        price: product.price
      };
    });
    
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Enviar ao backend
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customerData.name,
        customer_email: customerData.email,
        items: items,
        total: total,
        shipping_address: customerData.address,
        shipping_cost: customerData.shipping_cost || 0
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Pedido criado:', data.order_id);
      return data.order_id;
    } else {
      console.error('Erro ao criar pedido:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Erro na requisição:', error);
    return null;
  }
}

async function redirectToStripeCheckout(orderId, items, total, customerEmail) {
  try {
    const response = await fetch(`${API_URL}/api/stripe/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId,
        items: items,
        total: total,
        customerEmail: customerEmail
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Redirecionar para Stripe Checkout
      window.location.href = data.payment_url;
    } else {
      alert('❌ Erro ao processar pagamento: ' + data.error);
    }
  } catch (error) {
    alert('❌ Erro na requisição: ' + error.message);
  }
}

// ==================================
// 📍 FUNÇÕES DE RASTREIO
// ==================================

async function trackOrder(trackingCode) {
  try {
    const response = await fetch(`${API_URL}/api/tracking/${trackingCode}`);
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      console.error('Pedido não encontrado');
      return null;
    }
  } catch (error) {
    console.error('Erro ao rastrear:', error);
    return null;
  }
}

// ==================================
// 🔧 INICIALIZAÇÃO
// ==================================

document.addEventListener('DOMContentLoaded', () => {
  updateCartUI(); // Atualizar contador ao carregar página
});

// ==================================
// 📝 EXEMPLO DE USO
// ==================================

/*
// 1. Carregar produtos ao abrir a loja
loadProducts().then(products => {
  console.log('Produtos disponíveis:', products);
});

// 2. Adicionar ao carrinho (ao clicar em "Comprar")
document.querySelectorAll('.buy-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const productId = e.target.dataset.productId;
    addToCart(parseInt(productId));
  });
});

// 3. No checkout, criar pedido
document.getElementById('checkout-btn').addEventListener('click', async () => {
  const orderId = await createOrder({
    name: 'João Silva',
    email: 'joao@example.com',
    address: 'Rua 123, São Paulo, SP',
    shipping_cost: 25.00
  });
  
  if (orderId) {
    // Redirecionar para Stripe
    const cart = getCart();
    const products = await loadProducts();
    const items = cart.map(cartItem => ({
      name: products.find(p => p.id === cartItem.product_id).name,
      price: products.find(p => p.id === cartItem.product_id).price,
      quantity: cartItem.quantity
    }));
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    redirectToStripeCheckout(orderId, items, total, 'joao@example.com');
  }
});

// 4. Rastrear pedido
document.getElementById('track-btn').addEventListener('click', async () => {
  const code = document.getElementById('tracking-code').value;
  const tracking = await trackOrder(code);
  
  if (tracking) {
    console.log('Status:', tracking.status);
    console.log('Entrega:', tracking.updated_at);
  }
});
*/
