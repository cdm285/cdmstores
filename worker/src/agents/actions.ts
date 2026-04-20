/**
 * Agent 17 — CartAgent        Add/query cart items
 * Agent 18 — OrderAgent       Order history by email
 * Agent 19 — TrackingAgent    Real tracking lookup in D1
 * Agent 20 — CouponAgent      Validate and apply coupons
 * Agent 21 — ProductAgent     Product catalog lookup
 * Agent 22 — SchedulingAgent  Book support appointments
 * Agent 23 — WhatsAppAgent    Generate wa.me links
 * Agent 24 — NotificationAgent Toggle notification preference
 * Agent 26 — PaymentAgent     Payment guidance
 * Agent 41 — FallbackAgent    Default response
 * Agent 42 — EscalationAgent  Escalate to human
 */

import type { AgentContext, AgentResult } from '../core/types.js';
import { BaseAgent } from '../core/types.js';

// ─── Shared Data ─────────────────────────────────────────────────────────────
const COUPONS: Record<string, number> = {
  NEWYEAR: 10,
  PROMO: 5,
  DESCONTO10: 10,
  SAVE20: 20,
  CDM10: 10,
};

const PRODUCTS = [
  { id: 1, name: 'Fone Bluetooth', price: 89.9, stock: 50 },
  { id: 2, name: 'Carregador USB-C 65W', price: 49.9, stock: 100 },
  { id: 3, name: 'Cabo Lightning 2m', price: 29.9, stock: 0 },
  { id: 4, name: 'Caixa de Som Portátil', price: 149.9, stock: 5 },
];

function waLink(msg: string): string {
  return `https://wa.me/5511999999999?text=${encodeURIComponent(msg)}`;
}

// ─── Agent 17 — CartAgent ──────────────────────────────────────────────────────
export class CartAgent extends BaseAgent {
  readonly id = '17-cart';
  readonly name = 'CartAgent';

  async run(ctx: AgentContext, productId: number): Promise<AgentResult> {
    const t = this.start();
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) {
      return this.fail(this.id, 'Produto não encontrado', t);
    }
    if (product.stock === 0) {
      const msgs: Record<string, string> = {
        pt: `❌ ${product.name} está esgotado no momento. Posso te avisar quando chegar?`,
        en: `❌ ${product.name} is currently out of stock. Want to be notified when available?`,
        es: `❌ ${product.name} está agotado. ¿Quieres que te avisemos cuando llegue?`,
      };
      return this.ok(
        this.id,
        {
          response: msgs[ctx.session.language] ?? msgs.pt,
          action: 'enable_notifications',
          confidence: 95,
        },
        t,
      );
    }
    const msgs: Record<string, string> = {
      pt: `✅ **${product.name}** (R$ ${product.price.toFixed(2)}) adicionado ao carrinho!`,
      en: `✅ **${product.name}** ($${product.price.toFixed(2)}) added to cart!`,
      es: `✅ **${product.name}** (R$ ${product.price.toFixed(2)}) agregado al carrito!`,
    };
    return this.ok(
      this.id,
      {
        response: msgs[ctx.session.language] ?? msgs.pt,
        action: 'add_to_cart',
        actionPayload: {
          product_id: productId,
          product_name: product.name,
          product_price: product.price,
        },
        confidence: 98,
      },
      t,
    );
  }
}

// ─── Agent 18 — OrderAgent ────────────────────────────────────────────────────
export class OrderAgent extends BaseAgent {
  readonly id = '18-order';
  readonly name = 'OrderAgent';

