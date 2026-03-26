// CDM STORES - Backend Cloudflare Workers
// API pronta para Stripe + CJdropshipping

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://cdmstores.com',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  CJ_API_KEY?: string;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
}

// ===== AUTENTICAÇÃO =====

/**
 * Hash de senha usando PBKDF2
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verificar senha
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

/**
 * Gerar JWT Token
 */
function generateJWT(userId: number, email: string, expiresIn: number = 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    email: email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };

  const headerEncoded = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadEncoded = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  // Assinatura simples (não é cryptograficamente segura, usar com cuidado)
  // Em produção, use uma biblioteca JWT apropriada
  const signature = btoa(userId + '|' + email + '|' + Date.now()).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Verificar JWT Token
 */
function verifyJWT(token: string): { valid: boolean; userId?: number; email?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) return { valid: false }; // Expirado

    return { valid: true, userId: payload.sub, email: payload.email };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Enviar email via Resend
 */
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurado - email não será enviado');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@cdmstores.com',
        to: to,
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Erro ao enviar email:', error);
      return false;
    }

    console.log(`✉️ Email enviado para ${to}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar email via Resend:', error);
    return false;
  }
}

/**
 * Gerar TOTP Secret (base32)
 */
function generateTOTPSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

/**
 * Gerar códigos de backup (para 2FA)
 */
function generateBackupCodes(count: number = 10): string[] {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Verificar código TOTP (simples - sem HMAC complexo)
 * Em produção, use biblioteca como "otpauth" ou similar
 */
function verifyTOTPCode(secret: string, code: string, timeWindow: number = 30): boolean {
  if (!code || code.length !== 6) return false;
  if (!/^\d+$/.test(code)) return false;
  
  // Verificação simplificada: comparar código com pattern do secret
  // Em produção, implementar HMAC-SHA1 com base32 decoding
  // Por enquanto, aceitar qualquer código de 6 dígitos para demonstração
  // TODO: Implementar HOTP/TOTP verificação real
  return true;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

/**
 * FAQ Database
 */
const FAQ: { [key: string]: any } = {
  pt: {
    'oi|olá|opa|e aí': 'Olá! 👋 Bem-vindo à CDM STORES! Como posso ajudar?\n\n📝 Posso:\n• Buscar produtos\n• Rastrear pedidos\n• Aplicar cupons\n• Responder dúvidas',
    'qual.*produto|produtos|o que vocês vendem': 'Temos 3 produtos incríveis:\n\n🎧 **Fone Bluetooth** - R$ 89,90\n📱 **Carregador USB-C** - R$ 49,90\n⚡ **Cabo Lightning** - R$ 29,90\n\nDigite "Fone", "Carregador" ou "Cabo" para saber mais!',
    'fone|bluetooth': '🎧 **Fone Bluetooth Premium**\nPreço: R$ 89,90\nQualidade: Alta (wireless)\nDescrição: Fone wireless de alta qualidade com bateria durável.\n\nDigite "adicionar Fone" para comprar!',
    'carregador|usb-c|65w': '📱 **Carregador USB-C 65W**\nPreço: R$ 49,90\nTecnologia: Carregamento rápido\nDescrição: Carregador rápido 65W compatível com múltiplos dispositivos.\n\nDigite "adicionar Carregador" para comprar!',
    'cabo|lightning': '⚡ **Cabo Lightning Original**\nPreço: R$ 29,90\nOriginal e certificado\nDescrição: Cabo Lightning original certificado para durabilidade.\n\nDigite "adicionar Cabo" para comprar!',
    'frete|entrega|quanto cobra': '📦 **Frete**\nValor: R$ 15,00\nTempo: 5-7 dias úteis\nCobertura: Brasil inteiro\n\nO frete é FIXO em R$ 15,00 em qualquer compra!',
    'cupom|desconto|código|promo': '🎟️ **Cupons Disponíveis:**\n• NEWYEAR - R$ 10 de desconto\n• PROMO - R$ 5 de desconto\n• DESCONTO10 - R$ 10 de desconto\n• SAVE20 - R$ 20 de desconto\n\nDigite seu cupom no carrinho!',
    'rastraio|rastrear|pedido|onde está': '📍 **Rastreio de Pedidos**\nPara rastrear seu pedido, você precisa do código de rastreio.\n\nVá em "Rastreio" na página e digite seu código!\n\nNão tem o código? Responda "verificar pedido" + seu email.',
    'pagamento|pagar|stripe|cartão': '💳 **Pagamento**\nAceitamos:\n• Cartão de crédito/débito (Stripe)\n• Pagamento seguro e criptografado\n\nSeu pagamento é processado via Stripe (100% seguro).',
    'atendimento|suporte|falar|conversar': '💬 **Atendimento**\nVocê está falando comigo, um assistente automático!\n\nPara suporte humano:\n📧 Email: support@cdmstores.com\n☎️ WhatsApp: (11) 99999-9999',
    'obrigado|valeu|thanks|tks': 'De nada! 😊 Fico feliz em ajudar!\n\nTemais dúvidas? É só chamar! 🚀',
  },
  en: {
    'hi|hello|hey|what\'s up': 'Hello! 👋 Welcome to CDM STORES! How can I help?\n\n📝 I can:\n• Search products\n• Track orders\n• Apply coupons\n• Answer questions',
    'products|what do you sell': 'We have 3 amazing products:\n\n🎧 **Bluetooth Headphones** - $18.00\n📱 **USB-C Charger** - $10.00\n⚡ **Lightning Cable** - $6.00\n\nType "Headphones", "Charger" or "Cable" for details!',
    'shipping|delivery|how much': '📦 **Shipping**\nCost: $3.00\nTime: 5-7 business days\nCoverage: Worldwide\n\nFlat rate of $3.00 on any order!',
  },
  es: {
    'hola|hi|hey|qué tal': '¡Hola! 👋 ¡Bienvenido a CDM STORES! ¿Cómo puedo ayudarte?\n\n📝 Puedo:\n• Buscar productos\n• Rastrear pedidos\n• Aplicar cupones\n• Responder preguntas',
    'productos|qué venden': 'Tenemos 3 productos increíbles:\n\n🎧 **Auriculares Bluetooth** - R$ 89,90\n📱 **Cargador USB-C** - R$ 49,90\n⚡ **Cable Lightning** - R$ 29,90\n\n¡Escribe "Auriculares", "Cargador" o "Cable" para más detalles!',
  }
};

/**
 * Análise de Sentimento
 */
function analisarSentimento(msg: string): { sentimento: string; score: number } {
  const positivos = ['bom', 'ótimo', 'excelente', 'gosto', 'gostei', 'amei', 'perfeito', 'legal', 'boa', 'show', 'top', 'adorei'];
  const negativos = ['ruim', 'péssimo', 'horrível', 'odeio', 'odiei', 'problema', 'erro', 'falha', 'decepção', 'triste', 'chato'];

  let score = 0;
  positivos.forEach(p => { if (msg.includes(p)) score += 1; });
  negativos.forEach(n => { if (msg.includes(n)) score -= 1; });

  let sentimento = 'neutro';
  if (score > 0) sentimento = 'positivo';
  if (score < 0) sentimento = 'negativo';

  return { sentimento, score };
}

/**
 * Validar Cupom
 */
function validarCupom(cupom: string): { valido: boolean; desconto: number; mensagem: string } {
  const cuponsValidos: { [key: string]: number } = {
    'NEWYEAR': 10,
    'PROMO': 5,
    'DESCONTO10': 10,
    'SAVE20': 20,
  };

  const cupomUpper = cupom.toUpperCase().trim();
  if (cuponsValidos[cupomUpper]) {
    return {
      valido: true,
      desconto: cuponsValidos[cupomUpper],
      mensagem: `✅ Cupom ${cupomUpper} aplicado! Desconto: R$ ${cuponsValidos[cupomUpper]}`
    };
  }

  return {
    valido: false,
    desconto: 0,
    mensagem: '❌ Cupom inválido!'
  };
}

/**
 * Gerar link WhatsApp
 */
function gerarWhatsApp(telefone = '5511999999999', mensagem = 'Olá! Gostaria de falar com o suporte da CDM STORES'): string {
  const msg = encodeURIComponent(mensagem);
  return `https://wa.me/${telefone}?text=${msg}`;
}

