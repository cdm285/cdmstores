/**
 * CDM STORES - Chatbot Frontend
 * Chat widget flutuante com suporte multi-idioma
 */

const API_BASE = 'https://cdmstores.com/api';

class ChatBot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.language = localStorage.getItem('cdm_language') || 'pt';
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
        localStorage.setItem('cdm_language', this.language);
      });

      // Mark active language
      if (btn.dataset.lang === this.language) {
        btn.classList.add('active');
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
        if (typeof cart !== 'undefined' && data.product_id) {
          cart.adicionarCarrinho(data.product_id);
          this.addMessage(`✅ ${data.product_name} foi adicionado ao seu carrinho!`, 'bot');
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
        if (data.coupon_valid && typeof cart !== 'undefined' && data.discount) {
          cart.cupomDesconto = data.discount;
          this.addMessage(
            `✅ Cupom aplicado com sucesso!\n` +
            `Desconto: R$ ${data.discount}`,
            'bot'
          );
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
          this.addMessage(
            `💬 Você será redirecionado para WhatsApp.\n` +
            `<a href="${data.link}" target="_blank" style="color: #25D366; font-weight: bold;">Abrir WhatsApp →</a>`,
            'bot'
          );
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
    const modal = document.getElementById('chatbot-modal');
    const formHtml = `
      <div class="scheduling-form" id="scheduling-form">
        <h4>📅 Agendar Atendimento</h4>
        <input type="email" placeholder="Seu email" id="schedule-email" />
        <input type="text" placeholder="Seu nome" id="schedule-name" />
        <input type="tel" placeholder="Seu telefone" id="schedule-phone" />
        <input type="datetime-local" id="schedule-date" />
        <textarea placeholder="Motivo ou dúvida..." id="schedule-reason"></textarea>
        <button onclick="chatbot.submitScheduling()">Agendar</button>
      </div>
    `;
    // Injetar no final do modal (simplificado)
    this.addMessage(
      '📅 Por favor, preencha os dados:\n' +
      'Email, Nome, Telefone e Data/Hora desejada',
      'bot'
    );
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

  addMessage(text, sender) {
    const body = document.getElementById('chatbot-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chatbot-message ${sender}`;

    const p = document.createElement('p');
    p.innerHTML = text.replace(/\n/g, '<br>');

    msgDiv.appendChild(p);
    body.appendChild(msgDiv);

    // Scroll para última mensagem
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
  new ChatBot();
});
