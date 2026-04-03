# ============================================================
# testar-sem-node.ps1
# Alternativa para rodar Wrangler SEM precisar de Node no PATH.
# Usa o wrangler.cmd diretamente de node_modules.
# ============================================================

$wrangler = "d:\cdmstores\worker\node_modules\.bin\wrangler.cmd"

if (-not (Test-Path $wrangler)) {
    Write-Host "[ERRO] node_modules nao instalado. Instale Node primeiro e execute:" -ForegroundColor Red
    Write-Host "   cd d:\cdmstores\worker" -ForegroundColor Yellow
    Write-Host "   npm install" -ForegroundColor Yellow
    exit 1
}

Set-Location "d:\cdmstores\worker"

Write-Host ""
Write-Host "Wrangler disponivel em: $wrangler" -ForegroundColor Green
Write-Host "Versao: $(& $wrangler --version)" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos disponiveis:" -ForegroundColor Cyan
Write-Host "  & '$wrangler' dev                        # Rodar localmente"
Write-Host "  & '$wrangler' dev --env staging          # Rodar em staging"
Write-Host "  & '$wrangler' deploy --env production    # Deploy em producao"
Write-Host "  & '$wrangler' deploy --env staging       # Deploy em staging"
Write-Host "  & '$wrangler' tail --env production      # Ver logs em tempo real"
Write-Host "  & '$wrangler' d1 execute cdmstores --file=./migrations/001_init.sql --local"
Write-Host "  & '$wrangler' secret put JWT_SECRET --env production"
Write-Host ""
Write-Host "Iniciando wrangler dev agora (Ctrl+C para parar)..." -ForegroundColor Yellow
Write-Host "  Acesse: http://localhost:8787/api/health" -ForegroundColor Yellow
Write-Host ""

& $wrangler dev