  async run(ctx: AgentContext, email: string): Promise<AgentResult> {
    const t = this.start();
    try {
      const orders = await ctx.env.DB.prepare(
        'SELECT id, total, status, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 5',
      )
        .bind(email)
        .all<{ id: number; total: number; status: string; created_at: string }>();

      if (!orders.results.length) {
        const msgs: Record<string, string> = {
          pt: `ℹ️ Nenhum pedido encontrado para **${email}**.`,
          en: `ℹ️ No orders found for **${email}**.`,
          es: `ℹ️ No se encontraron pedidos para **${email}**.`,
        };
        return this.ok(
          this.id,
          {
            response: msgs[ctx.session.language] ?? msgs.pt,
            action: 'orders_found',
            actionPayload: { data: [] },
            confidence: 90,
          },
          t,
        );
      }

      const lines = orders.results
        .map((o, i) => `${i + 1}. Pedido #${o.id} · R$ ${Number(o.total).toFixed(2)} · ${o.status}`)
        .join('\n');
      const headers: Record<string, string> = {
        pt: '📋 **Seus Pedidos:**',
        en: '📋 **Your Orders:**',
        es: '📋 **Tus Pedidos:**',
      };
      const response = `${headers[ctx.session.language] ?? headers.pt}\n\n${lines}`;

      return this.ok(
        this.id,
        {
          response,
          action: 'orders_found',
          actionPayload: { data: orders.results },
          confidence: 95,
        },
        t,
      );
    } catch {
      return this.fail(this.id, 'DB error fetching orders', t);
    }
  }
}

// ─── Agent 19 — TrackingAgent ─────────────────────────────────────────────────
export class TrackingAgent extends BaseAgent {
  readonly id = '19-tracking';
  readonly name = 'TrackingAgent';

  async run(ctx: AgentContext, code: string): Promise<AgentResult> {
    const t = this.start();
    try {
      const order = await ctx.env.DB.prepare(
        'SELECT id, status, created_at, updated_at FROM orders WHERE tracking_code = ? LIMIT 1',
      )
        .bind(code.toUpperCase())
        .first<{ id: number; status: string; created_at: string; updated_at: string }>();

      if (!order) {
        const msgs: Record<string, string> = {
          pt: `❌ Código **${code}** não encontrado.\n\nVerifique o código e tente novamente, ou envie seu email para buscarmos pelo pedido.`,
          en: `❌ Code **${code}** not found.\n\nCheck the code and try again, or send your email so we can find your order.`,
          es: `❌ Código **${code}** no encontrado.\n\nVerifica el código o envía tu email para buscar tu pedido.`,
        };
        return this.ok(
          this.id,
          { response: msgs[ctx.session.language] ?? msgs.pt, confidence: 90 },
          t,
        );
      }

      const statusMap: Record<string, Record<string, string>> = {
        pending: { pt: '⏳ Pendente', en: '⏳ Pending', es: '⏳ Pendiente' },
        processing: { pt: '📦 Processando', en: '📦 Processing', es: '📦 Procesando' },
        shipped: { pt: '🚚 Enviado', en: '🚚 Shipped', es: '🚚 Enviado' },
        delivered: { pt: '✅ Entregue', en: '✅ Delivered', es: '✅ Entregado' },
        cancelled: { pt: '❌ Cancelado', en: '❌ Cancelled', es: '❌ Cancelado' },
      };
      const lang = ctx.session.language;
      const status = statusMap[order.status]?.[lang] ?? order.status;

      const headers: Record<string, string> = {
        pt: `📦 **Pedido #${order.id}**\nStatus: ${status}\nAtualizado: ${order.updated_at}`,
        en: `📦 **Order #${order.id}**\nStatus: ${status}\nUpdated: ${order.updated_at}`,
        es: `📦 **Pedido #${order.id}**\nEstado: ${status}\nActualizado: ${order.updated_at}`,
      };

      return this.ok(
        this.id,
        {
          response: headers[lang] ?? headers.pt,
          action: 'tracking_found',
          actionPayload: { data: order },
          confidence: 98,
        },
        t,
      );
    } catch {
      return this.fail(this.id, 'DB error on tracking lookup', t);
    }
  }
}

// ─── Agent 20 — CouponAgent ───────────────────────────────────────────────────
export class CouponAgent extends BaseAgent {
  readonly id = '20-coupon';
  readonly name = 'CouponAgent';

