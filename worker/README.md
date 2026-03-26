# CDM STORES - Backend Cloudflare Workers + D1

Backend completo para sua loja com Stripe + CJdropshipping

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- Conta Cloudflare com Workers ativado
- Chaves de API: Stripe + CJdropshipping

### 1. Instalar dependências
```bash
cd worker
npm install
```

### 2. Configurar banco D1

#### Opção A: Criar novo banco (primeira vez)
```bash
wrangler d1 create cdmstores
```

Copiar o `database_id` retornado e adicionar ao `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "cdmstores"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### Opção B: Usar banco existente
Se você já criou D1, apenas adicione o `database_id` ao `wrangler.toml`

### 3. Executar migrations do banco

#### Local (desenvolvimento)
```bash
wrangler d1 execute cdmstores --file=./migrations/001_init.sql --local
wrangler d1 execute cdmstores --file=./migrations/002_seed.sql --local
```

#### Remoto (produção)
```bash
wrangler d1 execute cdmstores --file=./migrations/001_init.sql --remote
wrangler d1 execute cdmstores --file=./migrations/002_seed.sql --remote
```

### 4. Configurar variáveis de ambiente

Adicionar Stripe e CJ secrets:
```bash
wrangler secret put STRIPE_SECRET_KEY
# Cole sua chave secreta do Stripe

wrangler secret put STRIPE_WEBHOOK_SECRET
# Cole o secret do webhook do Stripe

wrangler secret put CJ_API_KEY
# Cole sua chave de API do CJdropshipping

wrangler secret put CJ_API_SECRET
# Cole seu secret do CJdropshipping
```

### 5. Executar localmente (desenvolvimento)
```bash
npm run dev
```

Seu backend estará disponível em: `http://localhost:8787`

**Testar endpoints:**
```bash
# Health check
curl http://localhost:8787/api/health

# Listar produtos
curl http://localhost:8787/api/products

# Obter um produto
curl http://localhost:8787/api/products/1
```

### 6. Deploy para produção
```bash
npm run deploy
```

Seu backend estará disponível em: `https://cdmstores-backend.cdmstores.workers.dev`

---

## 📡 Endpoints

### Produtos
- `GET /api/products` - Listar todos
- `GET /api/products/:id` - Obter um
- `POST /api/products` - Criar novo (admin)

### Carrinho
- `POST /api/cart/add` - Adicionar item
- `DELETE /api/cart/remove` - Remover item
- `GET /api/cart/calculate-shipping` - Calcular frete

### Pedidos
- `GET /api/orders/:id` - Obter pedido
- `GET /api/orders/customer/:email` - Listar pedidos do cliente
- `POST /api/orders` - Criar novo pedido

### Stripe
- `POST /api/stripe/create-payment` - Criar sessão de pagamento
- `POST /api/stripe/webhook` - Webhook de pagamento

### CJdropshipping
- `POST /api/cj/create-order` - Criar pedido no CJ
- `GET /api/cj/tracking/:cjOrderId` - Rastrear pedido
- `POST /api/cj/webhook` - Webhook de atualizações do CJ

### Rastreio
- `GET /api/tracking/:code` - Rastrear por código
- `GET /api/tracking/status/:orderId` - Status do pedido

---

## 🔄 Fluxo de Pedido

1. Cliente adiciona produto ao carrinho (frontend)
2. Cliente vai para checkout, preenche dados
3. Frontend chama `POST /api/orders` → Cria pedido com status `pending`
4. Frontend redireciona para `POST /api/stripe/create-payment` → Stripe Checkout URL
5. Cliente paga no Stripe
6. Stripe envia webhook → `POST /api/stripe/webhook`
7. Backend atualiza pedido para status `paid` e chama `POST /api/cj/create-order`
8. CJ confirma e envia `order_id` + `tracking_code`
9. Backend recebe webhook do CJ → `POST /api/cj/webhook`
10. Pedido atualizado com tracking
11. Cliente vê rastreio em `/pages/rastreio.html`

---

## 🔒 Segurança

- ✅ CORS configurado apenas para `cdmstores.com`
- ✅ Webhooks validados por assinatura (Stripe + CJ)
- ✅ Secrets armazenados de forma segura
- ✅ Validação de entrada em todos endpoints
- ✅ Rate limiting recomendado (adicionar depois)

---

## 📊 Banco de Dados (D1)

Estrutura:
- `products` - Catálogo de produtos
- `orders` - Histórico de pedidos
- `order_items` - Itens de cada pedido
- `customers` - Dados de clientes
- `cj_logs` - Logs da API CJ
- `webhooks` - Histórico de webhooks

Ver `migrations/001_init.sql` para schema completo.

---

## 🛠️ Troubleshooting

### Erro: "D1 binding not found"
Adicionar `[[d1_databases]]` ao `wrangler.toml` com seu `database_id`

### Erro: "CORS error"
Verificar que o domínio está correto em `wrangler.toml`:
```toml
[[routes]]
pattern = "cdmstores.com/api/*"
zone_name = "cdmstores.com"
```

### Stripe webhook não funciona
1. Obter signing secret do Cloudflare
2. Executar `wrangler secret put STRIPE_WEBHOOK_SECRET`
3. Adicionar webhook URL ao Dashboard do Stripe: `https://api.cdmstores.com/api/stripe/webhook`

---

## 📝 Próximos passos

- [ ] Admin panel para gerenciar produtos
- [ ] Autenticação para admin
- [ ] Sistema de cupons/promoções
- [ ] Email transacional (Mailgun/SendGrid)
- [ ] Analytics com Cloudflare Analytics
- [ ] Cache com Cloudflare KV
- [ ] CI/CD com GitHub Actions

---

**Cristiano**, se tiver dúvidas, é só chamar! 🚀
