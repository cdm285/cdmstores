/**
 * CDM STORES - Frontend Integration Script
 * Integra botões de compra com backend Cloudflare Workers
 */

const API_BASE = 'https://cdmstores.com/api';

// Simula carrinho em localStorage
class Cart {
  constructor() {
    this.load();
  }

  load() {
    this.items = JSON.parse(localStorage.getItem('cdm_cart') || '[]');
  }

  save() {
    localStorage.setItem('cdm_cart', JSON.stringify(this.items));
  }

  add(productId, quantity = 1) {
    const existing = this.items.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ product_id: productId, quantity });
    }
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  getTotal() {
    return this.items.length;
  }
}

const cart = new Cart();

/**
 * Adiciona produto ao carrinho
 */
async function adicionarCarrinho(productId, productName, productPrice) {
  try {
    // Valida no backend
    const response = await fetch(`${API_BASE}/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        quantity: 1
      })
    });

    const data = await response.json();

    if (data.success) {
      cart.add(productId, 1);
      atualizarCarrinhoUI();
      mostrarNotificacao(`${productName} adicionado ao carrinho!`, 'success');
    } else {
      mostrarNotificacao(data.error || 'Erro ao adicionar ao carrinho', 'error');
    }
  } catch (error) {
    mostrarNotificacao('Erro de conexão ao carrinho', 'error');
    console.error(error);
  }
}

/**
 * Inicia checkout - Faz pedido e vai para Stripe
 */
async function comprar(email, phone = '') {
  if (cart.items.length === 0) {
    mostrarNotificacao('Carrinho vazio!', 'warning');
    return;
  }

  try {
    mostrarNotificacao('Processando pedido...', 'info');
    
    // Busca dados dos produtos para calcular total
    const productsResponse = await fetch(`${API_BASE}/products`);
    const { data: products } = await productsResponse.json();

    let total = 0;
    const orderItems = [];

    for (const cartItem of cart.items) {
      const product = products.find(p => p.id === cartItem.product_id);
      if (product) {
        const itemTotal = product.price * cartItem.quantity;
        total += itemTotal;
        orderItems.push({
          product_id: product.id,
          quantity: cartItem.quantity,
          price: product.price
        });
      }
    }

    const shippingCost = 15.00;
    const orderTotal = total + shippingCost;

    // Cria pedido
    const orderResponse = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: email.split('@')[0],
        customer_email: email,
        items: orderItems,
        total: orderTotal,
        shipping_cost: shippingCost
      })
    });

    const orderData = await orderResponse.json();

    if (!orderData.success) {
      mostrarNotificacao('Erro ao criar pedido', 'error');
      return;
    }

    const orderId = orderData.order_id;
    mostrarNotificacao(`Pedido #${orderId} criado! Redirecionando para Stripe...`, 'info');

    // Criar Stripe Checkout Session
    const checkoutResponse = await fetch(`${API_BASE}/stripe/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId,
        items: orderItems,
        total: orderTotal
      })
    });

    const checkoutData = await checkoutResponse.json();

    if (!checkoutData.success || !checkoutData.checkout_url) {
      mostrarNotificacao('Erro ao criar sessão de pagamento: ' + (checkoutData.error || 'Desconhecido'), 'error');
      return;
    }

    // Limpar carrinho e redirecionar
    cart.clear();
    atualizarCarrinhoUI();

    // Redirecionar para Stripe
    window.location.href = checkoutData.checkout_url;

  } catch (error) {
    mostrarNotificacao('Erro ao processar checkout: ' + error.message, 'error');
    console.error(error);
  }
}

/**
 * Rastreia pedido
 */
async function rastrear(trackingCode) {
  try {
    const response = await fetch(`${API_BASE}/tracking/${trackingCode}`);
    const data = await response.json();

    if (data.success) {
      const order = data.data;
      alert(`
Rastreamento:
Pedido: #${order.id}
Cliente: ${order.customer_name}
Status: ${order.status}
Código: ${order.tracking_code || 'Aguardando...'}
      `);
    } else {
      mostrarNotificacao('Pedido não encontrado', 'error');
    }
  } catch (error) {
    mostrarNotificacao('Erro ao rastrear', 'error');
    console.error(error);
  }
}

/**
 * Atualiza UI do carrinho
 */
function atualizarCarrinhoUI() {
  const cartCount = document.getElementById('cart-count');
  if (cartCount) {
    cartCount.textContent = cart.getTotal();
  }
  // Retrocompatibilidade
  const carrinhoCount = document.getElementById('carrinho-count');
  if (carrinhoCount) {
    carrinhoCount.textContent = cart.getTotal();
  }
  // Novo: Contar no menu
  const menuCartCount = document.getElementById('menu-cart-count');
  if (menuCartCount) {
    menuCartCount.textContent = cart.getTotal();
  }
}

/**
 * Alterna modal do carrinho
 */
function toggleCartModal() {
  const modal = document.getElementById('cart-modal');
  const overlay = document.getElementById('cart-overlay');
  modal?.classList.toggle('active');
  overlay?.classList.toggle('active');
  if (modal?.classList.contains('active')) {
    atualizarCarrinhoVisualizacao();
  }
}

/**
 * Atualiza visualização dos itens no modal
 */
function atualizarCarrinhoVisualizacao() {
  const itemsList = document.getElementById('cart-items-list');
  if (!itemsList) return;

  if (cart.items.length === 0) {
    itemsList.innerHTML = '<p class="cart-empty">Carrinho vazio</p>';
    return;
  }

  itemsList.innerHTML = cart.items.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">Produto ID: ${item.product_id}</div>
        <div class="cart-item-price">Quantidade: ${item.quantity}</div>
      </div>
      <button class="cart-item-remove" onclick="removerItemCarrinho(${item.product_id})">Remover</button>
    </div>
  `).join('');

  calcularTotal();
}

/**
 * Remove item do carrinho
 */
function removerItemCarrinho(productId) {
  cart.items = cart.items.filter(i => i.product_id !== productId);
  cart.save();
  atualizarCarrinhoUI();
  atualizarCarrinhoVisualizacao();
  mostrarNotificacao('Produto removido do carrinho', 'info');
}

/**
 * Calcula total do carrinho
 */
async function calcularTotal() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    const { data: products } = await response.json();

    let subtotal = 0;
    for (const item of cart.items) {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        subtotal += product.price * item.quantity;
      }
    }

    const frete = 15.00;
    const desconto = parseFloat(localStorage.getItem('cdm_discount') || 0);
    const total = subtotal - desconto + frete;

    document.getElementById('cart-subtotal').textContent = subtotal.toFixed(2);
    
    if (desconto > 0) {
      document.getElementById('discount-info').style.display = 'block';
      document.getElementById('cart-discount').textContent = desconto.toFixed(2);
    }
    
    document.getElementById('cart-total-amount').textContent = total.toFixed(2);
  } catch (error) {
    console.error('Erro ao calcular total:', error);
  }
}

