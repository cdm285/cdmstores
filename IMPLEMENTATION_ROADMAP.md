# 🚀 ROADMAP COMPLETO - CDM STORES + STRIPE + CJ

## ✅ O que já foi criado

### Backend (Cloudflare Workers)
- ✅ Estrutura do projeto Workers
- ✅ 6 routers principais (produtos, carrinho, pedidos, stripe, cj, rastreio)
- ✅ Database D1 com todas as tabelas
- ✅ Migrations SQL iniciais
- ✅ Arquivo de integração frontend-backend `.js`

### Frontend
- ✅ Site estático (HTML/CSS/JS)
- ✅ Páginas: Home, Mobile, Checkout, Rastreio
- ✅ Multilíngue (PT-BR, EN, ES)
- ✅ Responsivo

---

## 🔑 PRÓXIMAS ETAPAS IMEDIATAS

### ETAPA 1: Configurar Backend (30-45 min)

#### 1.1 No terminal, instalar dependências
```bash
cd worker
npm install
```

#### 1.2 Criar banco D1
```bash
wrangler d1 create cdmstores
```
⚠️ **IMPORTANTE**: Copiar o `database_id` que vai aparecer

#### 1.3 Adicionar database_id ao `wrangler.toml`
```toml
[[d1_databases]]
binding = "DB"
database_name = "cdmstores"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← Cole aqui
```

#### 1.4 Executar migrations do banco
```bash
# Criar tabelas
wrangler d1 execute cdmstores --file=./migrations/001_init.sql --local

# Adicionar produtos de exemplo
wrangler d1 execute cdmstores --file=./migrations/002_seed.sql --local
```

#### 1.5 Adicionar secrets (Stripe + CJ)
```bash
# Stripe
wrangler secret put STRIPE_SECRET_KEY
# Cole: sk_test_XXXXXXXXXXXXXXX

wrangler secret put STRIPE_WEBHOOK_SECRET
# Cole: whsec_XXXXXXXXXXXXXXX

# CJdropshipping
wrangler secret put CJ_API_KEY
# Cole sua chave

wrangler secret put CJ_API_SECRET
# Cole seu secret
```

#### 1.6 Testar localmente
```bash
npm run dev
```

Abrir: `http://localhost:8787/api/health`

Se aparecer `{"status":"ok"}` ✅ Backend funcionando!

---

### ETAPA 2: Integrar Backend com Frontend (45-60 min)

#### 2.1 Adicionar script de integração ao HTML

No seu `index.html`, antes do `</body>`, adicionar:
```html
<script src="./worker/src/frontend-integration.js"></script>
```

#### 2.2 Atualizar endpoints no HTML
Procurar por botões de "Comprar" e adicionar:
```html
<button class="buy-btn" data-product-id="1" onclick="addToCart(1)">
  Comprar
</button>
```

#### 2.3 Atualizar página de checkout
No `pages/checkout.html`, adicionar:
```html
<script>
  // Botão de pagamento
  document.getElementById('pay-btn').addEventListener('click', async () => {
    const orderId = await createOrder({
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      address: document.getElementById('address').value,
      shipping_cost: 25.00
    });
    
    if (orderId) {
      // Redirecionar para Stripe (implementar depois)
      clearCart();
    }
  });
</script>
```

#### 2.4 Atualizar página de rastreio
No `pages/rastreio.html`, adicionar:
```html
<script>
  document.getElementById('track-btn').addEventListener('click', async () => {
    const code = document.getElementById('tracking-code').value;
    const tracking = await trackOrder(code);
    
    if (tracking) {
      document.getElementById('result').innerHTML = `
        <p>Status: ${tracking.status}</p>
        <p>Código: ${tracking.tracking_code}</p>
        <p>Atualizado: ${tracking.updated_at}</p>
      `;
    } else {
      alert('Código não encontrado!');
    }
  });
</script>
```

---

### ETAPA 3: Deploy para Produção (15-30 min)

#### 3.1 Deploy do Backend
```bash
cd worker
npm run deploy
```

Backend disponível em: `https://cdmstores-backend.cdmstores.workers.dev`

#### 3.2 Executar migrations remotas
```bash
wrangler d1 execute cdmstores --file=./migrations/001_init.sql --remote
wrangler d1 execute cdmstores --file=./migrations/002_seed.sql --remote
```

#### 3.3 Adicionar custom domain (opcional)
Se quiser que fique em `api.cdmstores.com`:
1. Ir em Cloudflare Dashboard
2. Workers > cdmstores-backend
3. Settings > Custom Domain
4. Adicionar: `api.cdmstores.com`

