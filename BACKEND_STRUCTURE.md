# 📋 ESTRUTURA CRIADA - CDM STORES BACKEND

## 📂 Estrutura de Pastas

```
cdmstores/
├── index.html                      (Frontend - Home)
├── mobile.html                     (Frontend - Mobile)
├── css/
│   ├── global.css
│   ├── desktop.css
│   └── mobile.css
├── js/
│   └── script.js
├── pages/
│   ├── checkout.html              (Checkout - Frontend)
│   └── rastreio.html              (Rastreio - Frontend)
├── assets/
│   ├── logo.png
│   └── bandeiras...

└── worker/                         ⭐ NOVO BACKEND
    ├── package.json               ← Dependências
    ├── tsconfig.json              ← Configuração TypeScript
    ├── wrangler.toml              ← Configuração Cloudflare Workers
    ├── .env.example               ← Variáveis de ambiente
    ├── README.md                  ← Documentação
    │
    ├── src/
    │   ├── index.ts               ← Entry point do Worker
    │   ├── frontend-integration.js ← Biblioteca para frontend
    │   │
    │   └── routes/                ← Rotas da API
    │       ├── products.ts        (GET, POST produtos)
    │       ├── cart.ts            (ADD, REMOVE, CALC FRETE)
    │       ├── orders.ts          (GET, POST pedidos)
    │       ├── stripe.ts          (PAGAMENTO + WEBHOOK)
    │       ├── cj.ts              (CRIAR PEDIDO CJ + WEBHOOK)
    │       └── tracking.ts        (RASTREIO)
    │
    └── migrations/                ← Scripts SQL do banco D1
        ├── 001_init.sql           (Criar tabelas)
        └── 002_seed.sql           (Inserir dados de exemplo)
```

---

## 🗄️ Banco de Dados D1

### Tabelas Criadas

```sql
1. products
   ├── id (INT, PK)
   ├── name (TEXT)
   ├── description (TEXT)
   ├── price (REAL)
   ├── image_url (TEXT)
   ├── stock (INT)
   ├── active (INT)
   ├── created_at (DATETIME)
   └── updated_at (DATETIME)

2. orders
   ├── id (INT, PK)
   ├── customer_name (TEXT)
   ├── customer_email (TEXT)
   ├── total (REAL)
   ├── shipping_cost (REAL)
   ├── status (TEXT) → 'pending', 'paid', 'processing', 'shipped', 'delivered'
   ├── stripe_payment_id (TEXT)
   ├── cj_order_id (TEXT)
   ├── tracking_code (TEXT)
   ├── created_at (DATETIME)
   └── updated_at (DATETIME)

3. order_items
   ├── id (INT, PK)
   ├── order_id (INT, FK)
   ├── product_id (INT, FK)
   ├── quantity (INT)
   ├── price (REAL)
   └── created_at (DATETIME)

4. customers
   ├── id (INT, PK)
   ├── email (TEXT, UNIQUE)
   ├── name (TEXT)
   ├── phone (TEXT)
   ├── address (TEXT)
   ├── city (TEXT)
   ├── state (TEXT)
   ├── zip (TEXT)
   ├── country (TEXT)
   ├── created_at (DATETIME)
   └── updated_at (DATETIME)

5. cj_logs
   ├── id (INT, PK)
   ├── order_id (INT, FK)
   ├── cj_order_id (TEXT)
   ├── action (TEXT)
   ├── response (TEXT)
   └── created_at (DATETIME)

6. webhooks
   ├── id (INT, PK)
   ├── source (TEXT) → 'stripe' ou 'cj'
   ├── webhook_id (TEXT, UNIQUE)
   ├── payload (TEXT)
   ├── processed (INT)
   └── created_at (DATETIME)
```

---

## 🔌 Endpoints da API

### 📦 PRODUTOS
```
GET  /api/products              → Listar todos
GET  /api/products/:id          → Obter um
POST /api/products              → Criar novo (admin)
```

### 🛒 CARRINHO
```
POST   /api/cart/add            → Adicionar ao carrinho
DELETE /api/cart/remove         → Remover do carrinho
GET    /api/cart/calculate-shipping → Calcular frete
```

### 📋 PEDIDOS
```
GET  /api/orders/:id            → Obter pedido por ID
GET  /api/orders/customer/:email → Listar pedidos do cliente
POST /api/orders                → Criar novo pedido
```

### 💳 STRIPE
```
POST /api/stripe/create-payment → Criar sessão de pagamento
POST /api/stripe/webhook        → Webhook de pagamento (automático)
```

### 📦 CJdropshipping
```
POST /api/cj/create-order       → Enviar pedido para CJ
GET  /api/cj/tracking/:cjOrderId → Obter tracking do CJ
POST /api/cj/webhook            → Webhook de atualizações (automático)
```

