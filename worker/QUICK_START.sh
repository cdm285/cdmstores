#!/bin/bash
# CDM STORES - QUICK START SCRIPT
# Execute esses comandos um por um


echo "===================================="
echo "CDM STORES - BACKEND SETUP"
echo "===================================="
echo ""

# Passo 1: Entrar na pasta worker
echo "📂 Entrando na pasta worker..."
cd worker

# Passo 2: Instalar dependências
echo "📦 Instalando dependências..."
npm install

echo ""
echo "===================================="
echo "PRÓXIMAS ETAPAS (execute no terminal):"
echo "===================================="
echo ""

echo "1️⃣  CRIAR BANCO D1:"
echo "   wrangler d1 create cdmstores"
echo "   ⚠️  Copie o database_id que vai aparecer"
echo ""

echo "2️⃣  EDITAR wrangler.toml:"
echo "   Cole o database_id em [[d1_databases]]"
echo ""

echo "3️⃣  CRIAR TABELAS:"
echo "   wrangler d1 execute cdmstores --file=./migrations/001_init.sql --local"
echo ""

echo "4️⃣  INSERIR DADOS DE EXEMPLO:"
echo "   wrangler d1 execute cdmstores --file=./migrations/002_seed.sql --local"
echo ""

echo "5️⃣  ADICIONAR SECRETS:"
echo "   wrangler secret put STRIPE_SECRET_KEY"
echo "   wrangler secret put STRIPE_WEBHOOK_SECRET"
echo "   wrangler secret put CJ_API_KEY"
echo "   wrangler secret put CJ_API_SECRET"
echo ""

echo "6️⃣  TESTAR LOCALMENTE:"
echo "   npm run dev"
echo "   Abra: http://localhost:8787/api/health"
echo ""

echo "7️⃣  FAZER DEPLOY:"
echo "   npm run deploy"
echo ""

echo "===================================="
echo "✅ Tudo pronto! Siga os passos acima"
echo "===================================="
