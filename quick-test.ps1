# Quick test dos 8 recursos - versão simplificada
$url = "https://cdmstores.com/api/chat"
$headers = @{ "Content-Type" = "application/json" }

Write-Host "`n🤖 TESTES DOS 8 RECURSOS DO CHATBOT`n" -ForegroundColor Magenta

# 1. Add to Cart
"Test 1: Add Fone" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "adicionar fone"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Action: $($r.action) | Product: $($r.product_name)" | Write-Host -ForegroundColor Green

# 2. Coupon
"Test 2: Cupom SAVE20" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "cupom SAVE20"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Valid: $($r.coupon_valid) | Desconto: R$ $($r.discount)" | Write-Host -ForegroundColor Green

# 3. WhatsApp
"Test 3: WhatsApp Link" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "whatsapp"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Action: $($r.action)" | Write-Host -ForegroundColor Green

# 4. Negative Sentiment
"Test 4: Sentiment Analysis" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "péssimo, horrível, odeio"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Action: $($r.action)" | Write-Host -ForegroundColor Green

# 5. Notifications
"Test 5: Notificações" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "notificação"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Action: $($r.action)" | Write-Host -ForegroundColor Green

# 6. Tracking
"Test 6: Rastreio" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "rastrear BR12345678"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Tracking encontrado: $($r.action -eq 'tracking_found')" | Write-Host -ForegroundColor Green

# 7. Order History
"Test 7: Histórico de Pedidos" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "meus pedidos teste@email.com"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Orders action: $($r.action)" | Write-Host -ForegroundColor Green

# 8. Scheduling
"Test 8: Agendamento" | Write-Host -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body (@{ message = "agendar"; language = "pt" } | ConvertTo-Json) -UseBasicParsing | ConvertFrom-Json
"✅ Schedule action: $($r.action)" | Write-Host -ForegroundColor Green

Write-Host "`n✨ Todos os 8 recursos testados! ✨`n" -ForegroundColor Magenta
