# ─────────────────────────────────────────────────────────────────────────────
# deploy.ps1 — Deploy seguro CDM STORES → Cloudflare Workers
#
# Uso:
#   cd worker
#   .\deploy.ps1                     → deploy production (com confirmação)
#   .\deploy.ps1 -Env staging        → deploy staging
#   .\deploy.ps1 -SkipValidation     → pular validação (não recomendado)
#   .\deploy.ps1 -DryRun             → simular deploy sem publicar
#
# Nunca usar GitHub como gatilho — deploy manual, revisão humana obrigatória.
# ─────────────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
    [ValidateSet('production', 'staging')]
    [string]$Env = 'production',

    [switch]$SkipValidation,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SCRIPT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$TIMESTAMP   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$LOG_FILE    = Join-Path $SCRIPT_DIR "deploy-log.txt"

function Log {
    param([string]$msg, [string]$color = 'White')
    # Nunca escrever valores de variáveis de ambiente no log
    $sanitized = $msg -replace '(sk_live|sk_test|whsec_|rk_live|re_)[A-Za-z0-9_\-]+', '[REDACTED]'
    $sanitized = $sanitized -replace 'Bearer [A-Za-z0-9_\-\.]+', 'Bearer [REDACTED]'
    Write-Host $sanitized -ForegroundColor $color
    # Log limpo em arquivo (sem dados sensíveis)
    Add-Content -Path $LOG_FILE -Value "[$TIMESTAMP] $sanitized" -ErrorAction SilentlyContinue
}

Log "`n╔══════════════════════════════════════════════════════╗" Cyan
Log "║   CDM STORES — Deploy Seguro → Cloudflare Workers   ║" Cyan
Log "╚══════════════════════════════════════════════════════╝`n" Cyan
Log "  Ambiente : $Env" Cyan
Log "  Horário  : $TIMESTAMP" Cyan
Log "  DryRun   : $($DryRun.IsPresent)" Cyan

# ─── Etapa 1: Pré-validação de segurança ─────────────────────────────────────
if (-not $SkipValidation) {
    Log "`n[Etapa 1/4] Executando validação de segurança pré-deploy..." White
    $validateScript = Join-Path $SCRIPT_DIR "validate-deploy.ps1"
    if (-not (Test-Path $validateScript)) {
        Log "ERRO: validate-deploy.ps1 não encontrado em $SCRIPT_DIR" Red
        exit 1
    }
    & $validateScript
    if ($LASTEXITCODE -ne 0) {
        Log "`n❌ Deploy BLOQUEADO pela validação de segurança." Red
        Log "   Corrija os problemas listados acima e tente novamente.`n" Red
        exit 1
    }
} else {
    Log "`n[Etapa 1/4] Validação PULADA (--SkipValidation)." Yellow
    Log "  ⚠️  Não recomendado para produção." Yellow
}

# ─── Etapa 2: Confirmação humana ─────────────────────────────────────────────
Log "`n[Etapa 2/4] Confirmação de deploy..." White
if (-not $DryRun) {
    $confirm = Read-Host "  Confirmar deploy para PRODUÇÃO ($Env)? [s/N]"
    if ($confirm -notin @('s', 'S', 'sim', 'yes', 'y')) {
        Log "`n  Deploy cancelado pelo usuário.`n" Yellow
        exit 0
    }
}

# ─── Etapa 3: TypeScript build check (wrangler faz internamente, mas garantimos) ─
Log "`n[Etapa 3/4] Verificando integridade do build..." White
Push-Location $SCRIPT_DIR
try {
    $tscCheck = npx tsc --noEmit 2>&1 | Out-String
    if ($tscCheck -match 'error TS') {
        Log "❌ Erros TypeScript detectados. Deploy cancelado." Red
        Log $tscCheck Red
        Pop-Location
        exit 1
    }
    Log "  TypeScript: ✅ sem erros" Green
} catch {
    Log "  ⚠️  TypeScript check falhou — continuando com cautela." Yellow
}

# ─── Etapa 4: Deploy ─────────────────────────────────────────────────────────
Log "`n[Etapa 4/4] Iniciando deploy $( if ($DryRun) { '(DRY RUN — sem publicação real)' } )..." White

$deployArgs = @('deploy', '--env', $Env)
if ($DryRun) { $deployArgs += '--dry-run' }

try {
    $deployOutput = npx wrangler @deployArgs 2>&1 | Out-String
    # Sanitizar output antes de exibir/salvar
    $deployOutput = $deployOutput -replace '(sk_live|sk_test|whsec_|rk_live|re_)[A-Za-z0-9_\-]+', '[REDACTED]'

    if ($deployOutput -match 'Deployed|Successfully uploaded|Published') {
        Log "`n✅ Deploy seguro concluído com sucesso." Green
        Log "   Ambiente: $Env | $TIMESTAMP" Green
    } elseif ($deployOutput -match 'error|Error|ERROR') {
        Log "`n❌ Deploy falhou." Red
        Log $deployOutput Red
        Pop-Location
        exit 1
    } else {
        Log $deployOutput White
        Log "`n✅ Deploy executado." Green
    }
} catch {
    Log "`n❌ Erro fatal durante o deploy: $_" Red
    Pop-Location
    exit 1
}

Pop-Location
Log ""