/**
 * Aplica cupom de desconto
 */
function aplicarCupom() {
  const couponInput = document.getElementById('coupon-input');
  const cupom = couponInput?.value.trim().toUpperCase();

  if (!cupom) {
    mostrarNotificacao('Digite um código de cupom', 'warning');
    return;
  }

  // Cupons de teste (você pode adicionar mais)
  const cuponsValidos = {
    'NEWYEAR': 10.00,
    'PROMO': 5.00,
    'DESCONTO10': 10.00,
    'SAVE20': 20.00
  };

  if (cuponsValidos[cupom]) {
    const desconto = cuponsValidos[cupom];
    localStorage.setItem('cdm_discount', desconto);
    localStorage.setItem('cdm_coupon', cupom);
    calcularTotal();
    couponInput.value = '';
    mostrarNotificacao(`Cupom ${cupom} aplicado! Desconto: R$ ${desconto.toFixed(2)}`, 'success');
  } else {
    mostrarNotificacao('Cupom inválido!', 'error');
  }
}

/**
 * Finaliza compra pelo modal
 */
async function finalizarCompraModal() {
  const email = document.getElementById('modal-customer-email')?.value;
  if (!email) {
    mostrarNotificacao('Digite seu email', 'warning');
    return;
  }
  
  // Vai para checkout.html com os dados
  localStorage.setItem('checkout_email', email);
  window.location.href = 'pages/checkout.html';
}

/**
 * Mostra notificação temporária
 */
 */
function mostrarNotificacao(message, type = 'info') {
  const notif = document.createElement('div');
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
    color: white;
    padding: 15px 20px;
    border-radius: 4px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

/**
 * Carrega produtos para dropdown/select
 */
async function carregarProdutos() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    const { data: products } = await response.json();

    return products.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      stock: p.stock
    }));
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    return [];
  }
}

/**
 * Inicializa ao carregar página
 */
document.addEventListener('DOMContentLoaded', () => {
  atualizarCarrinhoUI();
  
  // Click listener para botão do carrinho no menu
  const menuCartBtn = document.getElementById('menu-cart-btn');
  if (menuCartBtn) {
    menuCartBtn.addEventListener('click', toggleCartModal);
  }
});

// Exporta funções globalmente
window.cdmStore = {
  cart,
  adicionarCarrinho,
  comprar,
  rastrear,
  carregarProdutos,
  mostrarNotificacao
};