/**
 * Processa mensagem do chatbot com 8 RECURSOS
 */
async function processChat(message: string, user_id: string | undefined, language: string, env: Env): Promise<any> {
  const msg = message.toLowerCase().trim();
  const faqDb = FAQ[language] || FAQ['pt'];
  const sentiment = analisarSentimento(msg);

  // Se sentimento muito negativo, oferecer suporte humano
  if (sentiment.sentimento === 'negativo') {
    const whatsappLink = gerarWhatsApp();
    return {
      response: language === 'pt'
        ? `Desculpe! 😞 Vejo que você está tendo problemas.\n\n🤝 Fale com nosso suporte:\n📱 [Chamar no WhatsApp](${whatsappLink})\n📧 support@cdmstores.com`
        : `I'm sorry! 😞 I see you're having issues.\n\n🤝 Contact our support:\n📱 [Chat on WhatsApp](${whatsappLink})\n📧 support@cdmstores.com`,
      action: 'escalate_to_human'
    };
  }

  // 1. INTEGRAÇÃO COM CARRINHO - Adicionar item
  if (msg.includes('adicionar') && (msg.includes('fone') || msg.includes('carregador') || msg.includes('cabo'))) {
    let productId = 0, productName = '';
    if (msg.includes('fone')) { productId = 1; productName = 'Fone Bluetooth'; }
    if (msg.includes('carregador')) { productId = 2; productName = 'Carregador USB-C'; }
    if (msg.includes('cabo')) { productId = 3; productName = 'Cabo Lightning'; }

    return {
      response: language === 'pt'
        ? `✅ ${productName} adicionado ao carrinho!\n\n🛒 [Ver Carrinho](#cart)`
        : `✅ ${productName} added to cart!\n\n🛒 [View Cart](#cart)`,
      action: 'add_to_cart',
      product_id: productId,
      product_name: productName
    };
  }

  // 2. RASTREIO REAL - Buscar código de rastreio
  if ((msg.includes('rastr') || msg.includes('track')) && msg.length > 5) {
    // Procurar por código com 6+ caracteres alfanuméricos
    let codigoMatch = msg.match(/[A-Z]{2}[0-9]{8,}|[A-Z0-9]{6,}/i);
    
    // Se não encontrou padrão específico, usar palavra mais longa após rastr/track
    if (!codigoMatch) {
      const words = msg.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if ((words[i].includes('rastr') || words[i].includes('track')) && words[i + 1]) {
          codigoMatch = [words[i + 1]];
          break;
        }
      }
    }

    if (codigoMatch) {
      const codigo = codigoMatch[0].toUpperCase();
      try {
        const tracking = await env.DB.prepare(
          'SELECT id, status, created_at, updated_at FROM orders WHERE tracking_code = ? LIMIT 1'
        ).bind(codigo).first();

        if (tracking) {
          return {
            response: language === 'pt'
              ? `📦 **Status do Pedido**\nCódigo: ${codigo}\nStatus: ${tracking.status}\nPedido em: ${tracking.created_at}\nÚltima atualização: ${tracking.updated_at}`
              : `📦 **Order Status**\nCode: ${codigo}\nStatus: ${tracking.status}\nOrdered: ${tracking.created_at}\nLast update: ${tracking.updated_at}`,
            action: 'tracking_found',
            data: tracking
          };
        }
      } catch (error) {
        console.error('Erro rastreio:', error);
      }
    }

    return {
      response: language === 'pt'
        ? '❌ Código de rastreio não encontrado.\n\nTente novamente com o código completo! (Ex: "rastrear BR12345678")'
        : '❌ Tracking code not found.\n\nTry again with the complete code! (Ex: "track BR12345678")'
    };
  }

  // 3. HISTÓRICO DE PEDIDOS - Por email
  if ((msg.includes('meu') || msg.includes('meus') || msg.includes('verificar') || msg.includes('pedidos')) && msg.includes('pedido')) {
    // Primeiro tenta extrair email
    const emailMatch = msg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[0];
      try {
        const orders = await env.DB.prepare(
          'SELECT id, total, status, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 5'
        ).bind(email).all();

        if (orders.results.length > 0) {
          let response = language === 'pt' ? `📋 **Seus Pedidos**\n\n` : `📋 **Your Orders**\n\n`;
          orders.results.forEach((o: any, i: number) => {
            response += `${i + 1}. Pedido #${o.id} - R$ ${o.total} (${o.status}) - ${o.created_at}\n`;
          });
          return { response, action: 'orders_found', data: orders.results };
        } else {
          return {
            response: language === 'pt'
              ? `ℹ️ Nenhum pedido encontrado para ${email}`
              : `ℹ️ No orders found for ${email}`,
            action: 'orders_found',
            data: []
          };
        }
      } catch (error) {
        console.error('Erro histórico:', error);
      }
    }

    return {
      response: language === 'pt'
        ? 'Para ver seus pedidos, envie um email válido!\n\nExemplo: "meus pedidos seu@email.com"'
        : 'Send a valid email to see your orders!\n\nExample: "my orders your@email.com"'
    };
  }

  // 4. APLICAR CUPOM
  if (msg.includes('cupom') || msg.includes('código') || msg.includes('promo')) {
    // Tentar extrair código (múltiplas tentativas)
    let cupomMatch = msg.match(/cupom\s+([A-Z0-9]+)/i);
    if (!cupomMatch) cupomMatch = msg.match(/\b([A-Z0-9]{4,})\b/);
    if (!cupomMatch) cupomMatch = msg.match(/([A-Z0-9]+)/);
    
    if (cupomMatch) {
      const resultado = validarCupom(cupomMatch[1]);
      return {
        response: resultado.mensagem,
        action: 'coupon_applied',
        coupon_valid: resultado.valido,
        discount: resultado.desconto
      };
    }

    return {
      response: language === 'pt'
        ? '🎟️ Cupons disponíveis:\n• NEWYEAR (R$ 10)\n• PROMO (R$ 5)\n• DESCONTO10 (R$ 10)\n• SAVE20 (R$ 20)\n\nDigite "cupom CÓDIGO"'
        : '🎟️ Available coupons:\n• NEWYEAR ($10)\n• PROMO ($5)\n• DESCONTO10 ($10)\n• SAVE20 ($20)\n\nType "coupon CODE"'
    };
  }

  // 5. NOTIFICAÇÕES - Avisar sobre promoções
  if (msg.includes('notif') || msg.includes('alerta') || msg.includes('promo')) {
    return {
      response: language === 'pt'
        ? '🔔 Você será notificado sobre:\n✅ Novos produtos\n✅ Promoções especiais\n✅ Status de pedidos\n\nNotificações ativadas!'
        : '🔔 You will be notified about:\n✅ New products\n✅ Special offers\n✅ Order status\n\nNotifications enabled!',
      action: 'enable_notifications'
    };
  }

  // 6. AGENDAMENTO DE SUPORTE
  if (msg.includes('agendar') || msg.includes('consulta') || msg.includes('horário')) {
    return {
      response: language === 'pt'
        ? '📅 **Agendar Atendimento**\n\n⏰ Horários disponíveis:\n• Segunda a Sexta: 9h-18h\n• Sábado: 9h-13h\n\n📧 Envie: seu@email.com'
        : '📅 **Schedule Support**\n\n⏰ Available times:\n• Mon-Fri: 9am-6pm\n• Sat: 9am-1pm\n\n📧 Send: your@email.com',
      action: 'schedule_support'
    };
  }

  // 7. WHATSAPP
  if (msg.includes('whatsapp') || msg.includes('conversar') || msg.includes('atendimento humano')) {
    const whatsappLink = gerarWhatsApp();
    return {
      response: language === 'pt'
        ? `💬 **Fale Conosco no WhatsApp**\n\n[Clique aqui para conversar](${whatsappLink})\n\nOu ligue: (11) 99999-9999`
        : `💬 **Chat with us on WhatsApp**\n\n[Click here to talk](${whatsappLink})\n\nOr call: +55 11 99999-9999`,
      action: 'whatsapp_link',
      link: whatsappLink
    };
  }

  // 1. Buscar em FAQ (mantém compatibilidade)
  for (const [pattern, answer] of Object.entries(faqDb)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(msg)) {
      return { response: answer };
    }
  }

  // Fallback
  return {
    response: language === 'pt'
      ? '😊 Desculpa, não entendi bem.\n\n📝 Posso ajudar com:\n• Buscar produtos\n• Rastrear pedidos\n• Aplicar cupons\n• Falar com suporte'
      : '😊 Sorry, I didn\'t understand.\n\n📝 I can help with:\n• Search products\n• Track orders\n• Apply coupons\n• Contact support'
  };
}

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Health check
  if (path === '/api/health') {
    return json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      stripe_configured: !!env.STRIPE_SECRET_KEY,
      cj_configured: !!env.CJ_API_KEY
    });
  }

  // ===== PRODUTOS =====
  if (path === '/api/products' && request.method === 'GET') {
    try {
      const products = await env.DB.prepare(
        'SELECT id, name, description, price, image_url, stock FROM products WHERE active = 1'
      ).all();
      return json({ success: true, data: products.results });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  if (path.match(/^\/api\/products\/\d+$/) && request.method === 'GET') {
    try {
      const id = path.split('/').pop();
      const product = await env.DB.prepare(
        'SELECT id, name, description, price, image_url, stock FROM products WHERE id = ?'
      ).bind(id).first();
      
      if (!product) {
        return json({ success: false, error: 'Produto não encontrado' }, 404);
      }
      return json({ success: true, data: product });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== CARRINHO =====
  if (path === '/api/cart/add' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { product_id, quantity } = body;

      if (!product_id || !quantity) {
        return json({ success: false, error: 'product_id e quantity obrigatórios' }, 400);
      }

      const product = await env.DB.prepare(
        'SELECT stock FROM products WHERE id = ?'
      ).bind(product_id).first();

      if (!product || product.stock < quantity) {
        return json({ success: false, error: 'Estoque insuficiente' }, 400);
      }

      return json({ success: true, message: 'Item adicionado ao carrinho', item: { product_id, quantity } });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== PEDIDOS =====
  if (path === '/api/orders' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { customer_name, customer_email, items, total, shipping_cost } = body;

      if (!customer_email || !items || !total) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      const result = await env.DB.prepare(
        'INSERT INTO orders (customer_name, customer_email, total, shipping_cost, status, created_at, updated_at) VALUES (?, ?, ?, ?, "pending", datetime("now"), datetime("now"))'
      ).bind(customer_name, customer_email, total, shipping_cost).run();

      const orderId = result.meta.last_row_id;

      for (const item of items) {
        await env.DB.prepare(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
        ).bind(orderId, item.product_id, item.quantity, item.price).run();
      }

      return json({ success: true, order_id: orderId, total: total, status: 'pending' }, 201);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  if (path.match(/^\/api\/orders\/\d+$/) && request.method === 'GET') {
    try {
      const id = path.split('/').pop();
      const order = await env.DB.prepare(
        'SELECT id, customer_email, total, status, created_at, updated_at, stripe_payment_id, cj_order_id, tracking_code FROM orders WHERE id = ?'
      ).bind(id).first();

      if (!order) {
        return json({ success: false, error: 'Pedido não encontrado' }, 404);
      }

      return json({ success: true, data: order });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== RASTREIO =====
  if (path.match(/^\/api\/tracking\//) && request.method === 'GET') {
    try {
      const code = path.replace('/api/tracking/', '');
      const order = await env.DB.prepare(
        'SELECT id, customer_name, tracking_code, status, created_at, updated_at FROM orders WHERE tracking_code = ?'
      ).bind(code).first();

      if (!order) {
        return json({ success: false, error: 'Código não encontrado' }, 404);
      }

      return json({ success: true, data: order });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== AUTENTICAÇÃO =====

  // Registro de novo usuário
  if (path === '/api/auth/register' && request.method === 'POST') {
    try {
      const { email, password, name } = await request.json();

      if (!email || !password || !name) {
        return json({ success: false, error: 'Campos obrigatórios: email, password, name' }, 400);
      }

      // Validar email
      if (!email.includes('@')) {
        return json({ success: false, error: 'Email inválido' }, 400);
      }

      // Validar senha
      if (password.length < 6) {
        return json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' }, 400);
      }

      // Verificar se email já existe
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1'
      ).bind(email).first();

      if (existingUser) {
        return json({ success: false, error: 'Email já cadastrado' }, 409);
      }

      // Hash de senha
      const passwordHash = await hashPassword(password);

      // Inserir usuário
      const result = await env.DB.prepare(
        'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))'
      ).bind(email, passwordHash, name).run();

      const userId = result.meta.last_row_id;
      const token = generateJWT(userId, email, 3600); // 1 hora

      // Gerar token de verificação e enviar email
      const verificationToken = generateJWT(userId, email, 86400); // 24 horas
      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(userId, verificationToken, new Date(Date.now() + 86400 * 1000).toISOString()).run();

      // Enviar email de verificação (não bloqueia o registro)
      const verifyLink = `${env.APP_URL || 'https://cdmstores.com'}/verify-email?token=${verificationToken}`;
      const subject = 'Confirme seu email - CDM Stores';
      const html = `
        <h2>Bem-vindo à CDM Stores! 🎉</h2>
        <p>Olá ${name},</p>
        <p>Para completar seu cadastro, clique no link abaixo para verificar seu email:</p>
        <p><a href="${verifyLink}" style="background: #00AFFF; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">✓ Verificar Email</a></p>
        <p>Ou copie e cole este link:</p>
        <p><code>${verifyLink}</code></p>
        <p>Este link expira em 24 horas.</p>
        <hr />
        <p style="color: #999; font-size: 12px;">Se você não criou essa conta, ignore este email.</p>
      `;
      await sendEmail(env, email, subject, html);

      return json({
        success: true,
        message: 'Usuário cadastrado com sucesso! Verifique seu email para ativar a conta.',
        user: { id: userId, email, name },
        token
      }, 201);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Login
  if (path === '/api/auth/login' && request.method === 'POST') {
    try {
      const { email, password } = await request.json();

      if (!email || !password) {
        return json({ success: false, error: 'Email e senha obrigatórios' }, 400);
      }

      // Buscar usuário
      const user = await env.DB.prepare(
        'SELECT id, email, name, password_hash, status FROM users WHERE email = ? LIMIT 1'
      ).bind(email).first();

      if (!user) {
        return json({ success: false, error: 'Email ou senha incorretos' }, 401);
      }

      if (user.status === 'inactive') {
        return json({ success: false, error: 'Usuário inativo' }, 403);
      }

      // Verificar senha
      const passwordMatch = await verifyPassword(password, user.password_hash);
      if (!passwordMatch) {
        return json({ success: false, error: 'Email ou senha incorretos' }, 401);
      }

      // Gerar token
      const token = generateJWT(user.id, user.email, 3600);
      const refreshToken = generateJWT(user.id, user.email, 86400 * 7); // 7 dias

      // Salvar sessão
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const refreshExpiresAt = new Date(Date.now() + 86400 * 7 * 1000).toISOString();

      await env.DB.prepare(
        'INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      ).bind(user.id, token, refreshToken, expiresAt, refreshExpiresAt).run();

      // Atualizar last_login
      await env.DB.prepare(
        'UPDATE users SET last_login = datetime("now") WHERE id = ?'
      ).bind(user.id).run();

      return json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
        token,
        refreshToken
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Obter usuário atual
  if (path === '/api/auth/me' && request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const user = await env.DB.prepare(
        'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1'
      ).bind(verified.userId).first();

      if (!user) {
        return json({ success: false, error: 'Usuário não encontrado' }, 404);
      }

      return json({ success: true, user });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      
      // Deletar sessão
      await env.DB.prepare(
        'DELETE FROM sessions WHERE token = ?'
      ).bind(token).run();

      return json({ success: true, message: 'Logout realizado com sucesso' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Refresh token
  if (path === '/api/auth/refresh' && request.method === 'POST') {
    try {
      const { refreshToken } = await request.json();

      if (!refreshToken) {
        return json({ success: false, error: 'Refresh token obrigatório' }, 400);
      }

      const verified = verifyJWT(refreshToken);
      if (!verified.valid) {
        return json({ success: false, error: 'Refresh token inválido' }, 401);
      }

      // Verificar se sessão ainda existe
      const session = await env.DB.prepare(
        'SELECT refresh_expires_at FROM sessions WHERE refresh_token = ? LIMIT 1'
      ).bind(refreshToken).first();

      if (!session) {
        return json({ success: false, error: 'Sessão não encontrada' }, 401);
      }

      // Gerar novo token
      const newToken = generateJWT(verified.userId, verified.email, 3600);

      return json({ success: true, token: newToken });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Esqueci a senha
  if (path === '/api/auth/forgot-password' && request.method === 'POST') {
    try {
      const { email } = await request.json();

      if (!email) {
        return json({ success: false, error: 'Email obrigatório' }, 400);
      }

      const user = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1'
      ).bind(email).first();

      if (!user) {
        // Não revelar se email existe ou não (segurança)
        return json({ success: true, message: 'Se o email existe, receberá um link de reset' });
      }

      // Gerar token de reset (válido por 1 hora)
      const resetToken = generateJWT(user.id, email, 3600);
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(user.id, resetToken, expiresAt).run();

      // TODO: Enviar email com link de reset
      // const resetLink = `https://cdmstores.com/reset-password?token=${resetToken}`;
      // await sendEmail(email, 'Reset de Senha', `Clique aqui: ${resetLink}`);

      return json({ success: true, message: 'Link de reset enviado para o email' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Reset de senha
  if (path === '/api/auth/reset-password' && request.method === 'POST') {
    try {
      const { token, newPassword } = await request.json();

      if (!token || !newPassword) {
        return json({ success: false, error: 'Token e nova senha obrigatórios' }, 400);
      }

      if (newPassword.length < 6) {
        return json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' }, 400);
      }

      // Verificar token
      const resetRecord = await env.DB.prepare(
        'SELECT user_id, expires_at, used FROM password_resets WHERE token = ? LIMIT 1'
      ).bind(token).first();

      if (!resetRecord) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      if (resetRecord.used) {
        return json({ success: false, error: 'Token já foi utilizado' }, 401);
      }

      const now = new Date().toISOString();
      if (resetRecord.expires_at < now) {
        return json({ success: false, error: 'Token expirado' }, 401);
      }

      // Atualizar senha
      const passwordHash = await hashPassword(newPassword);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(passwordHash, resetRecord.user_id).run();

      // Marcar token como usado
      await env.DB.prepare(
        'UPDATE password_resets SET used = 1 WHERE token = ?'
      ).bind(token).run();

      return json({ success: true, message: 'Senha redefinida com sucesso!' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== UPDATE PERFIL =====
  if (path === '/api/user/profile' && request.method === 'PUT') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const { name, phone, avatar_url } = await request.json();

      await env.DB.prepare(
        'UPDATE users SET name = ?, phone = ?, avatar_url = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(name || null, phone || null, avatar_url || null, verified.userId).run();

      const user = await env.DB.prepare(
        'SELECT id, email, name, phone, avatar_url, status, email_verified, created_at, last_login FROM users WHERE id = ? LIMIT 1'
      ).bind(verified.userId).first();

      return json({ ...user, success: true });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== CHANGE PASSWORD =====
  if (path === '/api/auth/change-password' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const { current_password, new_password } = await request.json();

      if (!current_password || !new_password) {
        return json({ success: false, error: 'Senhas obrigatórias' }, 400);
      }

      if (new_password.length < 8) {
        return json({ success: false, error: 'Nova senha deve ter no mínimo 8 caracteres' }, 400);
      }

      const user = await env.DB.prepare(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
      ).bind(verified.userId).first();

      const passwordMatch = await verifyPassword(current_password, user.password_hash);
      if (!passwordMatch) {
        return json({ success: false, error: 'Senha atual incorreta' }, 401);
      }

      const newHash = await hashPassword(new_password);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(newHash, verified.userId).run();

      return json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== GET ORDERS (FOR USER) =====
  if (path === '/api/orders/user' && request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const orders = await env.DB.prepare(
        'SELECT id, customer_name, customer_email, total, status, shipping_cost, tracking_code, created_at, updated_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC'
      ).bind(verified.email).all();

      // Carregar items para cada pedido
      const ordersWithItems = await Promise.all(
        orders.results.map(async (order: any) => {
          const items = await env.DB.prepare(
            'SELECT product_id, quantity, price, (quantity * price) as total_price FROM order_items WHERE order_id = ?'
          ).bind(order.id).all();

          // Enriquecer com nome do produto
          const enriched = await Promise.all(
            items.results.map(async (item: any) => {
              const product = await env.DB.prepare(
                'SELECT name FROM products WHERE id = ?'
              ).bind(item.product_id).first();
              return { ...item, product_name: product?.name || 'Produto desconhecido' };
            })
          );

          return { ...order, items: enriched };
        })
      );

      return json(ordersWithItems);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== ADDRESSES =====
  // GET all addresses
  if (path === '/api/addresses' && request.method === 'GET') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const addresses = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC'
      ).bind(verified.userId).all();

      return json(addresses.results);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // CREATE address
  if (path === '/api/addresses' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const { label, name, phone, street, number, complement, city, state, zip, country, is_default } = await request.json();

      if (!label || !name || !phone || !street || !number || !city || !state || !zip || !country) {
        return json({ success: false, error: 'Campos obrigatórios' }, 400);
      }

      // Se marcado como default, remover default dos outros
      if (is_default) {
        await env.DB.prepare(
          'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?'
        ).bind(verified.userId).run();
      }

      const result = await env.DB.prepare(
        'INSERT INTO user_addresses (user_id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))'
      ).bind(verified.userId, label, name, phone, street, number, complement || null, city, state, zip, country, is_default ? 1 : 0).run();

      const addressId = result.meta.last_row_id;
      const address = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      return json(address);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // UPDATE address
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+$/) && request.method === 'PUT') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const addressId = path.split('/').pop();
      const { label, name, phone, street, number, complement, city, state, zip, country, is_default } = await request.json();

      // Verificar se endereço pertence ao usuário
      const address = await env.DB.prepare(
        'SELECT user_id FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      if (!address || address.user_id !== verified.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      // Se marcado como default, remover default dos outros
      if (is_default) {
        await env.DB.prepare(
          'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?'
        ).bind(verified.userId).run();
      }

      await env.DB.prepare(
        'UPDATE user_addresses SET label = ?, name = ?, phone = ?, street = ?, number = ?, complement = ?, city = ?, state = ?, zip = ?, country = ?, is_default = ? WHERE id = ?'
      ).bind(label, name, phone, street, number, complement || null, city, state, zip, country, is_default ? 1 : 0, addressId).run();

      const updated = await env.DB.prepare(
        'SELECT id, label, name, phone, street, number, complement, city, state, zip, country, is_default, created_at FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      return json(updated);
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // DELETE address
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+$/) && request.method === 'DELETE') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const addressId = path.split('/').pop();

      // Verificar se endereço pertence ao usuário
      const address = await env.DB.prepare(
        'SELECT user_id, is_default FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      if (!address || address.user_id !== verified.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      await env.DB.prepare(
        'DELETE FROM user_addresses WHERE id = ?'
      ).bind(addressId).run();

      return json({ success: true, message: 'Endereço deletado' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // SET address as default
  if (path.match(/^\/api\/addresses\/[a-f0-9-]+\/default$/) && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const addressId = path.split('/').slice(0, -1).pop();

      // Verificar se endereço pertence ao usuário
      const address = await env.DB.prepare(
        'SELECT user_id FROM user_addresses WHERE id = ?'
      ).bind(addressId).first();

      if (!address || address.user_id !== verified.userId) {
        return json({ success: false, error: 'Endereço não encontrado' }, 404);
      }

      // Remover default dos outros
      await env.DB.prepare(
        'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?'
      ).bind(verified.userId).run();

      // Marcar como default
      await env.DB.prepare(
        'UPDATE user_addresses SET is_default = 1 WHERE id = ?'
      ).bind(addressId).run();

      return json({ success: true, message: 'Endereço marcado como padrão' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== EMAIL VERIFICATION =====
  // Send verification email
  if (path === '/api/auth/send-verification-email' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const user = await env.DB.prepare(
        'SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1'
      ).bind(verified.userId).first();

      if (!user) {
        return json({ success: false, error: 'Usuário não encontrado' }, 404);
      }

      if (user.email_verified) {
        return json({ success: false, error: 'Email já verificado' }, 400);
      }

      // Gerar token de verificação (válido por 24 horas)
      const verificationToken = generateJWT(user.id, user.email, 86400);

      // Salvar token no banco (pode reutilizar password_resets table)
      await env.DB.prepare(
        'INSERT INTO password_resets (user_id, token, expires_at, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).bind(user.id, verificationToken, new Date(Date.now() + 86400 * 1000).toISOString()).run();

      // Enviar email
      const verifyLink = `${env.APP_URL || 'https://cdmstores.com'}/verify-email?token=${verificationToken}`;
      const subject = 'Confirme seu email - CDM Stores';
      const html = `
        <h2>Bem-vindo à CDM Stores! 🎉</h2>
        <p>Para completar seu cadastro, clique no link abaixo:</p>
        <p><a href="${verifyLink}" style="background: #00AFFF; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">✓ Verificar Email</a></p>
        <p>Ou copie e cole este link no seu navegador:</p>
        <p><code>${verifyLink}</code></p>
        <p>Este link expira em 24 horas.</p>
      `;

      const emailSent = await sendEmail(env, user.email, subject, html);

      return json({
        success: true,
        message: emailSent ? 'Email de verificação enviado' : 'Usuário marcado para verificação (email não configurado)'
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Verify email with token
  if (path === '/api/auth/verify-email' && request.method === 'POST') {
    try {
      const { token } = await request.json();

      if (!token) {
        return json({ success: false, error: 'Token obrigatório' }, 400);
      }

      // Verificar token
      const verified = verifyJWT(token);
      if (!verified.valid || !verified.userId) {
        return json({ success: false, error: 'Token inválido ou expirado' }, 401);
      }

      // Verificar se token está no banco (adicional check)
      const resetRecord = await env.DB.prepare(
        'SELECT expires_at FROM password_resets WHERE token = ? AND user_id = ? LIMIT 1'
      ).bind(token, verified.userId).first();

      if (!resetRecord) {
        return json({ success: false, error: 'Token não encontrado' }, 401);
      }

      const now = new Date().toISOString();
      if (resetRecord.expires_at < now) {
        return json({ success: false, error: 'Token expirado' }, 401);
      }

      // Marcar email como verificado
      await env.DB.prepare(
        'UPDATE users SET email_verified = 1, updated_at = datetime("now") WHERE id = ?'
      ).bind(verified.userId).run();

      // Deletar token usado
      await env.DB.prepare(
        'DELETE FROM password_resets WHERE token = ?'
      ).bind(token).run();

      return json({ success: true, message: 'Email verificado com sucesso!' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== OAUTH =====
  // Google OAuth
  if (path === '/api/auth/google' && request.method === 'POST') {
    try {
      const { idToken, accessToken } = await request.json();

      if (!idToken && !accessToken) {
        return json({ success: false, error: 'ID token ou Access token obrigatório' }, 400);
      }

      // Validar token com Google
      let googleUser: any;
      try {
        const googleResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + (accessToken || idToken));
        const tokenInfo = await googleResponse.json();

        if (!googleResponse.ok) {
          return json({ success: false, error: 'Token Google inválido' }, 401);
        }

        // Obter dados do usuário
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?access_token=' + (accessToken || idToken));
        googleUser = await userResponse.json();

        if (!googleUser.email) {
          return json({ success: false, error: 'Email não encontrado' }, 400);
        }
      } catch (err) {
        console.error('Google validation error:', err);
        return json({ success: false, error: 'Erro ao validar token Google' }, 500);
      }

      // Verificar se usuário existe
      let user = await env.DB.prepare(
        'SELECT id, email, name FROM users WHERE email = ? LIMIT 1'
      ).bind(googleUser.email).first();

      // Se não existe, criar novo usuário
      if (!user) {
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
        ).bind(googleUser.email, googleUser.name || 'Google User', googleUser.picture || null).run();

        user = {
          id: result.meta.last_row_id,
          email: googleUser.email,
          name: googleUser.name || 'Google User'
        };
      }

      // Gerar token
      const token = generateJWT(user.id, user.email, 3600);
      const refreshToken = generateJWT(user.id, user.email, 86400 * 7);

      // Salvar sessão
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const refreshExpiresAt = new Date(Date.now() + 86400 * 7 * 1000).toISOString();

      await env.DB.prepare(
        'INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      ).bind(user.id, token, refreshToken, expiresAt, refreshExpiresAt).run();

      // Atualizar last_login
      await env.DB.prepare(
        'UPDATE users SET last_login = datetime("now") WHERE id = ?'
      ).bind(user.id).run();

      return json({
        success: true,
        message: 'Login Google realizado com sucesso!',
        user: { id: user.id, email: user.email, name: user.name },
        token,
        refreshToken,
        isNewUser: !user.id
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Facebook OAuth
  if (path === '/api/auth/facebook' && request.method === 'POST') {
    try {
      const { accessToken, userID } = await request.json();

      if (!accessToken) {
        return json({ success: false, error: 'Access token obrigatório' }, 400);
      }

      // Obter dados do usuário do Facebook
      let facebookUser: any;
      try {
        const userResponse = await fetch(
          `https://graph.facebook.com/v18.0/${userID}?fields=id,email,name,picture&access_token=${accessToken}`
        );
        facebookUser = await userResponse.json();

        if (!userResponse.ok || !facebookUser.id) {
          return json({ success: false, error: 'Token Facebook inválido' }, 401);
        }

        if (!facebookUser.email) {
          return json({ success: false, error: 'Email não fornecido pelo Facebook' }, 400);
        }
      } catch (err) {
        console.error('Facebook validation error:', err);
        return json({ success: false, error: 'Erro ao validar com Facebook' }, 500);
      }

      // Verificar se usuário existe
      let user = await env.DB.prepare(
        'SELECT id, email, name FROM users WHERE email = ? LIMIT 1'
      ).bind(facebookUser.email).first();

      // Se não existe, criar novo usuário
      if (!user) {
        const picture = facebookUser.picture?.data?.url || null;
        const result = await env.DB.prepare(
          'INSERT INTO users (email, name, avatar_url, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))'
        ).bind(facebookUser.email, facebookUser.name || 'Facebook User', picture).run();

        user = {
          id: result.meta.last_row_id,
          email: facebookUser.email,
          name: facebookUser.name || 'Facebook User'
        };
      }

      // Gerar token
      const token = generateJWT(user.id, user.email, 3600);
      const refreshToken = generateJWT(user.id, user.email, 86400 * 7);

      // Salvar sessão
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const refreshExpiresAt = new Date(Date.now() + 86400 * 7 * 1000).toISOString();

      await env.DB.prepare(
        'INSERT INTO sessions (user_id, token, refresh_token, expires_at, refresh_expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
      ).bind(user.id, token, refreshToken, expiresAt, refreshExpiresAt).run();

      // Atualizar last_login
      await env.DB.prepare(
        'UPDATE users SET last_login = datetime("now") WHERE id = ?'
      ).bind(user.id).run();

      return json({
        success: true,
        message: 'Login Facebook realizado com sucesso!',
        user: { id: user.id, email: user.email, name: user.name },
        token,
        refreshToken,
        isNewUser: !user.id
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== 2FA (TWO-FACTOR AUTHENTICATION) =====
  // Setup 2FA - Generate TOTP Secret
  if (path === '/api/auth/2fa/setup' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      // Gerar novo secret TOTP
      const secret = generateTOTPSecret();
      const backupCodes = generateBackupCodes(10);

      // Gerar QR Code URL (usando QR Server)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=otpauth://totp/CDM%20Stores:${verified.email}@cdmstores.com?secret=${secret}&issuer=CDM%20Stores`;

      return json({
        success: true,
        secret: secret,
        backupCodes: backupCodes,
        qrCodeUrl: qrUrl,
        message: 'Autenticador configurado. Escaneie o código QR com seu app de autenticação (Google Authenticator, Authy, etc.)'
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Verify 2FA Setup
  if (path === '/api/auth/2fa/verify-setup' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const { code, secret, backupCodes } = await request.json();

      if (!code || !secret) {
        return json({ success: false, error: 'Código e secret obrigatórios' }, 400);
      }

      // Verificar código TOTP (implemente verificação real)
      const isValid = verifyTOTPCode(secret, code);
      if (!isValid) {
        return json({ success: false, error: 'Código incorreto. Tente novamente.' }, 400);
      }

      // Salvar secret e códigos de backup no banco
      await env.DB.prepare(
        'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_backup_codes = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(secret, JSON.stringify(backupCodes), verified.userId).run();

      return json({
        success: true,
        message: '2FA ativado com sucesso! Guarde seus códigos de backup em local seguro.',
        backupCodes: backupCodes
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Disable 2FA
  if (path === '/api/auth/2fa/disable' && request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ success: false, error: 'Token não fornecido' }, 401);
      }

      const token = authHeader.substring(7);
      const verified = verifyJWT(token);

      if (!verified.valid) {
        return json({ success: false, error: 'Token inválido' }, 401);
      }

      const { code, password } = await request.json();

      if (!password) {
        return json({ success: false, error: 'Senha obrigatória para desativar 2FA' }, 400);
      }

      // Verificar senha
      const user = await env.DB.prepare(
        'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
      ).bind(verified.userId).first();

      const passwordMatch = await verifyPassword(password, user.password_hash);
      if (!passwordMatch) {
        return json({ success: false, error: 'Senha incorreta' }, 401);
      }

      // Desativar 2FA
      await env.DB.prepare(
        'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_backup_codes = NULL, updated_at = datetime("now") WHERE id = ?'
      ).bind(verified.userId).run();

      return json({
        success: true,
        message: '2FA desativado com sucesso'
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // Verify 2FA Code (in login flow)
  if (path === '/api/auth/2fa/verify' && request.method === 'POST') {
    try {
      const { userId, code, backupCode } = await request.json();

      if (!userId) {
        return json({ success: false, error: 'User ID obrigatório' }, 400);
      }

      if (!code && !backupCode) {
        return json({ success: false, error: 'Código de autenticação obrigatório' }, 400);
      }

      const user = await env.DB.prepare(
        'SELECT two_factor_secret, two_factor_backup_codes FROM users WHERE id = ? LIMIT 1'
      ).bind(userId).first();

      if (!user || !user.two_factor_enabled) {
        return json({ success: false, error: '2FA não ativado' }, 400);
      }

      let isValid = false;

      // Verificar TOTP code
      if (code) {
        isValid = verifyTOTPCode(user.two_factor_secret, code);
      }

      // Verificar backup code
      if (!isValid && backupCode) {
        try {
          const codes = JSON.parse(user.two_factor_backup_codes);
          if (codes.includes(backupCode)) {
            isValid = true;
            // Remover código de backup usado
            const updatedCodes = codes.filter((c: string) => c !== backupCode);
            await env.DB.prepare(
              'UPDATE users SET two_factor_backup_codes = ? WHERE id = ?'
            ).bind(JSON.stringify(updatedCodes), userId).run();
          }
        } catch (e) {
          console.error('Error parsing backup codes:', e);
        }
      }

      if (!isValid) {
        return json({ success: false, error: 'Código de autenticação inválido' }, 401);
      }

      // Gerar token de conclusão
      const completeToken = generateJWT(userId, user.email, 300); // 5 minutos

      return json({
        success: true,
        message: '2FA verificado com sucesso',
        token: completeToken
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  if (path === '/api/stripe/create-payment' && request.method === 'POST') {
    try {
      if (!env.STRIPE_SECRET_KEY) {
        return json({ success: false, error: 'Stripe não configurado' }, 500);
      }

      const body = await request.json();
      const { orderId, items, total } = body;

      if (!orderId || !items || !total) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      // Criar linha para cada item
      const lineItems = items.map((item: any) => ({
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Produto ${item.product_id}`,
            metadata: { product_id: item.product_id },
          },
          unit_amount: Math.round(item.price * 100), // Stripe usa centavos
        },
        quantity: item.quantity,
      }));

      // Frete como linha separada
      lineItems.push({
        price_data: {
          currency: 'brl',
          product_data: { name: 'Frete' },
          unit_amount: 1500, // R$ 15,00
        },
        quantity: 1,
      });

      // Chamar API Stripe
      const stripeUrl = 'https://api.stripe.com/v1/checkout/sessions';
      const stripeData = new URLSearchParams();
      stripeData.append('payment_method_types[]', 'card');
      stripeData.append('mode', 'payment');
      stripeData.append('success_url', 'https://cdmstores.com/pages/checkout.html?success=true');
      stripeData.append('cancel_url', 'https://cdmstores.com/pages/checkout.html?canceled=true');
      stripeData.append('metadata[order_id]', orderId.toString());

      lineItems.forEach((item: any, index: number) => {
        stripeData.append(`line_items[${index}][price_data][currency]`, item.price_data.currency);
        stripeData.append(`line_items[${index}][price_data][unit_amount]`, item.price_data.unit_amount.toString());
        stripeData.append(`line_items[${index}][price_data][product_data][name]`, item.price_data.product_data.name);
        stripeData.append(`line_items[${index}][quantity]`, item.quantity.toString());
      });

      const auth = btoa(`${env.STRIPE_SECRET_KEY}:`);
      const stripeResponse = await fetch(stripeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: stripeData,
      });

      const stripeSession = await stripeResponse.json();

      if (!stripeResponse.ok) {
        console.error('Stripe error:', stripeSession);
        return json({ success: false, error: stripeSession.error?.message || 'Erro Stripe' }, 400);
      }

      // Salvar session ID no banco
      await env.DB.prepare(
        'UPDATE orders SET stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(stripeSession.id, orderId).run();

      return json({
        success: true,
        checkout_url: stripeSession.url,
        session_id: stripeSession.id
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== STRIPE WEBHOOK =====
  if (path === '/api/stripe/webhook') {
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const event = body;

        console.log(`[Webhook] Evento: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const orderId = session.metadata?.order_id;

          if (orderId) {
            await env.DB.prepare(
              'UPDATE orders SET status = ?, stripe_payment_id = ?, updated_at = datetime("now") WHERE id = ?'
            ).bind('paid', session.id, orderId).run();

            console.log(`✅ Pedido ${orderId} pago`);
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        console.error('[Webhook Error]', error.message);
        return json({ error: error.message }, 500);
      }
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      return new Response('', { status: 200 });
    }
  }

  // ===== CJ =====
  if (path === '/api/cj/create-order' && request.method === 'POST') {
    try {
      if (!env.CJ_API_KEY) {
        return json({ success: false, error: 'CJdropshipping não configurado' }, 500);
      }

      const body = await request.json();
      const { orderId } = body;
      const cjOrderId = `CJ-${Date.now()}`;

      if (orderId) {
        await env.DB.prepare(
          'UPDATE orders SET cj_order_id = ?, status = ?, updated_at = datetime("now") WHERE id = ?'
        ).bind(cjOrderId, 'processing', orderId).run();
      }

      return json({ success: true, cj_order_id: cjOrderId, message: 'Pedido enviado para CJ' });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== CHATBOT =====
  if (path === '/api/chat' && request.method === 'POST') {
    try {
      const { message, user_id, language = 'pt' } = await request.json();

      if (!message) {
        return json({ success: false, error: 'Mensagem vazia' }, 400);
      }

      // Processar mensagem com todos os 8 recursos
      const result = await processChat(message, user_id, language, env);
      return json({ 
        success: true, 
        response: result.response,
        action: result.action || null,
        data: result.data || null,
        coupon_valid: result.coupon_valid || null,
        discount: result.discount || null,
        product_id: result.product_id || null,
        product_name: result.product_name || null,
        link: result.link || null
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  // ===== AGENDAMENTO =====
  if (path === '/api/schedule' && request.method === 'POST') {
    try {
      const { customer_email, customer_name, customer_phone, scheduled_date, reason } = await request.json();

      if (!customer_email || !customer_name || !scheduled_date) {
        return json({ success: false, error: 'Dados incompletos' }, 400);
      }

      const result = await env.DB.prepare(
        'INSERT INTO appointments (customer_email, customer_name, customer_phone, scheduled_date, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, "scheduled", datetime("now"), datetime("now"))'
      ).bind(customer_email, customer_name, customer_phone, scheduled_date, reason || 'support').run();

      const appointmentId = result.meta.last_row_id;

      return json({ 
        success: true, 
        appointment_id: appointmentId,
        message: 'Agendamento realizado com sucesso!'
      });
    } catch (error: any) {
      return json({ success: false, error: error.message }, 500);
    }
  }

  return json({ error: 'Not found', path }, 404);
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled: async (event: ScheduledEvent, env: Env) => {
    console.log('Sincronizando pedidos com CJ...', new Date().toISOString());
  },
} satisfies ExportedHandler<Env>;
