/**
 * Agent 11 — Product Lookup (Tier 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Looks up product information and returns a formatted response.
 * Data source: in-memory catalog (fast) with D1 fallback for custom products.
 *
 * Intent handles: product_query, cart_action, payment
 */

import { addTrace, ExtendedAgentContext }             from '../core/agent-context.js';
import type { ActionRequest, ActionResult }           from '../core/action-schema.js';
import { failedResult }                               from '../core/action-schema.js';
import type { AgentEnv }                              from '../core/types.js';

// ─── Static catalog (mirrors actions.ts PRODUCTS) ────────────────────────────
const PRODUCTS: Array<{ id: number; name: string; price: number; stock: number; sku: string }> = [
  { id: 1, name: 'Fone Bluetooth',       price:  89.90, stock:  50, sku: 'CDM-FONE-BT' },
  { id: 2, name: 'Carregador USB-C 65W', price:  49.90, stock: 100, sku: 'CDM-CHRG-65W' },
  { id: 3, name: 'Cabo Lightning 2m',    price:  29.90, stock:   0, sku: 'CDM-CABLE-LT2' },
  { id: 4, name: 'Caixa de Som Portátil',price: 149.90, stock:   5, sku: 'CDM-SPK-PRT' },
];

const SHIPPING_RATE = 15.00;

// ─── Response templates ───────────────────────────────────────────────────────
function stockLabel(stock: number, lang: string): string {
  if (lang === 'en') return stock > 0 ? `✅ In stock (${stock} units)` : '❌ Out of stock';
  if (lang === 'es') return stock > 0 ? `✅ En stock (${stock} unidades)` : '❌ Agotado';
  return stock > 0 ? `✅ Em estoque (${stock} unidades)` : '❌ Esgotado';
}

function singleProductResponse(p: typeof PRODUCTS[number], lang: string): string {
  const buy = { pt: 'Adicionar ao Carrinho', en: 'Add to Cart', es: 'Agregar al Carrito' }[lang] ?? 'Adicionar ao Carrinho';
  const sl  = stockLabel(p.stock, lang);
  if (lang === 'en') return `🛍️ **${p.name}**\nPrice: R$ ${p.price.toFixed(2)} (+ R$ ${SHIPPING_RATE.toFixed(2)} shipping)\n${sl}\n\n_"${buy}"_ to purchase!`;
  if (lang === 'es') return `🛍️ **${p.name}**\nPrecio: R$ ${p.price.toFixed(2)} (+ R$ ${SHIPPING_RATE.toFixed(2)} envío)\n${sl}\n\n_"${buy}"_ para comprar!`;
  return `🛍️ **${p.name}**\nPreço: R$ ${p.price.toFixed(2)} (+ frete R$ ${SHIPPING_RATE.toFixed(2)})\n${sl}\n\nDigite _"${buy}"_ para comprar!`;
}

