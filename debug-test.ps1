# Testes com padrões corretos para debugar
$url = "https://cdmstores.com/api/chat"
$h = @{ "Content-Type" = "application/json" }

Write-Host "DEBUG: Testando padrões corretos`n" -ForegroundColor Cyan

# 1. Notificações
Write-Host "1. Notificações" -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $h -Body (@{ message = "quero ativar notificações"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
Write-Host "   action: '$($r.action)'" -ForegroundColor Green

# 2. Cupom com padrão correto
Write-Host "2. Cupom" -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $h -Body (@{ message = "aplicar cupom SAVE20 agora"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
Write-Host "   action: '$($r.action)' | valid: $($r.coupon_valid) | disc: $($r.discount)" -ForegroundColor Green

# 3. Rastreio
Write-Host "3. Rastreio" -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $h -Body (@{ message = "rastrear código TRACK123456"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
Write-Host "   action: '$($r.action)'" -ForegroundColor Green

# 4. Histórico com email
Write-Host "4. Histórico" -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $h -Body (@{ message = "quero ver meus pedidos teste@example.com"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
Write-Host "   action: '$($r.action)'" -ForegroundColor Green

Write-Host "`nDone!" -ForegroundColor Green
