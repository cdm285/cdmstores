# 🔐 COMO ADICIONAR SECRETS AO CLOUDFLARE

As chaves sensíveis (API keys, secrets) devem ser armazenadas de forma segura no Cloudflare.

## 📋 Chaves a adicionar:

```
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
CJ_API_KEY=your_cj_api_key_here
```

## ⚙️ Adicionar via Cloudflare Dashboard (RECOMENDADO):

1. Acesse: https://dash.cloudflare.com/
2. Vá para: **Workers** → **cdmstores-backend** → **Settings**
3. Em **"Encryption"**, clique em **"Add variable"** para cada chave:

### Para cada secret:
```
Name (Secret name): STRIPE_SECRET_KEY
Value: your_stripe_secret_key_here
Visibility: Secret
```

Repita para:
- STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- CJ_API_KEY

## ⌨️ Ou adicionar via CLI (Wrangler):

```bash
cd worker

# Stripe Secret Key
npx wrangler secret put STRIPE_SECRET_KEY

# Stripe Webhook Secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# CJ API Key
npx wrangler secret put CJ_API_KEY

# Stripe Publishable Key (não precisa ser secret, mas recomendo)
npx wrangler secret put STRIPE_PUBLISHABLE_KEY
```

Quando pedir "Enter a secret value:", copie e cole o valor correspondente.

## ✅ Validar que foi adicionado:

```bash
npx wrangler secret list
```

Deve listar as 4 chaves adicionadas.

## 🧪 Testar:

Após adicionar, faça um novo deploy:

```bash
npm run deploy
```

Backend deve estar pronto para processar pagamentos! 🚀

---

**Status**: Chaves armazenadas localmente em `.env.production`
**Próximo passo**: Adicionar via Dashboard do Cloudflare
