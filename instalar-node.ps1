# ============================================================
# instalar-node.ps1
# Instala Node.js LTS no Windows e configura o ambiente.
# EXECUTE COMO ADMINISTRADOR:
#   Clique com botão direito no PowerShell → "Executar como administrador"
#   cd d:\cdmstores
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\instalar-node.ps1
# ============================================================

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "    ERRO: $msg" -ForegroundColor Red }

# ── 1. Verificar se já está instalado ───────────────────────
Write-Step "Verificando instalação existente..."
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if ($nodeExe) {
    Write-OK "Node já instalado: $(node --version)"
    Write-OK "npm: $(npm --version)"
    Write-OK "Caminho: $($nodeExe.Source)"
    exit 0
}

# ── 2. Tentar instalar via winget (requer admin) ─────────────
Write-Step "Instalando Node.js LTS via winget..."
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
    try {
        winget install OpenJS.NodeJS.LTS `
            --accept-source-agreements `
            --accept-package-agreements `
            --silent `
            --override "/quiet /norestart ADDLOCAL=ALL"
        Write-OK "winget concluiu instalação"
    } catch {
        Write-Fail "winget falhou: $_"
        Write-Host "    Tentando download direto..." -ForegroundColor Yellow
    }
} else {
    Write-Fail "winget não encontrado"
}

# ── 3. Verificar se winget instalou corretamente ─────────────
$nodePath = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $nodePath)) {
    # ── 4. Fallback: download direto do nodejs.org ───────────
    Write-Step "Download direto do instalador Node.js LTS..."
    $version  = "22.14.0"   # Node.js 22 LTS (Jod)
    $msiUrl   = "https://nodejs.org/dist/v$version/node-v$version-x64.msi"
    $msiPath  = "$env:TEMP\node-lts.msi"

    Write-Host "    Baixando $msiUrl ..."
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing

    Write-Host "    Executando instalador MSI (pode abrir UAC)..."
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart ADDLOCAL=ALL" -Wait -Verb RunAs

    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
}

# ── 5. Atualizar PATH nesta sessão ───────────────────────────
Write-Step "Configurando PATH..."
$nodePath   = "C:\Program Files\nodejs"
$npmPath    = "$env:APPDATA\npm"

foreach ($p in @($nodePath, $npmPath)) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
        Write-OK "Adicionado à sessão: $p"
    }
}

# Persistir para o usuário atual
$currentUserPath = [System.Environment]::GetEnvironmentVariable("PATH","User")
foreach ($p in @($nodePath, $npmPath)) {
    if ((Test-Path $p) -and ($currentUserPath -notlike "*$p*")) {
        [System.Environment]::SetEnvironmentVariable("PATH", "$p;$currentUserPath", "User")
        $currentUserPath = [System.Environment]::GetEnvironmentVariable("PATH","User")
        Write-OK "Persistido no PATH do usuário: $p"
    }
}

# ── 6. Validar ───────────────────────────────────────────────
Write-Step "Validando ambiente..."
try {
    $nv = & "$nodePath\node.exe" --version
    $mv = & "$nodePath\npm.cmd" --version
    Write-OK "node $nv"
    Write-OK "npm  $mv"
} catch {
    Write-Fail "Instalação não detectada em $nodePath"
    Write-Host ""
    Write-Host "SOLUÇÃO MANUAL:" -ForegroundColor Yellow
    Write-Host "  1. Acesse https://nodejs.org/en/download/ e baixe o instalador Windows (.msi)"
    Write-Host "  2. Execute como Administrador"
    Write-Host "  3. Reinicie o PowerShell após instalar"
    exit 1
}

# ── 7. Corrigir Execution Policy para rodar .ps1 ────────────
Write-Step "Corrigindo Execution Policy para scripts .ps1..."
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
Write-OK "ExecutionPolicy definida como RemoteSigned para CurrentUser"

# ── 8. Próximos passos ───────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Node.js instalado com sucesso!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "  1. Feche e reabra o PowerShell (ou VS Code)"
Write-Host "  2. Execute:"
Write-Host "       cd d:\cdmstores\worker"
Write-Host "       npm install"
Write-Host "       npm run dev"
Write-Host ""
Write-Host "  Para validar:"
Write-Host "       node --version"
Write-Host "       npm --version"
Write-Host "       npx wrangler --version"
