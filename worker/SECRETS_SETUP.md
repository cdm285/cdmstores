# 🔐 Configuração de Secrets — CDM Stores

## Resumo

O deploy automático (GitHub Actions → Cloudflare) precisa de dois tipos de credenciais:

| Tipo | Onde configurar |
|---|---|
| Credenciais do Cloudflare (auth do deploy) | GitHub → Settings → Secrets |
| Secrets da aplicação (runtime do Worker) | GitHub → Settings → Secrets (o workflow os empurra via `wrangler secret put`) |

---

## 1. Criar o API Token do Cloudflare

1. Acesse **https://dash.cloudflare.com/profile/api-tokens**
2. Clique em **"Create Token"**
3. Use o template **"Edit Cloudflare Workers"** (ou crie custom com as permissões abaixo):
   - `Account › Workers Scripts › Edit`
   - `Account › Workers Routes › Edit`
   - `Zone › Workers Routes › Edit` (para o domínio cdmstores.com)
   - `Account › Cloudflare Pages › Edit`
   - `Account › D1 › Edit`
4. Salve o token gerado — ele aparece **uma única vez**

---

## 2. GitHub Actions Secrets obrigatórios

Acesse: **GitHub → cdm285/cdmstores → Settings → Secrets and variables → Actions → New repository secret**

### 🔑 Credenciais Cloudflare (para o deploy funcionar)

| Secret name | Como obter |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token criado no passo 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → ícone da conta → Account ID (sidebar direita) |

### 🔑 Secrets da aplicação (empurrados para o Worker a cada deploy)

| Secret name | Como gerar / onde obter |
|---|---|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ADMIN_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Signing secret (`whsec_...`) |
| `RESEND_API_KEY` | https://resend.com/api-keys (`re_...`) |
| `CJ_API_KEY` | CJdropshipping → Account → API |
| `CJ_API_SECRET` | CJdropshipping → Account → API |

> **Secrets opcionais** (OAuth — adicione se precisar de login social):
> `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

---

## 3. Como funciona o deploy automático

```
git push para main
       │
       ▼
GitHub Actions (.github/workflows/deploy.yml)
       │
       ├─ Job: deploy-worker
       │    ├── npm ci
       │    ├── wrangler secret put JWT_SECRET        ← secrets do GitHub
       │    ├── wrangler secret put ADMIN_KEY
       │    ├── wrangler secret put STRIPE_SECRET_KEY
       │    ├── wrangler secret put STRIPE_WEBHOOK_SECRET
       │    ├── wrangler secret put RESEND_API_KEY
       │    ├── wrangler secret put CJ_API_KEY
       │    ├── wrangler secret put CJ_API_SECRET
       │    └── wrangler deploy --env production      ← deploy do código
       │
       └─ Job: deploy-pages
            └── cloudflare/pages-action               ← frontend estático
```

---

## 4. Validar após o deploy

```bash
# Listar secrets ativos no Worker
npx wrangler secret list --env production

# Testar o endpoint de saúde
curl https://cdmstores.com/api/health
```

---

## 5. Deploy manual (emergência)

```bash
cd worker

# Setar secrets manualmente
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CJ_API_KEY
npx wrangler secret put CJ_API_SECRET

# Deploy
npx wrangler deploy --env production
```