  async run(ctx: AgentContext, code: string): Promise<AgentResult> {
    const t = this.start();
    const upper = code.toUpperCase().trim();
    const discount = COUPONS[upper];

    if (discount) {
      const msgs: Record<string, string> = {
        pt: `✅ Cupom **${upper}** válido! Desconto de R$ ${discount.toFixed(2)} aplicado! 🎉`,
        en: `✅ Coupon **${upper}** valid! R$ ${discount.toFixed(2)} discount applied! 🎉`,
        es: `✅ Cupón **${upper}** válido! ¡Descuento de R$ ${discount.toFixed(2)} aplicado! 🎉`,
      };
      return this.ok(
        this.id,
        {
          response: msgs[ctx.session.language] ?? msgs.pt,
          action: 'coupon_applied',
          actionPayload: { coupon_valid: true, discount },
          confidence: 99,
        },
        t,
      );
    }

    const listMsg: Record<string, string> = {
      pt: `❌ Cupom **${upper}** inválido.\n\n🎟️ Cupons disponíveis:\n• NEWYEAR – R$ 10\n• PROMO – R$ 5\n• DESCONTO10 – R$ 10\n• SAVE20 – R$ 20\n• CDM10 – R$ 10`,
      en: `❌ Coupon **${upper}** invalid.\n\n🎟️ Available coupons:\n• NEWYEAR – R$ 10\n• PROMO – R$ 5\n• DESCONTO10 – R$ 10\n• SAVE20 – R$ 20\n• CDM10 – R$ 10`,
      es: `❌ Cupón **${upper}** inválido.\n\n🎟️ Cupones disponibles:\n• NEWYEAR – R$ 10\n• PROMO – R$ 5\n• DESCONTO10 – R$ 10\n• SAVE20 – R$ 20\n• CDM10 – R$ 10`,
    };
    return this.ok(
      this.id,
      {
        response: listMsg[ctx.session.language] ?? listMsg.pt,
        action: 'coupon_applied',
        actionPayload: { coupon_valid: false, discount: 0 },
        confidence: 99,
      },
      t,
    );
  }
}

// ─── Agent 21 — ProductAgent ──────────────────────────────────────────────────
export class ProductAgent extends BaseAgent {
  readonly id = '21-product';
  readonly name = 'ProductAgent';

  async run(ctx: AgentContext, productId?: number): Promise<AgentResult> {
    const t = this.start();

    if (productId) {
      const p = PRODUCTS.find(pr => pr.id === productId);
      if (!p) {
        return this.fail(this.id, 'Product not found', t);
      }
      const stockText: Record<string, string> = {
        pt: p.stock > 0 ? `✅ Em estoque (${p.stock} unidades)` : '❌ Esgotado',
        en: p.stock > 0 ? `✅ In stock (${p.stock} units)` : '❌ Out of stock',
        es: p.stock > 0 ? `✅ En stock (${p.stock} unidades)` : '❌ Agotado',
      };
      const msgs: Record<string, string> = {
        pt: `🛍️ **${p.name}**\nPreço: R$ ${p.price.toFixed(2)}\n${stockText.pt}\n\nDigite "adicionar ${p.name}" para comprar!`,
        en: `🛍️ **${p.name}**\nPrice: R$ ${p.price.toFixed(2)}\n${stockText.en}\n\nType "add ${p.name}" to buy!`,
        es: `🛍️ **${p.name}**\nPrecio: R$ ${p.price.toFixed(2)}\n${stockText.es}\n\n¡Escribe "agregar ${p.name}" para comprar!`,
      };
      return this.ok(
        this.id,
        { response: msgs[ctx.session.language] ?? msgs.pt, confidence: 95 },
        t,
      );
    }

    // Full catalog
    const catalog = PRODUCTS.map(
      p => `• **${p.name}** – R$ ${p.price.toFixed(2)} ${p.stock === 0 ? '(Esgotado)' : ''}`,
    ).join('\n');
    const headers: Record<string, string> = {
      pt: `🛍️ **Nossos Produtos:**\n\n${catalog}\n\nFrete: R$ 15,00 · Entrega em 3-7 dias úteis`,
      en: `🛍️ **Our Products:**\n\n${catalog}\n\nShipping: R$ 15.00 · 3-7 business days`,
      es: `🛍️ **Nuestros Productos:**\n\n${catalog}\n\nEnvío: R$ 15,00 · 3-7 días hábiles`,
    };
    return this.ok(
      this.id,
      { response: headers[ctx.session.language] ?? headers.pt, confidence: 95 },
      t,
    );
  }
}

