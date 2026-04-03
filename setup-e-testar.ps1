# ============================================================
# setup-e-testar.ps1
# Instala dependencias e executa validacoes do projeto.
# Execute DEPOIS de instalar Node.js:
#
#   cd d:\cdmstores\worker
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
#   ..\setup-e-testar.ps1
# ============================================================

$ErrorActionPreference = "Stop"
Set-Location "d:\cdmstores\worker"

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "    [ERRO] $msg" -ForegroundColor Red; throw $msg }
function Write-Warn($msg) { Write-Host "    [AVISO] $msg" -ForegroundColor Yellow }

# ── 1. Verificar Node/npm ─────────────────────────────────────
Write-Step "Verificando Node.js e npm..."
try {
    $nv = node --version
    $mv = npm --version
    Write-OK "node $nv"
    Write-OK "npm  v$mv"
} catch {
    Write-Fail "Node.js nao encontrado. Execute instalar-node.bat como Administrador primeiro."
}

# ── 2. Instalar dependencias ──────────────────────────────────
Write-Step "Instalando dependencias do projeto (npm install)..."
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install falhou" }
Write-OK "Dependencias instaladas"

# ── 3. Verificar Wrangler ─────────────────────────────────────
Write-Step "Verificando Wrangler..."
$wranglerCmd = ".\node_modules\.bin\wrangler.cmd"
if (Test-Path $wranglerCmd) {
    $wv = & $wranglerCmd --version
    Write-OK "Wrangler $wv"
} else {
    Write-Fail "Wrangler nao encontrado em node_modules"
}

# ── 4. Validar TypeScript ─────────────────────────────────────
Write-Step "Verificando TypeScript (type-check)..."
& ".\node_modules\.bin\tsc.cmd" --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Warn "TypeScript reportou erros (veja acima). Pode nao impedir o deploy, mas corrija antes."
} else {
    Write-OK "TypeScript sem erros"
}

# ── 5. Verificar variaveis de ambiente ───────────────────────
Write-Step "Verificando variaveis de ambiente no wrangler.toml..."
$toml = Get-Content "wrangler.toml" -Raw
if ($toml -match "JWT_SECRET") {
    Write-Warn "JWT_SECRET esta no wrangler.toml como texto plano. Use 'wrangler secret put JWT_SECRET --env production'"
} else {
    Write-OK "JWT_SECRET nao exposto no toml (use wrangler secret)"
}

# ── 6. Iniciar dev local ──────────────────────────────────────
Write-Step "Iniciando servidor local (Ctrl+C para parar)..."
Write-Host "    Acesse: http://localhost:8787/api/health" -ForegroundColor Yellow
Write-Host "    Para parar: Ctrl+C" -ForegroundColor Yellow
Write-Host ""

& $wranglerCmd dev
