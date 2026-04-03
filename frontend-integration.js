/**
 * CDM STORES - Frontend Integration Script
 * Carrinho 100% local (localStorage) — não depende do backend para funcionar.
 */

const API_BASE = 'https://cdmstores.com/api';

// ─── Carrinho local ───────────────────────────────────────────────────────────
class Cart {
  constructor() {
    this.items = [];
    this.load();
  }

  load() {
    try {
      this.items = JSON.parse(localStorage.getItem('cdm_cart') || '[]');
    } catch (_) {
      this.items = [];
    }
  }

  save() {
    localStorage.setItem('cdm_cart', JSON.stringify(this.items));
  }

  add(productId, productName, productPrice, quantity = 1) {
    const existing = this.items.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ product_id: productId, name: productName, price: productPrice, quantity });
    }
    this.save();
  }

  remove(productId) {
    this.items = this.items.filter(i => i.product_id !== productId);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  getCount() {
    return this.items.reduce((sum, i) => sum + i.quantity, 0);
  }

  getSubtotal() {
    return this.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  }

  // Retrocompatibilidade
  getTotal() { return this.getCount(); }
}

const cart = new Cart();

// ─── Adicionar ao carrinho (local-first, API em background) ──────────────────
function adicionarCarrinho(productId, productName, productPrice) {
  cart.add(productId, productName, productPrice, 1);
  atualizarCarrinhoUI();
  mostrarNotificacao(`${productName} adicionado ao carrinho!`, 'success');

  // Sincronização com backend em background (falha silenciosa)
  fetch(`${API_BASE}/cart/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, quantity: 1 })
  }).catch(() => {});
}

// ─── Remover item ─────────────────────────────────────────────────────────────
function removerItemCarrinho(productId) {
  cart.remove(productId);
  atualizarCarrinhoUI();
  atualizarCarrinhoVisualizacao();
  mostrarNotificacao('Produto removido do carrinho', 'info');
}

// ─── Atualizar contadores ─────────────────────────────────────────────────────
function atualizarCarrinhoUI() {
  const count = cart.getCount();
  ['cart-count', 'carrinho-count', 'menu-cart-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });
}

// ─── Abrir/fechar modal ───────────────────────────────────────────────────────
function toggleCartModal() {
  const modal = document.getElementById('cart-modal');
  const overlay = document.getElementById('cart-overlay');
  if (!modal) return;
  const isOpen = modal.classList.toggle('active');
  overlay?.classList.toggle('active', isOpen);
  if (isOpen) atualizarCarrinhoVisualizacao();
}

// ─── Renderizar itens no modal ────────────────────────────────────────────────
function atualizarCarrinhoVisualizacao() {
  const itemsList = document.getElementById('cart-items-list');
  if (!itemsList) return;

  if (cart.items.length === 0) {
    itemsList.innerHTML = '<p class="cart-empty">Carrinho vazio</p>';
    calcularTotalLocal();
    return;
  }

  itemsList.innerHTML = cart.items.map(item => `
    <div class="cart-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee;">
      <div>
        <div style="font-weight:600;font-size:14px;">${escapeHtml(item.name || 'Produto')}</div>
        <div style="color:#666;font-size:13px;">R$ ${Number(item.price).toFixed(2)} × ${item.quantity}</div>
      </div>
      <button onclick="removerItemCarrinho(${Number(item.product_id)})"
        style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:18px;padding:4px 8px;">✕</button>
    </div>
  `).join('');

  calcularTotalLocal();
}

// ─── Calcular total (local, sem API) ─────────────────────────────────────────
function calcularTotalLocal() {
  const subtotal = cart.getSubtotal();
  const frete = 15.00;
  const desconto = parseFloat(localStorage.getItem('cdm_discount') || '0') || 0;
  const total = Math.max(0, subtotal - desconto + frete);

  const el = (id) => document.getElementById(id);
  if (el('cart-subtotal')) el('cart-subtotal').textContent = subtotal.toFixed(2);
  if (el('discount-info')) el('discount-info').style.display = desconto > 0 ? 'flex' : 'none';
  if (el('cart-discount')) el('cart-discount').textContent = desconto.toFixed(2);
  if (el('cart-total-amount')) el('cart-total-amount').textContent = total.toFixed(2);
}

// Alias para compatibilidade com código antigo
function calcularTotal() { calcularTotalLocal(); }

// ─── Cupom ───────────────────────────────────────────────────────────────────
function aplicarCupom() {
  const couponInput = document.getElementById('coupon-input');
  const cupom = couponInput?.value.trim().toUpperCase();

  if (!cupom) { mostrarNotificacao('Digite um código de cupom', 'warning'); return; }

  const cuponsValidos = { 'NEWYEAR': 10, 'PROMO': 5, 'DESCONTO10': 10, 'SAVE20': 20, 'CDM10': 10 };

  if (cuponsValidos[cupom]) {
    const desconto = cuponsValidos[cupom];
    localStorage.setItem('cdm_discount', String(desconto));
    localStorage.setItem('cdm_coupon', cupom);
    calcularTotalLocal();
    if (couponInput) couponInput.value = '';
    mostrarNotificacao(`Cupom ${cupom} aplicado! Desconto: R$ ${desconto.toFixed(2)}`, 'success');
  } else {
    mostrarNotificacao('Cupom inválido!', 'error');
  }
}

// ─── Notificação toast ────────────────────────────────────────────────────────
function mostrarNotificacao(message, type = 'info') {
  if (!document.getElementById('cdm-notif-style')) {
    const s = document.createElement('style');
    s.id = 'cdm-notif-style';
    s.textContent = '@keyframes cdmSlideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }
  const colors = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12', info: '#2980b9' };
  const notif = document.createElement('div');
  notif.textContent = message;
  notif.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;
    background:${colors[type]||colors.info};color:#fff;padding:14px 20px;
    border-radius:8px;font-size:14px;font-weight:500;
    box-shadow:0 4px 16px rgba(0,0,0,.25);animation:cdmSlideIn .3s ease;max-width:320px;`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3500);
}

// ─── Escape XSS ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Carregarmos produtos (compatibilidade) ───────────────────────────────────
async function carregarProdutos() {
  try {
    const r = await fetch(`${API_BASE}/products`);
    const { data } = await r.json();
    return data || [];
  } catch (_) { return []; }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  atualizarCarrinhoUI();
  const menuCartBtn = document.getElementById('menu-cart-btn');
  if (menuCartBtn) menuCartBtn.addEventListener('click', toggleCartModal);
});

// ─── Exportar globalmente ────────────────────────────────────────────────────
window.cdmStore = { cart, adicionarCarrinho, removerItemCarrinho, toggleCartModal, aplicarCupom, mostrarNotificacao, carregarProdutos };