// ─── Agent 22 — SchedulingAgent ───────────────────────────────────────────────
export class SchedulingAgent extends BaseAgent {
  readonly id = '22-scheduling';
  readonly name = 'SchedulingAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const msgs: Record<string, string> = {
      pt: `📅 **Agendar Atendimento**\n\n⏰ Horários disponíveis:\n• Seg-Sex: 9h–18h\n• Sábado: 9h–13h\n\nO formulário de agendamento será aberto para você preencher seus dados.`,
      en: `📅 **Book Support**\n\n⏰ Available times:\n• Mon-Fri: 9am–6pm\n• Sat: 9am–1pm\n\nThe scheduling form will open for you to fill in your details.`,
      es: `📅 **Agendar Atención**\n\n⏰ Horarios disponibles:\n• Lun-Vie: 9h–18h\n• Sáb: 9h–13h\n\nSe abrirá el formulario de cita para que completes tus datos.`,
    };
    return this.ok(
      this.id,
      {
        response: msgs[ctx.session.language] ?? msgs.pt,
        action: 'schedule_support',
        confidence: 95,
      },
      t,
    );
  }
}

// ─── Agent 23 — WhatsAppAgent ─────────────────────────────────────────────────
export class WhatsAppAgent extends BaseAgent {
  readonly id = '23-whatsapp';
  readonly name = 'WhatsAppAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const defaultMsg: Record<string, string> = {
      pt: 'Olá! Gostaria de falar com o suporte da CDM STORES.',
      en: 'Hello! I would like to speak with CDM STORES support.',
      es: '¡Hola! Me gustaría hablar con el soporte de CDM STORES.',
    };
    const link = waLink(defaultMsg[ctx.session.language] ?? defaultMsg.pt);
    const msgs: Record<string, string> = {
      pt: `💬 **Fale Conosco no WhatsApp**\n\n[Clique aqui para conversar](${link})\n\n☎️ Também disponível por email: support@cdmstores.com`,
      en: `💬 **Chat on WhatsApp**\n\n[Click here to talk](${link})\n\n☎️ Also available by email: support@cdmstores.com`,
      es: `💬 **Chatea en WhatsApp**\n\n[Haz clic aquí](${link})\n\n☎️ También disponible por email: support@cdmstores.com`,
    };
    return this.ok(
      this.id,
      {
        response: msgs[ctx.session.language] ?? msgs.pt,
        action: 'whatsapp_link',
        actionPayload: { link },
        confidence: 98,
      },
      t,
    );
  }
}

// ─── Agent 24 — NotificationAgent ────────────────────────────────────────────
export class NotificationAgent extends BaseAgent {
  readonly id = '24-notification';
  readonly name = 'NotificationAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const msgs: Record<string, string> = {
      pt: `🔔 **Notificações ativadas!**\n\nVocê receberá alertas sobre:\n✅ Promoções e cupons\n✅ Status dos seus pedidos\n✅ Novos produtos`,
      en: `🔔 **Notifications enabled!**\n\nYou'll receive alerts for:\n✅ Promotions and coupons\n✅ Order status updates\n✅ New products`,
      es: `🔔 **¡Notificaciones activadas!**\n\nRecibirás alertas sobre:\n✅ Promociones y cupones\n✅ Estado de tus pedidos\n✅ Nuevos productos`,
    };
    return this.ok(
      this.id,
      {
        response: msgs[ctx.session.language] ?? msgs.pt,
        action: 'enable_notifications',
        confidence: 98,
      },
      t,
    );
  }
}

// ─── Agent 26 — PaymentAgent ──────────────────────────────────────────────────
export class PaymentAgent extends BaseAgent {
  readonly id = '26-payment';
  readonly name = 'PaymentAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const msgs: Record<string, string> = {
      pt: `💳 **Formas de Pagamento**\n\n• Cartão de crédito/débito (Stripe)\n• Parcelamento em até 12x\n• PIX com 5% de desconto\n• Boleto bancário\n\n🔒 Pagamento 100% seguro · SSL 256-bit · PCI-DSS`,
      en: `💳 **Payment Methods**\n\n• Credit/debit card (Stripe)\n• Up to 12 installments\n• PIX with 5% discount\n• Bank slip\n\n🔒 100% secure payment · SSL 256-bit · PCI-DSS`,
      es: `💳 **Métodos de Pago**\n\n• Tarjeta crédito/débito (Stripe)\n• Hasta 12 cuotas\n• PIX con 5% descuento\n• Boleto bancario\n\n🔒 Pago 100% seguro · SSL 256-bit · PCI-DSS`,
    };
    return this.ok(this.id, { response: msgs[ctx.session.language] ?? msgs.pt, confidence: 95 }, t);
  }
}