#### 3.4 Atualizar API_URL no frontend
Em `worker/src/frontend-integration.js`, mudar:
```javascript
const API_URL = 'https://api.cdmstores.com'; // Seu domínio ou workers default
```

#### 3.5 Deploy do frontend (Pages)
```bash
# Se estiver usando Pages
npm run deploy
# ou via Git (automático)
```

---

### ETAPA 4: Configurar Webhooks (20-30 min)

#### 4.1 Stripe Webhook
1. Ir em: https://dashboard.stripe.com/webhooks
2. Criar novo webhook: `https://api.cdmstores.com/api/stripe/webhook`
3. Eventos: `checkout.session.completed`
4. Copiar **Signing Secret**
5. Executar: `wrangler secret put STRIPE_WEBHOOK_SECRET`

#### 4.2 CJdropshipping Webhook
1. Ir em: CJ Dashboard > API Settings
2. Webhook URL: `https://api.cdmstores.com/api/cj/webhook`
3. Eventos: `order.status_updated`, `order.tracking_updated`
4. Testar webhook

---

### ETAPA 5: Testes E2E (30-45 min)

#### 5.1 Testar carrinho
- [ ] Adicionar produto ao carrinho
- [ ] Ver contador de itens
- [ ] Remover produto
- [ ] Limpar carrinho

#### 5.2 Testar checkout
- [ ] Criar pedido
- [ ] Ver ID do pedido
- [ ] Redirecionar para Stripe
- [ ] Pagar no Stripe (test mode)

#### 5.3 Testar webhook Stripe
- [ ] Após pagamento, verificar se pedido virou "paid"
- [ ] Verificar se foi criado no CJ
- [ ] Logs no Cloudflare

#### 5.4 Testar rastreio
- [ ] Rastrear pedido por código
- [ ] Ver status em tempo real

---

## 📋 CHECKLIST COMPLETO

### Prerequisitos
- [ ] Node.js 18+ instalado
- [ ] Cloudflare Account com Workers ativado
- [ ] Terminal/PowerShell aberto na pasta `cdmstores`
- [ ] Chaves prontas: Stripe (secret + webhook) + CJ (key + secret)

### Configuração Local
- [ ] `npm install` na pasta worker
- [ ] `wrangler d1 create cdmstores` e copiar database_id
- [ ] Adicionar database_id ao `wrangler.toml`
- [ ] Executar migrations locais (001 + 002)
- [ ] Adicionar secrets Stripe + CJ
- [ ] `npm run dev` e testar /api/health
- [ ] Todos endpoints respondendo OK

### Integração Frontend
- [ ] Script `frontend-integration.js` carregado
- [ ] Botões "Comprar" funcionando
- [ ] Carrinho salvando em localStorage
- [ ] Página checkout conectada ao backend
- [ ] Página rastreio funcionando

### Deploy Produção
- [ ] `npm run deploy` (Workers)
- [ ] Migrations rodadas remotas (--remote)
- [ ] Custom domain `api.cdmstores.com` (opcional)
- [ ] API_URL atualizada no frontend
- [ ] Frontend deployed

### Webhooks
- [ ] Stripe webhook configurado e testado
- [ ] CJ webhook configurado e testado
- [ ] Ambos recebi payload de teste com sucesso

### Testes E2E
- [ ] Fluxo completo de compra funciona
- [ ] Pedido cria no CJ automaticamente
- [ ] Tracking aparece após sincronização
- [ ] Tudo em produção

---

## ⏱️ TIMELINE TOTAL

| Etapa | Tempo | Status |
|-------|-------|--------|
| Backend Setup | 45 min | Em progresso |
| Frontend Integration | 60 min | Próximo |
| Deploy Produção | 30 min | Depois |
| Webhooks | 30 min | Depois |
| Testes E2E | 45 min | Depois |
| **TOTAL** | **3 horas 30 min** | **Tempo real** |

---

## 🆘 DÚVIDAS FREQUENTES

**P: Por onde começo?**
R: Siga a ETAPA 1 (Backend Setup)

**P: Preciso ter o site online já?**
R: Não, pode testar localmente primeiro. Depois deploy no Pages.

**P: E se der erro nas migrations?**
R: Execute novamente com `--remote` ou verifique permissões no Cloudflare.

**P: Como vejo os logs?**
R: `wrangler tail` (streaming real-time dos logs)

**P: Posso mudar os preços?**
R: Sim, execute migrations novamente ou edite direto no D1.

---

**Cristiano, você quer que eu execute tudo isso AGORA ou quer fazer passo-a-passo?** 

Se quiser, posso:
1. Fazer tudo de um vez, ou
2. Fazer a ETAPA 1 (Backend) agora, e vamos testando

O que preferir? 🚀
