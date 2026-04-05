/**
 * CDM STORES - Chatbot Widget
 * Botão integrado ao FAB container · modal de chat com IA
 * Fix: sem conflito de z-index com auth.js
 */

class ChatBot {
  constructor() {
    this.isOpen   = false;
    this.language = localStorage.getItem('cdm_lang') || 'pt';
    this._init();
  }

  _init() {
    // Aguardar DOM + um tick para deixar auth.js criar o fab-container primeiro
    const setup = () => {
      this._injectStyles();
      this._createFabButton();
      this._createModal();
      this._bindEvents();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(setup, 120));
    } else {
      setTimeout(setup, 120);
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * FAB no container compartilhado (sem conflito de z-index)
   * ────────────────────────────────────────────────────────────── */
  _createFabButton() {
    if (document.getElementById('chatbot-fab')) return;

    // Reusar o fab-container do auth.js ou criar um novo
    let container = document.getElementById('fab-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fab-container';
      container.className = 'fab-container';
      document.body.appendChild(container);
    }

    const btn = document.createElement('button');
    btn.id = 'chatbot-fab';
    btn.className = 'fab';
    btn.style.background = 'linear-gradient(135deg, #00AFFF, #9B4DFF)';
    btn.style.color = 'white';
    btn.title = 'Abrir chat';
    btn.setAttribute('aria-label', 'Abrir chat de suporte');
    btn.innerHTML = '💬';
    btn.addEventListener('click', () => this.toggle());

    // Inserir ANTES do fab-login para chatbot aparecer abaixo do login
    const loginFab = document.getElementById('fab-login');
    if (loginFab) {
      container.insertBefore(btn, loginFab);
    } else {
      container.appendChild(btn);
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Modal de chat (posicionado acima do FAB container)
   * ────────────────────────────────────────────────────────────── */
  _createModal() {
    if (document.getElementById('chatbot-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'chatbot-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Chat de suporte CDM STORES');
    modal.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-info">
          <span class="chatbot-avatar">🤖</span>
          <div>
            <div class="chatbot-title">CDM Assistente</div>
            <div class="chatbot-status">● Online</div>
          </div>
        </div>
        <div class="chatbot-header-actions">
          <div class="chatbot-lang-bar">
            <button class="clang-btn" data-lang="pt">PT</button>
            <button class="clang-btn" data-lang="en">EN</button>
            <button class="clang-btn" data-lang="es">ES</button>
          </div>
          <button class="chatbot-close-btn" id="chatbot-close-btn" aria-label="Fechar chat">&times;</button>
        </div>
      </div>

      <div class="chatbot-body" id="chatbot-body"></div>

      <div class="chatbot-footer">
        <input type="text" id="chatbot-input" placeholder="Digite sua mensagem..." autocomplete="off" maxlength="500">
        <button id="chatbot-send-btn" aria-label="Enviar mensagem">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(modal);

    // Mensagem de boas-vindas
    this._addMsg(this._welcome(), 'bot');
  }

  /* ──────────────────────────────────────────────────────────────
   * CSS injetado
   * ────────────────────────────────────────────────────────────── */
  _injectStyles() {
    if (document.getElementById('chatbot-styles')) return;
    const s = document.createElement('style');
    s.id = 'chatbot-styles';
    s.innerHTML = `
      #chatbot-modal {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 360px;
        max-height: 520px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.18);
        display: none;
        flex-direction: column;
        z-index: 10001;
        overflow: hidden;
        border: 1px solid #e5e7eb;
        animation: chatSlideIn 0.25s ease;
      }
      #chatbot-modal.active {
        display: flex;
      }
      @keyframes chatSlideIn {
        from { opacity: 0; transform: translateY(16px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .chatbot-header {
        background: linear-gradient(135deg, #00AFFF, #9B4DFF);
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      .chatbot-header-info {
        display: flex;
        align-items: center;
        gap: 10px;
        color: white;
      }
      .chatbot-avatar { font-size: 22px; }
      .chatbot-title  { font-weight: 700; font-size: 14px; color: #fff; }
      .chatbot-status { font-size: 11px; color: rgba(255,255,255,0.8); }

      .chatbot-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .chatbot-lang-bar {
        display: flex;
        gap: 4px;
      }
      .clang-btn {
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.35);
        color: white;
        border-radius: 4px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .clang-btn.active { background: rgba(255,255,255,0.45); }
      .clang-btn:hover  { background: rgba(255,255,255,0.3); }

      .chatbot-close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 22px;
        cursor: pointer;
        line-height: 1;
        padding: 2px 4px;
        opacity: 0.8;
      }
      .chatbot-close-btn:hover { opacity: 1; }

      .chatbot-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        background: #f7f9fc;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
      }

      .chatbot-msg {
        max-width: 85%;
        padding: 10px 13px;
        border-radius: 10px;
        font-size: 13.5px;
        line-height: 1.5;
        word-break: break-word;
        animation: msgIn 0.2s ease;
      }
      @keyframes msgIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .chatbot-msg.bot  { background: #fff; color: #111; border: 1px solid #e5e7eb; align-self: flex-start; border-radius: 10px 10px 10px 2px; }
      .chatbot-msg.user { background: linear-gradient(135deg,#00AFFF,#9B4DFF); color: #fff; align-self: flex-end; border-radius: 10px 10px 2px 10px; }
      .chatbot-msg.typing { color: #9ca3af; font-style: italic; }

      .chatbot-footer {
        display: flex;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid #e5e7eb;
        background: #fff;
        flex-shrink: 0;
      }
      #chatbot-input {
        flex: 1;
        padding: 10px 12px;
        border: 1.5px solid #e5e7eb;
        border-radius: 8px;
        font-size: 13.5px;
        outline: none;
        font-family: inherit;
        transition: border-color 0.15s;
      }
      #chatbot-input:focus { border-color: #00AFFF; }
      #chatbot-send-btn {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: linear-gradient(135deg,#00AFFF,#9B4DFF);
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: opacity 0.2s;
      }
      #chatbot-send-btn:hover { opacity: 0.85; }

      /* Mobile */
      @media (max-width: 480px) {
        #chatbot-modal {
          width: calc(100vw - 24px);
          right: 12px;
          bottom: 80px;
          max-height: 70vh;
        }
      }
    `;
    document.head.appendChild(s);
  }

  /* ──────────────────────────────────────────────────────────────
   * Eventos
   * ────────────────────────────────────────────────────────────── */
  _bindEvents() {
    document.getElementById('chatbot-close-btn')?.addEventListener('click', () => this.toggle());
    document.getElementById('chatbot-send-btn')?.addEventListener('click', () => this._send());
    document.getElementById('chatbot-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._send();
    });

    // Seletor de idioma
    document.querySelectorAll('.clang-btn').forEach(btn => {
      if (btn.dataset.lang === this.language) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.language = btn.dataset.lang;
        localStorage.setItem('cdm_lang', this.language);
        document.querySelectorAll('.clang-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Sincronizar idioma quando script.js muda
    window.addEventListener('storage', (e) => {
      if (e.key === 'cdm_lang' && e.newValue) {
        this.language = e.newValue;
        document.querySelectorAll('.clang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === this.language));
      }
    });
  }

  /* ──────────────────────────────────────────────────────────────
   * Toggle
   * ────────────────────────────────────────────────────────────── */
  toggle() {
    const modal = document.getElementById('chatbot-modal');
    this.isOpen = !this.isOpen;
    modal?.classList.toggle('active', this.isOpen);
    if (this.isOpen) document.getElementById('chatbot-input')?.focus();
  }

  /* ──────────────────────────────────────────────────────────────
   * Enviar mensagem
   * ────────────────────────────────────────────────────────────── */
  async _send() {
    const input = document.getElementById('chatbot-input');
    const msg   = input?.value.trim();
    if (!msg) return;
    input.value = '';

    this._addMsg(msg, 'user');

    const typingId = 'typing-' + Date.now();
    this._addMsg('...', 'bot typing', typingId);

    try {
      // Tentar backend IA primeiro
      const res = await fetch('https://cdmstores.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, language: this.language, user_id: this._uid() })
      });
      this._removeMsg(typingId);
      const data = await res.json();
      if (data.success) {
        this._addMsg(data.response, 'bot');
        if (data.action) this._handleAction(data);
      } else {
        this._addMsg(this._localReply(msg), 'bot');
      }
    } catch (_) {
      // Fallback local
      this._removeMsg(typingId);
      this._addMsg(this._localReply(msg), 'bot');
    }
  }

  /* ──────────────────────────────────────────────────────────────
   * Adicionar mensagem ao DOM
   * ────────────────────────────────────────────────────────────── */
  _addMsg(text, cls, id) {
    const body = document.getElementById('chatbot-body');
    if (!body) return;
    const el = document.createElement('div');
    el.className = `chatbot-msg ${cls}`;
    if (id) el.id = id;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  _removeMsg(id) {
    document.getElementById(id)?.remove();
  }

  /* ──────────────────────────────────────────────────────────────
   * Resposta offline / fallback local
   * ────────────────────────────────────────────────────────────── */
  _welcome() {
    return { pt: 'Olá! 😊 Sou o assistente da CDM STORES. Como posso ajudar?', en: 'Hi! 😊 I\'m the CDM STORES assistant. How can I help?', es: '¡Hola! 😊 Soy el asistente de CDM STORES. ¿En qué puedo ayudar?' }[this.language] || 'Olá!';
  }

  _localReply(msg) {
    const lower = msg.toLowerCase();
    const l = this.language;
    const r = {
      pt: {
        rastreio: '📦 Use a aba Rastreio e cole seu código (ex: CDM123456BR). Acompanhe em tempo real!',
        pagamento: '💳 Aceitamos Stripe, cartão crédito/débito. Totalmente seguro (PCI-DSS).',
        frete: '🚚 Entregamos internacionalmente. Frete grátis acima de $199. Prazo: 5–10 dias úteis.',
        produto: '🛍️ Temos Fone Bluetooth ($89.90), Carregador USB-C ($49.90) e mais!',
        carrinho: '🛒 Clique no ícone 🛒 para ver seu carrinho e finalizar a compra.',
        suporte: '📞 Estamos disponíveis 24/7. Use o chat ou entre em contato!',
        padrao: '😊 Pode me contar mais? Posso ajudar com produtos, rastreio, pagamento e suporte!'
      },
      en: {
        rastreio: '📦 Use the Tracking tab with your code (ex: CDM123456BR). Real-time tracking!',
        pagamento: '💳 We accept Stripe with credit/debit cards. Fully secure (PCI-DSS).',
        frete: '🚚 We ship internationally. Free shipping on orders over $199. Estimated 5–10 business days.',
        produto: '🛍️ We have Bluetooth Headphones ($89.90), USB-C Charger ($49.90) and more!',
        carrinho: '🛒 Click the 🛒 icon to view your cart and checkout.',
        suporte: '📞 We\'re available 24/7. Use chat or contact us!',
        padrao: '😊 Tell me more? I can help with products, tracking, payment and support!'
      },
      es: {
        rastreio: '📦 Usa la pestaña Rastreo con tu código (ej: CDM123456BR). ¡Seguimiento en tiempo real!',
        pagamento: '💳 Aceptamos Stripe con tarjeta crédito/débito. Totalmente seguro (PCI-DSS).',
        frete: '🚚 Enviamos internacionalmente. Envío gratis en pedidos sobre $199. Plazo: 5–10 días hábiles.',
        produto: '🛍️ Tenemos Auriculares Bluetooth ($89.90), Cargador USB-C ($49.90) ¡y más!',
        carrinho: '🛒 Haz clic en el icono 🛒 para ver tu carrito y finalizar la compra.',
        suporte: '📞 Estamos disponibles 24/7. ¡Usa el chat o contáctanos!',
        padrao: '😊 ¿Puedes contarme más? ¡Puedo ayudarte con productos, rastreo, pago y soporte!'
      }
    };
    const t = r[l] || r.pt;
    if (/rastreio|rastrear|tracking|track|c.digo|pedido|entrega/i.test(lower)) return t.rastreio;
    if (/pagamento|payment|pagar|pay|cart.o|stripe|pix|pre.o|valor/i.test(lower)) return t.pagamento;
    if (/frete|envio|shipping|quando|prazo|entrega/i.test(lower)) return t.frete;
    if (/produto|product|comprar|buy|fone|carregador|cabo|headphone|charger/i.test(lower)) return t.produto;
    if (/carrinho|cart|adicionar|checkout/i.test(lower)) return t.carrinho;
    if (/suporte|support|ajuda|help|contato|atendimento/i.test(lower)) return t.suporte;
    return t.padrao;
  }

  /* ──────────────────────────────────────────────────────────────
   * Tratar ações do backend
   * ────────────────────────────────────────────────────────────── */
  _handleAction(data) {
    switch (data.action) {
      case 'add_to_cart':
        if (data.product_id && typeof adicionarCarrinho === 'function') {
          adicionarCarrinho(data.product_id, data.product_name || 'Produto', Number(data.product_price) || 0);
        }
        break;
      case 'coupon_applied':
        if (data.coupon_valid && data.discount) {
          localStorage.setItem('cdm_discount', String(data.discount));
          if (typeof calcularTotalLocal === 'function') calcularTotalLocal();
        }
        break;
      case 'escalate_to_human':
        this._addMsg('🤝 Vou conectar você a um agente humano em breve!', 'bot');
        break;
      case 'whatsapp_link':
        if (data.link && /^https:\/\/(wa\.me|api\.whatsapp\.com)/.test(data.link)) {
          const a = document.createElement('a');
          a.href = data.link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = '📲 Abrir WhatsApp →';
          a.style.cssText = 'color:#25D366;font-weight:600;';
          const el = document.createElement('div');
          el.className = 'chatbot-msg bot';
          el.appendChild(a);
          document.getElementById('chatbot-body')?.appendChild(el);
        }
        break;
    }
  }

  /* ── User ID anônimo ──────────────────────────────────────────── */
  _uid() {
    let id = localStorage.getItem('cdm_anon_id');
    if (!id) { id = 'anon_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('cdm_anon_id', id); }
    return id;
  }
}

// Init
window.cdmChatBot = new ChatBot();