// ─── Agent 41 — FallbackAgent ─────────────────────────────────────────────────
export class FallbackAgent extends BaseAgent {
  readonly id = '41-fallback';
  readonly name = 'FallbackAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const msgs: Record<string, string> = {
      pt: `😊 Desculpe, não entendi bem.\n\n📝 Posso ajudar com:\n• 🛍️ Produtos e preços\n• 📦 Rastrear pedido\n• 🎟️ Cupons de desconto\n• 💳 Formas de pagamento\n• 📅 Agendar atendimento\n• 💬 Falar no WhatsApp`,
      en: `😊 Sorry, I didn't quite understand.\n\n📝 I can help with:\n• 🛍️ Products and pricing\n• 📦 Order tracking\n• 🎟️ Discount coupons\n• 💳 Payment methods\n• 📅 Book support\n• 💬 Chat on WhatsApp`,
      es: `😊 Disculpa, no entendí bien.\n\n📝 Puedo ayudarte con:\n• 🛍️ Productos y precios\n• 📦 Rastrear pedido\n• 🎟️ Cupones de descuento\n• 💳 Métodos de pago\n• 📅 Agendar atención\n• 💬 Hablar en WhatsApp`,
    };
    return this.ok(this.id, { response: msgs[ctx.session.language] ?? msgs.pt, confidence: 60 }, t);
  }
}

// ─── Agent 42 — EscalationAgent ───────────────────────────────────────────────
export class EscalationAgent extends BaseAgent {
  readonly id = '42-escalation';
  readonly name = 'EscalationAgent';

  async run(ctx: AgentContext): Promise<AgentResult> {
    const t = this.start();
    const link = waLink(
      ctx.session.language === 'pt'
        ? 'Preciso de ajuda urgente com meu pedido.'
        : ctx.session.language === 'en'
          ? 'I need urgent help with my order.'
          : 'Necesito ayuda urgente con mi pedido.',
    );
    const msgs: Record<string, string> = {
      pt: `Desculpe! 😞 Vejo que está tendo dificuldades.\n\n🤝 **Vamos conectá-lo a suporte humano:**\n📱 [Chamar no WhatsApp](${link})\n📧 support@cdmstores.com\n\nNossa equipe responde em até 2h úteis.`,
      en: `I'm sorry! 😞 I can see you're having trouble.\n\n🤝 **Let's connect you to human support:**\n📱 [Chat on WhatsApp](${link})\n📧 support@cdmstores.com\n\nOur team responds within 2 business hours.`,
      es: `¡Lo siento! 😞 Veo que estás teniendo dificultades.\n\n🤝 **Te conectamos con soporte humano:**\n📱 [Chatear en WhatsApp](${link})\n📧 support@cdmstores.com\n\nNuestro equipo responde en 2 horas hábiles.`,
    };
    return this.ok(
      this.id,
      {
        response: msgs[ctx.session.language] ?? msgs.pt,
        action: 'escalate_to_human',
        actionPayload: { link },
        confidence: 99,
      },
      t,
    );
  }
}

export const cartAgent = new CartAgent();
export const orderAgent = new OrderAgent();
export const trackingAgent = new TrackingAgent();
export const couponAgent = new CouponAgent();
export const productAgent = new ProductAgent();
export const schedulingAgent = new SchedulingAgent();
export const whatsAppAgent = new WhatsAppAgent();
export const notificationAgent = new NotificationAgent();
export const paymentAgent = new PaymentAgent();
export const fallbackAgent = new FallbackAgent();
export const escalationAgent = new EscalationAgent();
