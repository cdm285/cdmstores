#!/usr/bin/env python3
"""
Testa os 8 recursos do chatbot CDM STORES
"""
import requests
import json
from typing import Dict, Any

API_URL = "https://cdmstores.com/api/chat"
HEADERS = {"Content-Type": "application/json"}

def test_feature(name: str, message: str, expected_action=None) -> Dict[str, Any]:
    """Testa um recurso do chatbot"""
    payload = {"message": message, "language": "pt"}
    
    try:
        response = requests.post(API_URL, json=payload, headers=HEADERS, timeout=5)
        data = response.json()
        
        status = "✅"
        if expected_action and data.get("action") != expected_action:
            status = "⚠️"
        
        print(f"{status} {name}")
        print(f"   Response: {data.get('response', '')[:70]}...")
        if data.get("action"):
            print(f"   Action: {data.get('action')}")
        if data.get("discount"):
            print(f"   Discount: R$ {data.get('discount')}")
        print()
        
        return data
    except Exception as e:
        print(f"❌ {name} - Error: {str(e)}\n")
        return {}

print("\n🤖 TESTE DOS 8 RECURSOS DO CHATBOT 🤖\n")
print("=" * 50 + "\n")

# 1. Integração com Carrinho
print("1️⃣ INTEGRAÇÃO COM CARRINHO")
test_feature("Adicionar Fone", "adicionar fone ao carrinho", "add_to_cart")

print("2️⃣ APLICAR CUPOM")
test_feature("Validar cupom SAVE20", "cupom SAVE20", "coupon_applied")

print("3️⃣ WHATSAPP")
test_feature("Gerar link WhatsApp", "falar no whatsapp", "whatsapp_link")

print("4️⃣ SENTIMENTO NEGATIVO")
test_feature("Análise negativa", "estou com raiva, produto péssimo", "escalate_to_human")

print("5️⃣ NOTIFICAÇÕES")
test_feature("Ativar notificações", "quero notificações", "enable_notifications")

print("6️⃣ RASTREIO REAL")
result = test_feature("Rastrear pedido", "rastrear código ABC123456", "tracking_found")

print("7️⃣ HISTÓRICO DE PEDIDOS")
test_feature("Ver pedidos", "meus pedidos test@email.com", "orders_found")

print("8️⃣ AGENDAMENTO")
test_feature("Agendar suporte", "gostaria de agendar", "schedule_support")

print("=" * 50)
print("✨ TESTES CONCLUÍDOS! ✨\n")