### 📍 RASTREIO
```
GET /api/tracking/:code         → Rastrear por código
GET /api/tracking/status/:orderId → Ver status do pedido
```

---

## 🔄 Fluxo de Dados

```
┌─────────────────────────────────────────┐
│   CLIENTE ACESSA SEU SITE               │
│   (cdmstores.com)                       │
└────────────────┬────────────────────────┘
                 │
                 ↓
         ┌──────────────────────┐
         │ Frontend carrega     │
         │ frontend-integ.js    │
         └──────────┬───────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Clica "Comprar"        │
         │ addToCart(productId)   │
         └──────────┬─────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Carrinho no localStorage│
         │ (frontend apenas)      │
         └──────────┬─────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Vai para Checkout      │
         │ Review itens           │
         └──────────┬─────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Clica "Pagar"          │
         │ createOrder()          │
         │ ↓ API Call             │
         └──────────┬─────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend: POST /api/orders         │
    │ ├─ Cria registro em DB            │
    │ ├─ Salva itens (order_items)      │
    │ └─ Retorna order_id + total       │
    └───────────────┬───────────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Frontend: redirectToStripeCheckout│
    │ ↓ API Call                        │
    └───────────────┬───────────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend: POST /api/stripe/payment │
    │ ├─ Cria sessão Stripe             │
    │ └─ Retorna payment_url            │
    └───────────────┬───────────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Redireciona para Stripe│
         │ Cliente paga            │
         └──────────┬─────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Stripe envia webhook   │
         │ (automático)           │
         └──────────┬─────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend: POST /api/stripe/webhook │
    │ ├─ Valida assinatura              │
    │ ├─ Atualiza order status → "paid" │
    │ └─ Chama cj/create-order          │
    └───────────────┬───────────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend: POST /api/cj/create-order│
    │ ├─ Faz request à API do CJ        │
    │ ├─ Salva cj_order_id + status     │
    │ └─ Aguarda webhook do CJ          │
    └───────────────┬───────────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ CJ processa pedido     │
         │ Envia webhook depois   │
         └──────────┬─────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend: POST /api/cj/webhook     │
    │ ├─ Recebe status + tracking       │
    │ ├─ Atualiza order no banco        │
    │ └─ status → "processing"/"shipped"│
    └───────────────┬───────────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Cliente acessa rastreio│
         │ digitando código       │
         └──────────┬─────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Frontend faz request   │
         │ GET /api/tracking/CODE │
         └──────────┬─────────────┘
                    │
                    ↓
    ┌───────────────────────────────────┐
    │ Backend busca no D1:              │
    │ SELECT FROM orders WHERE code = ? │
    │ Retorna status + tracking         │
    └───────────────┬───────────────────┘
                    │
                    ↓
         ┌────────────────────────┐
         │ Frontend exibe rastreio│
         │ em tempo real          │
         └────────────────────────┘
```

---

## 🛠️ Tecnologias Utilizadas

### Backend
- **Runtime**: Cloudflare Workers (Serverless)
- **Linguagem**: TypeScript
- **Banco**: Cloudflare D1 (SQLite)
- **Framework**: itty-router (routing leve)
- **Pagamentos**: Stripe SDK
- **Dropshipping**: CJdropshipping API

### Frontend
- **HTML/CSS/JS** (Vanilla)
- **Multilíngue** (PT-BR, EN, ES)
- **Responsivo** (Mobile-first)
- **localStorage** (Carrinho local)

### Deploy
- **Frontend**: Cloudflare Pages
- **Backend**: Cloudflare Workers
- **Banco**: Cloudflare D1
- **Domínio**: cdmstores.com

---

## 🔓 Segurança Implementada

✅ CORS habilitado apenas para cdmstores.com
✅ Validação de entrada em todos endpoints
✅ Webhook signing (Stripe + CJ)
✅ Secrets armazenados de forma segura (wrangler secrets)
✅ SQL Parameterizado (prevents SQL injection)
✅ Database bindings (isolado por ID)

---

## 📊 Próximas Integrações (Roadmap)

- [ ] Admin Panel (gerenciar produtos)
- [ ] Authentication (JWT)
- [ ] Email transacional (Mailgun)
- [ ] Rate limiting (via Cloudflare)
- [ ] Cache (Cloudflare KV)
- [ ] Analytics (Cloudflare Workers Analytics)
- [ ] Cupons/Promoções
- [ ] Sistema de avaliações
- [ ] Chat support (Tawk.to integração)

---

**Estrutura pronta! Próximo passo: Executar ETAPA 1 do README** 🚀
