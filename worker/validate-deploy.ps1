# validate-deploy.ps1 - Pre-deploy security validation for CDM STORES
# Run before every deploy: .\validate-deploy.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WORKER_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ROOT_DIR   = Split-Path -Parent $WORKER_DIR

$issues   = [System.Collections.ArrayList]::new()
$warnings = [System.Collections.ArrayList]::new()

Write-Host ""
Write-Host "=== CDM STORES - Validacao pre-deploy ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Verificar autenticacao Wrangler ----------------------------------
Write-Host "  [1/7] Verificando autenticacao Wrangler..." -NoNewline
try {
    $whoami = (npx wrangler whoami 2>&1) | Out-String
    if ($whoami -match 'You are not authenticated') {
        [void]$issues.Add("AUTH: Execute 'npx wrangler login' antes do deploy.")
        Write-Host " FALHOU" -ForegroundColor Red
    } else {
        Write-Host " OK" -ForegroundColor Green
    }
} catch {
    [void]$issues.Add("AUTH: Wrangler nao encontrado. Execute 'npm install' no diretorio worker.")
    Write-Host " FALHOU" -ForegroundColor Red
}

# --- 2. Verificar wrangler.toml - sem secrets embutidos -------------------
Write-Host "  [2/7] Verificando wrangler.toml..." -NoNewline
$tomlPath = Join-Path $WORKER_DIR "wrangler.toml"
if (Test-Path $tomlPath) {
    $tomlContent = Get-Content $tomlPath -Raw
    $secretPatterns = @(
        'sk_live_[A-Za-z0-9]+',
        'sk_test_[A-Za-z0-9]+',
        'whsec_[A-Za-z0-9]+',
        'pk_live_[A-Za-z0-9]+',
        'rk_live_[A-Za-z0-9]+'
    )
    $tomlClean = $true
    foreach ($pattern in $secretPatterns) {
        if ($tomlContent -match $pattern) {
            [void]$issues.Add("TOML: Possivel secret detectado (padrao: $pattern). Remova e use 'wrangler secret put'.")
            $tomlClean = $false
        }
    }
    if ($tomlClean) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " FALHOU" -ForegroundColor Red }
} else {
    [void]$issues.Add("TOML: wrangler.toml nao encontrado em $tomlPath")
    Write-Host " FALHOU" -ForegroundColor Red
}

# --- 3. Verificar arquivos .env e .dev.vars --------------------------------
Write-Host "  [3/7] Verificando arquivos .env e .dev.vars..." -NoNewline
$sensitiveFiles = @('.env', '.env.local', '.env.production', '.dev.vars')
$gitignorePath  = Join-Path $ROOT_DIR ".gitignore"
foreach ($f in $sensitiveFiles) {
    $fp = Join-Path $WORKER_DIR $f
    if (Test-Path $fp) {
        $content = Get-Content $fp -Raw
        if ($content -match '(?m)^\s*\w+\s*=\s*.*(sk_live|sk_test|whsec_|rk_live)[A-Za-z0-9_]+') {
            [void]$warnings.Add("ENV: $f contem padrao de chave Stripe real. Confirme que este arquivo NAO esta no Git.")
        }
    }
    if ($f -eq '.dev.vars' -and (Test-Path $gitignorePath)) {
        $gi = Get-Content $gitignorePath -Raw
        if ($gi -notmatch '\.dev\.vars') {
            [void]$issues.Add("GIT: .dev.vars nao esta no .gitignore! Adicione imediatamente.")
        }
    }
}
Write-Host " OK" -ForegroundColor Green

# --- 4. Verificar .gitignore - entradas obrigatorias ----------------------
Write-Host "  [4/7] Verificando .gitignore..." -NoNewline
$requiredIgnores = @('.env', '.env\.\*', '\.dev\.vars', '\.wrangler/', 'node_modules/')
$missingIgnores  = [System.Collections.ArrayList]::new()
if (Test-Path $gitignorePath) {
    $gi = Get-Content $gitignorePath -Raw
    $checkList = @('.env', '.env.*', '.dev.vars', '.wrangler/', 'node_modules/')
    $patterns  = @('.env', '\.env\.\*', '\.dev\.vars', '\.wrangler', 'node_modules')
    for ($i = 0; $i -lt $checkList.Count; $i++) {
        if ($gi -notmatch $patterns[$i]) {
            [void]$missingIgnores.Add($checkList[$i])
        }
    }
}
if ($missingIgnores.Count -gt 0) {
    [void]$issues.Add("GIT: Entradas faltando no .gitignore: $($missingIgnores -join ', ')")
    Write-Host " FALHOU" -ForegroundColor Red
} else {
    Write-Host " OK" -ForegroundColor Green
}

