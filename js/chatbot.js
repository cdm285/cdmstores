/**
 * CDM STORES - Chatbot Frontend
 * Chat widget flutuante com suporte multi-idioma
 */

const API_BASE = 'https://cdmstores.com/api';

class ChatBot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    // Usa a mesma chave que script.js para sincronizar idioma
    this.language = localStorage.getItem('cdm_lang') || 'pt';
    this.createChatWidget();
    this.attachEventListeners();
  }

  createChatWidget() {
    // Se já existe, não cria novamente
    if (document.getElementById('chatbot-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'chatbot-widget';
    widget.innerHTML = `
      <div class="chatbot-button" id="chatbot-btn" title="Chat com CDM">
        💬
      </div>

      <div class="chatbot-modal" id="chatbot-modal">
        <div class="chatbot-header">
          <h3>🤖</h3>
          <button class="chatbot-close" id="chatbot-close-btn">&times;</button>
        </div>

        <div class="chatbot-body" id="chatbot-body">
          <div class="chatbot-message bot">
            <p>Olá! Como posso ajudar? 😊</p>
          </div>
        </div>

        <div class="chatbot-footer">
          <div class="chatbot-lang-selector">
            <button class="lang-btn" data-lang="pt">PT</button>
            <button class="lang-btn" data-lang="en">EN</button>
            <button class="lang-btn" data-lang="es">ES</button>
          </div>
          <div class="chatbot-input-area">
            <input type="text" id="chatbot-input" placeholder="Digite sua mensagem..." />
            <button id="chatbot-send-btn">Enviar</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Injetar CSS
    this.injectStyles();
  }

  injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      #chatbot-widget {
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 9998;
        font-family: system-ui, -apple-system, sans-serif;
      }

      .chatbot-button {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(90deg, #00AFFF, #9B4DFF);
        color: white;
        font-size: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 175, 255, 0.4);
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .chatbot-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 175, 255, 0.6);
      }

      .chatbot-modal {
        position: fixed;
        bottom: 100px;
        right: 30px;
        width: 380px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
        display: none;
        flex-direction: column;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.3s ease;
        z-index: 9999;
      }

      .chatbot-modal.active {
        display: flex;
        opacity: 1;
        transform: scale(1);
      }

      .chatbot-header {
        background: linear-gradient(90deg, #00AFFF, #9B4DFF);
        color: white;
        padding: 16px;
        border-radius: 12px 12px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .chatbot-header h3 {
        margin: 0;
        font-size: 16px;
      }

      .chatbot-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
      }

      .chatbot-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #f9f9f9;
      }

      .chatbot-message {
        margin-bottom: 12px;
        display: flex;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .chatbot-message p {
        margin: 0;
        padding: 10px 14px;
        border-radius: 8px;
        max-width: 80%;
        word-wrap: break-word;
        line-height: 1.4;
        font-size: 14px;
      }

      .chatbot-message.user {
        justify-content: flex-end;
      }

      .chatbot-message.user p {
        background: #007AFF;
        color: white;
      }

      .chatbot-message.bot p {
        background: #e0e0e0;
        color: #333;
      }

      .chatbot-footer {
        padding: 12px;
        border-top: 1px solid #e0e0e0;
      }

      .chatbot-lang-selector {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }

      .lang-btn {
        flex: 1;
        padding: 6px;
        border: 1px solid #00AFFF;
        background: white;
        color: #00AFFF;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s;
      }

      .lang-btn.active {
        background: #00AFFF;
        color: white;
      }

      .chatbot-input-area {
        display: flex;
        gap: 8px;
      }

      #chatbot-input {
        flex: 1;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        outline: none;
      }

      #chatbot-input:focus {
        border-color: #00AFFF;
        box-shadow: 0 0 0 2px rgba(0, 175, 255, 0.1);
      }

      #chatbot-send-btn {
        padding: 10px 14px;
        background: #00AFFF;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.2s;
      }

      #chatbot-send-btn:hover {
        background: #0099dd;
      }

      /* Mobile */
      @media (max-width: 480px) {
        .chatbot-modal {
          width: 100vw;
          height: 80vh;
          bottom: 0;
          right: 0;
          border-radius: 12px 12px 0 0;
        }

        .chatbot-button {
          bottom: 20px;
          right: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  attachEventListeners() {
    const btn = document.getElementById('chatbot-btn');
    const closeBtn = document.getElementById('chatbot-close-btn');
    const sendBtn = document.getElementById('chatbot-send-btn');
    const input = document.getElementById('chatbot-input');
    const modal = document.getElementById('chatbot-modal');
    const langBtns = document.querySelectorAll('.lang-btn');

    btn.addEventListener('click', () => this.toggleChat());
    closeBtn.addEventListener('click', () => this.toggleChat());

    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    langBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        langBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.language = e.target.dataset.lang;
        // Sincroniza com a mesma chave de script.js
        localStorage.setItem('cdm_lang', this.language);
      });

      // Mark active language
      if (btn.dataset.lang === this.language) {
        btn.classList.add('active');
      }
    });

    // Sincroniza idioma quando script.js muda (via storage event)
    window.addEventListener('storage', (e) => {
      if (e.key === 'cdm_lang' && e.newValue && e.newValue !== this.language) {
        this.language = e.newValue;
        langBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.lang === this.language);
        });
      }
    });
  }

  toggleChat() {
    const modal = document.getElementById('chatbot-modal');
    this.isOpen = !this.isOpen;
    modal.classList.toggle('active');

    if (this.isOpen) {
      document.getElementById('chatbot-input').focus();
    }
  }

  async sendMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();

    if (!message) return;

    // Adicionar mensagem do usuário
    this.addMessage(message, 'user');
    input.value = '';

    // Mostrar indicador de digitação
    const typingId = 'typing-' + Date.now();
    this.addTypingIndicator(typingId);

    try {
      // Enviar para backend
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          language: this.language,
          user_id: this.getUserId()
        })
      });

      this.removeTypingIndicator(typingId);
      const data = await response.json();

      if (data.success) {
        this.addMessage(data.response, 'bot');

        // Processar ações dos 8 recursos
        if (data.action) {
          await this.handleAction(data);
        }

        // Salvar em chat_messages (session tracking)
        this.saveChatMessage(message, data.response, data.action);
      } else {
        this.addMessage('Desculpe, ocorreu um erro. Tente novamente.', 'bot');
      }
    } catch (error) {
      this.removeTypingIndicator(typingId);
      console.error('Erro ao enviar mensagem:', error);
      this.addMessage('Erro de conexão. Tente mais tarde.', 'bot');
    }
  }

  /**
   * Manipular as 8 ações do chatbot
   */
  async handleAction(data) {
    switch (data.action) {
      // 1. Integração com Carrinho
      case 'add_to_cart':
        if (data.product_id) {
          // Usa a função global que adiciona localmente (não depende de API)
          if (typeof adicionarCarrinho === 'function') {
            adicionarCarrinho(data.product_id, data.product_name || 'Produto', Number(data.product_price) || 0);
          }
          // Não exibe mensagem extra: data.response já contém a confirmação
        }
        break;

      // 2. Rastreio Real
      case 'tracking_found':
        if (data.data) {
          const statusMap = {
            'pending': '⏳ Pendente',
            'processing': '📦 Processando',
            'shipped': '🚚 Enviado',
            'delivered': '✅ Entregue',
            'cancelled': '❌ Cancelado'
          };
          this.addMessage(
            `📦 **Pedido #${data.data.id}**\n` +
            `Status: ${statusMap[data.data.status] || data.data.status}\n` +
            `Pedido em: ${data.data.created_at}\n` +
            `Última atualização: ${data.data.updated_at}`,
            'bot'
          );
        }
        break;

      // 3. Histórico de Pedidos
      case 'orders_found':
        if (data.data && data.data.length > 0) {
          let response = '📋 **Seus Pedidos:**\n\n';
          data.data.forEach((o, i) => {
            response += `${i + 1}. Pedido #${o.id} - R$ ${o.total} (${o.status})\n`;
          });
          this.addMessage(response, 'bot');
        }
        break;

      // 4. Aplicar Cupom
      case 'coupon_applied':
        if (data.coupon_valid && data.discount) {
          // Persiste no localStorage (mesmo mecanismo de frontend-integration.js)
          localStorage.setItem('cdm_discount', String(data.discount));
          localStorage.setItem('cdm_coupon', 'chatbot');
          if (typeof calcularTotalLocal === 'function') calcularTotalLocal();
          // Não exibe mensagem extra: data.response já contém a confirmação
        }
        break;

      // 5. Análise de Sentimento (escalate para humano se negativo)
      case 'escalate_to_human':
        this.addMessage(
          '🤝 Vamos conectá-lo a um agente humano para melhor suporte!',
          'bot'
        );
        break;

      // 6. Notificações
      case 'enable_notifications':
        localStorage.setItem('cdm_notifications_enabled', 'true');
        this.addMessage('🔔 Notificações ativadas! Você receberá alertas sobre promoções e status de pedidos.', 'bot');
        break;

      // 7. Agendamento
      case 'schedule_support':
        this.showSchedulingForm();
        break;

      // 8. WhatsApp
      case 'whatsapp_link':
        if (data.link) {
          // Validar que o link é apenas https:// ou https://wa.me (prevenir javascript: injection)
          const safeLink = /^https:\/\/(wa\.me|api\.whatsapp\.com)/.test(data.link) ? data.link : null;
          if (safeLink) {
            this.addMessageWithLink(
              '💬 Você será redirecionado para WhatsApp.',
              safeLink,
              'Abrir WhatsApp →'
            );
          }
        }
        break;

      default:
        console.log('Ação desconhecida:', data.action);
    }
  }

  /**
   * Salvar mensagem no localStorage para histórico
   */
  saveChatMessage(userMsg, botResponse, action) {
    const history = JSON.parse(localStorage.getItem('cdm_chat_history') || '[]');
    history.push({
      user: userMsg,
      bot: botResponse,
      action: action,
      timestamp: new Date().toISOString()
    });
    // Manter apenas últimas 50 mensagens
    if (history.length > 50) history.shift();
    localStorage.setItem('cdm_chat_history', JSON.stringify(history));
  }

  /**
   * Mostrar formulário de agendamento
   */
  showSchedulingForm() {
    const body = document.getElementById('chatbot-body');

    this.addMessage('📅 Preencha os dados para agendar seu atendimento:', 'bot');

    const form = document.createElement('div');
    form.id = 'scheduling-form';
    form.style.cssText = 'padding:12px;background:#f0f4ff;border-radius:8px;margin:8px 0;';

    const fields = [
      { id: 'schedule-email', type: 'email', placeholder: 'Seu email' },
      { id: 'schedule-name', type: 'text', placeholder: 'Seu nome' },
      { id: 'schedule-phone', type: 'tel', placeholder: 'Seu telefone' },
      { id: 'schedule-date', type: 'datetime-local', placeholder: '' },
    ];

    fields.forEach(f => {
      const input = document.createElement('input');
      input.type = f.type;
      input.id = f.id;
      if (f.placeholder) input.placeholder = f.placeholder;
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;';
      form.appendChild(input);
    });

    const textarea = document.createElement('textarea');
    textarea.id = 'schedule-reason';
    textarea.placeholder = 'Motivo ou dúvida...';
    textarea.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-bottom:8px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;resize:vertical;';
    form.appendChild(textarea);

    const btn = document.createElement('button');
    btn.textContent = 'Agendar';
    btn.style.cssText = 'width:100%;padding:10px;background:#00AFFF;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;';
    btn.addEventListener('click', () => this.submitScheduling());
    form.appendChild(btn);

    body.appendChild(form);
    body.scrollTop = body.scrollHeight;
  }

  /**
   * Enviar agendamento para backend
   */
  async submitScheduling() {
    const email = document.getElementById('schedule-email')?.value;
    const name = document.getElementById('schedule-name')?.value;
    const phone = document.getElementById('schedule-phone')?.value;
    const date = document.getElementById('schedule-date')?.value;

    if (!email || !name || !phone || !date) {
      this.addMessage('❌ Preencha todos os campos!', 'bot');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_email: email,
          customer_name: name,
          customer_phone: phone,
          scheduled_date: date
        })
      });

      const data = await response.json();
      if (data.success) {
        this.addMessage('✅ Agendamento confirmado! Você receberá um email de confirmação.', 'bot');
      } else {
        this.addMessage('❌ Erro ao agendar. Tente novamente.', 'bot');
      }
    } catch (error) {
      console.error('Erro ao agendar:', error);
      this.addMessage('Erro de conexão ao agendar.', 'bot');
    }
  }

  addTypingIndicator(id) {
    const body = document.getElementById('chatbot-body');
    const div = document.createElement('div');
    div.className = 'chatbot-message bot';
    div.id = id;
    div.innerHTML = `<p style="color:#999;font-style:italic;">✦ digitando...</p>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  addMessage(text, sender) {
    const body = document.getElementById('chatbot-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chatbot-message ${sender}`;

    const p = document.createElement('p');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      p.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) p.appendChild(document.createElement('br'));
    });

    msgDiv.appendChild(p);
    body.appendChild(msgDiv);

    // Scroll para última mensagem
    body.scrollTop = body.scrollHeight;
  }

  addMessageWithLink(text, linkUrl, linkText) {
    const body = document.getElementById('chatbot-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-message bot';

    const p = document.createElement('p');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      p.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) p.appendChild(document.createElement('br'));
    });
    p.appendChild(document.createElement('br'));

    const a = document.createElement('a');
    a.href = linkUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.color = '#25D366';
    a.style.fontWeight = 'bold';
    a.textContent = linkText;
    p.appendChild(a);

    msgDiv.appendChild(p);
    body.appendChild(msgDiv);
    body.scrollTop = body.scrollHeight;
  }

  getUserId() {
    let userId = localStorage.getItem('cdm_user_id');
    if (!userId) {
      userId = 'user_' + Date.now();
      localStorage.setItem('cdm_user_id', userId);
    }
    return userId;
  }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.chatbot = new ChatBot();
});
