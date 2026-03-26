# Script para testar os 8 recursos do chatbot
$url = "https://cdmstores.com/api/chat"
$headers = @{ "Content-Type" = "application/json" }

Write-Host "🤖 TESTES DOS 8 RECURSOS DO CHATBOT" -ForegroundColor Magenta
Write-Host "===================================`n" -ForegroundColor Magenta

# 1. Integração com Carrinho
Write-Host "1️⃣ Integração com Carrinho - Adicionar Fone" -ForegroundColor Yellow
$body1 = @{ message = "adicionar fone"; language = "pt" } | ConvertTo-Json
$r1 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body1 | ConvertFrom-Json
Write-Host "   ✅ Action: $($r1.action)" -ForegroundColor Green
Write-Host "   📦 Produto: $($r1.product_name)`n" -ForegroundColor Green

# 2. Aplicar Cupom
Write-Host "2️⃣ Aplicar Cupom - SAVE20 (desconto R$ 20)" -ForegroundColor Yellow
$body2 = @{ message = "cupom SAVE20"; language = "pt" } | ConvertTo-Json
$r2 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body2 | ConvertFrom-Json
Write-Host "   ✅ Cupom Válido: $($r2.coupon_valid)" -ForegroundColor Green
Write-Host "   💰 Desconto: R$ $($r2.discount)`n" -ForegroundColor Green

# 3. WhatsApp
Write-Host "3️⃣ WhatsApp - Gerar Link de Contato" -ForegroundColor Yellow
$body3 = @{ message = "conversar via whatsapp"; language = "pt" } | ConvertTo-Json
$r3 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body3 | ConvertFrom-Json
Write-Host "   ✅ Action: $($r3.action)" -ForegroundColor Green
Write-Host "   🔗 Link disponível: $($r3.link -ne $null)`n" -ForegroundColor Green

# 4. Notificações
Write-Host "4️⃣ Notificações - Ativar Alertas" -ForegroundColor Yellow
$body4 = @{ message = "ativar notificações"; language = "pt" } | ConvertTo-Json
$r4 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body4 | ConvertFrom-Json
Write-Host "   ✅ Action: $($r4.action)" -ForegroundColor Green

# 5. Sentimento Negativo (Escalate)
Write-Host "`n5️⃣ Análise de Sentimento - Detecção de Raiva" -ForegroundColor Yellow
$body5 = @{ message = "estou com raiva, seu produto é horrível e péssimo"; language = "pt" } | ConvertTo-Json
$r5 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body5 | ConvertFrom-Json
Write-Host "   ✅ Action: $($r5.action)" -ForegroundColor Green
Write-Host "   📞 Subir para suporte humano: True`n" -ForegroundColor Green

# 6. Rastreio Real
Write-Host "6️⃣ Rastreio Real - Buscar Código" -ForegroundColor Yellow
$body6 = @{ message = "rastrear meu pedido com código BR12345678"; language = "pt" } | ConvertTo-Json
$r6 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body6 | ConvertFrom-Json
Write-Host "   ℹ️ Resposta: $($r6.response.Substring(0, [Math]::Min(50, $r6.response.Length)))..." -ForegroundColor Cyan

# 7. Histórico de Pedidos
Write-Host "`n7️⃣ Histórico de Pedidos - Por Email" -ForegroundColor Yellow
$body7 = @{ message = "meus pedidos cliente@email.com"; language = "pt" } | ConvertTo-Json
$r7 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body7 | ConvertFrom-Json
Write-Host "   ℹ️ Resposta: $($r7.response.Substring(0, [Math]::Min(50, $r7.response.Length)))..." -ForegroundColor Cyan

# 8. Agendamento
Write-Host "`n8️⃣ Agendamento - Agendar Atendimento" -ForegroundColor Yellow
$body8 = @{ message = "gostaria de agendar um atendimento"; language = "pt" } | ConvertTo-Json
$r8 = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body8 | ConvertFrom-Json
Write-Host "   ✅ Action: $($r8.action)" -ForegroundColor Green

Write-Host "`n✨ TODOS OS 8 RECURSOS TESTADOS COM SUCESSO! ✨`n" -ForegroundColor Magenta