# --- 5. Verificar secrets obrigatorios no Cloudflare ----------------------
Write-Host "  [5/7] Verificando secrets no Cloudflare (production)..." -NoNewline
$requiredSecrets = @(
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'JWT_SECRET',
    'CJ_API_KEY', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET',
    'ORGANIC_ADMIN_KEY'
)
try {
    $secretListRaw  = (npx wrangler secret list --env production 2>&1) | Out-String
    $missingSecrets = [System.Collections.ArrayList]::new()
    foreach ($s in $requiredSecrets) {
        if ($secretListRaw -notmatch [regex]::Escape("`"name`": `"$s`"")) {
            [void]$missingSecrets.Add($s)
        }
    }
    if ($missingSecrets.Count -gt 0) {
        [void]$issues.Add("SECRETS: Faltando no Cloudflare production: $($missingSecrets -join ', ')")
        Write-Host " FALHOU" -ForegroundColor Red
    } else {
        Write-Host " OK" -ForegroundColor Green
    }
} catch {
    [void]$warnings.Add("SECRETS: Nao foi possivel verificar secrets remotos. Verifique a autenticacao.")
    Write-Host " AVISO" -ForegroundColor Yellow
}

# --- 6. Verificar TypeScript -----------------------------------------------
Write-Host "  [6/7] Verificando TypeScript (type-check)..." -NoNewline
try {
    Push-Location $WORKER_DIR
    $tscOut = (npx tsc --noEmit 2>&1) | Out-String
    Pop-Location
    if ($tscOut -match 'error TS') {
        [void]$issues.Add("BUILD: Erros TypeScript detectados. Execute 'npx tsc --noEmit' para detalhes.")
        Write-Host " FALHOU" -ForegroundColor Red
    } else {
        Write-Host " OK" -ForegroundColor Green
    }
} catch {
    [void]$warnings.Add("BUILD: TypeScript check falhou - verifique node_modules.")
    Write-Host " AVISO" -ForegroundColor Yellow
    if ((Get-Location).Path -ne $WORKER_DIR) { Pop-Location }
}

# --- 7. Scan de secrets expostos no codigo-fonte -------------------------
Write-Host "  [7/7] Scan de secrets expostos no codigo-fonte..." -NoNewline
$srcDir = Join-Path $WORKER_DIR "src"
if (Test-Path $srcDir) {
    $codeSecretPatterns = @(
        'sk_live_[A-Za-z0-9]{20,}',
        'sk_test_[A-Za-z0-9]{20,}',
        'whsec_[A-Za-z0-9]{20,}',
        'rk_live_[A-Za-z0-9]{20,}'
    )
    $srcFiles    = Get-ChildItem -Path $srcDir -Recurse | Where-Object { ($_.Extension -eq '.ts' -or $_.Extension -eq '.js') -and $_.FullName -notmatch 'node_modules|\.wrangler' }
    $exposedFound = $false
    foreach ($file in $srcFiles) {
        $fc = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $fc) { continue }
        foreach ($pattern in $codeSecretPatterns) {
            if ($fc -match $pattern) {
                [void]$issues.Add("CODE: Possivel secret em $($file.Name) (padrao: $pattern)")
                $exposedFound = $true
            }
        }
    }
    if (-not $exposedFound) { Write-Host " OK" -ForegroundColor Green } else { Write-Host " FALHOU" -ForegroundColor Red }
} else {
    Write-Host " PULADO (src/ nao encontrado)" -ForegroundColor Yellow
}

# --- Relatorio final -------------------------------------------------------
Write-Host ""
if ($warnings.Count -gt 0) {
    Write-Host "AVISOS ($($warnings.Count)):" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
    Write-Host ""
}

if ($issues.Count -gt 0) {
    Write-Host "BLOQUEADO - $($issues.Count) problema(s) encontrado(s):" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "   Corrija os itens acima antes de fazer o deploy." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Validacao concluida - nenhum risco detectado." -ForegroundColor Green
    exit 0
}