function catalogResponse(lang: string): string {
  const lines = PRODUCTS.map(p => {
    const s = p.stock === 0 ? (lang === 'en' ? '(out of stock)' : lang === 'es' ? '(agotado)' : '(esgotado)') : '';
    return `• **${p.name}** – R$ ${p.price.toFixed(2)} ${s}`.trim();
  });
  if (lang === 'en') return `🛍️ **Our Products:**\n\n${lines.join('\n')}\n\nShipping: R$ ${SHIPPING_RATE.toFixed(2)} · Delivery in 3–7 business days`;
  if (lang === 'es') return `🛍️ **Nuestros Productos:**\n\n${lines.join('\n')}\n\nEnvío: R$ ${SHIPPING_RATE.toFixed(2)} · Entrega en 3–7 días hábiles`;
  return `🛍️ **Nossos Produtos:**\n\n${lines.join('\n')}\n\nFrete: R$ ${SHIPPING_RATE.toFixed(2)} · Entrega em 3–7 dias úteis`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export class Agent11ProductLookup {
  readonly id   = '11-product-lookup';
  readonly name = 'ProductLookupAgent';
  readonly tier = 4;

  async execute(ctx: ExtendedAgentContext, req: ActionRequest): Promise<ActionResult> {
    const start = Date.now();

    if (req.payload.type !== 'product_lookup') {
      return failedResult(req, 'Wrong payload type for ProductLookup');
    }

    const { product_id, query, full_catalog } = req.payload.params;
    const lang = req.language ?? 'pt';

    try {
      // 1. Lookup by id
      if (product_id) {
        const p = PRODUCTS.find(x => x.id === product_id);
        if (!p) {
          // Try D1 for custom products
          const env = ctx.env as AgentEnv;
          if (env.DB) {
            const row = await env.DB.prepare('SELECT id, name, price, stock FROM products WHERE id = ? LIMIT 1').bind(product_id).first<{ id: number; name: string; price: number; stock: number }>();
            if (row) {
              const response = singleProductResponse({ ...row, sku: '' }, lang);
              const result: ActionResult = { id: req.id, actionType: 'product_lookup', success: true, response, data: row, action: 'show_product', actionPayload: { product_id: row.id, product_name: row.name, product_price: row.price }, latencyMs: Date.now() - start, ts: Date.now() };
              addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
              return result;
            }
          }
          const notFound = { pt: `❌ Produto #${product_id} não encontrado.`, en: `❌ Product #${product_id} not found.`, es: `❌ Producto #${product_id} no encontrado.` };
          return { id: req.id, actionType: 'product_lookup', success: false, response: notFound[lang] ?? notFound.pt, error: 'not_found', latencyMs: Date.now() - start, ts: Date.now() };
        }

        const response = singleProductResponse(p, lang);
        const result: ActionResult = { id: req.id, actionType: 'product_lookup', success: true, response, data: p, action: p.stock > 0 ? 'add_to_cart' : 'notify_stock', actionPayload: { product_id: p.id, product_name: p.name, product_price: p.price }, latencyMs: Date.now() - start, ts: Date.now() };
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
        return result;
      }

      // 2. Fuzzy search by query
      if (query) {
        const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const matches = PRODUCTS.filter(p =>
          p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
          p.sku.toLowerCase().includes(q),
        );

        if (matches.length === 1) {
          const response = singleProductResponse(matches[0], lang);
          const result: ActionResult = { id: req.id, actionType: 'product_lookup', success: true, response, data: matches[0], action: 'show_product', actionPayload: { product_id: matches[0].id, product_name: matches[0].name, product_price: matches[0].price }, latencyMs: Date.now() - start, ts: Date.now() };
          addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
          return result;
        }

        if (matches.length > 1) {
          const response = catalogResponse(lang);
          const result: ActionResult = { id: req.id, actionType: 'product_lookup', success: true, response, data: matches, latencyMs: Date.now() - start, ts: Date.now() };
          addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
          return result;
        }
      }

      // 3. Full catalog
      if (full_catalog || (!product_id && !query)) {
        const response = catalogResponse(lang);
        const result: ActionResult = { id: req.id, actionType: 'product_lookup', success: true, response, data: PRODUCTS, latencyMs: Date.now() - start, ts: Date.now() };
        addTrace(ctx, { agentId: this.id, agentName: this.name, success: true, latencyMs: result.latencyMs });
        return result;
      }

      const nf = { pt: '❌ Produto não encontrado.', en: '❌ Product not found.', es: '❌ Producto no encontrado.' };
      return { id: req.id, actionType: 'product_lookup', success: false, response: nf[lang] ?? nf.pt, error: 'not_found', latencyMs: Date.now() - start, ts: Date.now() };

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      addTrace(ctx, { agentId: this.id, agentName: this.name, success: false, latencyMs: Date.now() - start, error });
      return failedResult(req, error, Date.now() - start);
    }
  }
}

export const agent11ProductLookup = new Agent11ProductLookup();
export default agent11ProductLookup;
