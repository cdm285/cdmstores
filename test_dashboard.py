import requests
import json
from datetime import datetime

BASE_URL = "https://cdmstores.com/api"

def log(title, response):
    """Helper para mostrar responses"""
    print(f"\n{'='*60}")
    print(f"✓ {title}")
    print(f"{'='*60}")
    try:
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    except:
        print(response.text)
    print(f"Status: {response.status_code}")

# Test user
EMAIL = f"test{datetime.now().timestamp():.0f}@test.com"
PASSWORD = "TestPassword123!"

# 1. REGISTER
print("\n🔐 TESTE COMPLETO - PROFILE, ORDERS, ADDRESSES\n")
print(f"Email para teste: {EMAIL}")

resp = requests.post(f"{BASE_URL}/auth/register", json={
    "name": "João Silva",
    "email": EMAIL,
    "password": PASSWORD
})
log("1. REGISTER - Criar conta", resp)
if not resp.ok:
    print("❌ Falha ao criar conta")
    exit(1)

# Extrair token
data = resp.json()
token = data.get('token')
user_id = data.get('user', {}).get('id')
print(f"\n✓ Token: {token[:50]}...")
print(f"✓ User ID: {user_id}")

# 2. GET /api/auth/me - Verificar perfil
resp = requests.get(f"{BASE_URL}/auth/me", headers={
    "Authorization": f"Bearer {token}"
})
log("2. GET /api/auth/me - Carregar perfil", resp)

# 3. PUT /api/user/profile - Atualizar perfil
resp = requests.put(f"{BASE_URL}/user/profile", 
    json={
        "name": "João Silva Atualizado",
        "phone": "(11) 99999-9999",
        "avatar_url": "https://i.pravatar.cc/150?img=1"
    },
    headers={"Authorization": f"Bearer {token}"}
)
log("3. PUT /api/user/profile - Atualizar perfil", resp)

# 4. POST /api/auth/change-password - Mudar senha
NEW_PASSWORD = "NovaPassword456!"
resp = requests.post(f"{BASE_URL}/auth/change-password",
    json={
        "current_password": PASSWORD,
        "new_password": NEW_PASSWORD
    },
    headers={"Authorization": f"Bearer {token}"}
)
log("4. POST /api/auth/change-password - Trocar senha", resp)

# 5. POST /api/addresses - Criar novo endereço
resp = requests.post(f"{BASE_URL}/addresses",
    json={
        "label": "Casa",
        "name": "João Silva",
        "phone": "(11) 99999-9999",
        "street": "Rua das Flores",
        "number": "123",
        "complement": "Apto 45",
        "city": "Vila Mariana",
        "state": "SP",
        "zip": "04010-010",
        "country": "Brasil",
        "is_default": True
    },
    headers={"Authorization": f"Bearer {token}"}
)
log("5. POST /api/addresses - Criar endereço", resp)
address_data = resp.json() if resp.ok else {}
address_id = address_data.get('id') if isinstance(address_data, dict) else None
print(f"\n✓ Address ID: {address_id}")

# 6. POST /api/addresses - Criar segundo endereço
resp = requests.post(f"{BASE_URL}/addresses",
    json={
        "label": "Trabalho",
        "name": "João Silva",
        "phone": "(11) 88888-8888",
        "street": "Av. Paulista",
        "number": "1000",
        "complement": "Sala 200",
        "city": "Centro",
        "state": "SP",
        "zip": "01311-100",
        "country": "Brasil",
        "is_default": False
    },
    headers={"Authorization": f"Bearer {token}"}
)
log("6. POST /api/addresses - Criar segundo endereço", resp)
address_data2 = resp.json() if resp.ok else {}
address_id2 = address_data2.get('id') if isinstance(address_data2, dict) else None

# 7. GET /api/addresses - Listar todos os endereços
resp = requests.get(f"{BASE_URL}/addresses", headers={
    "Authorization": f"Bearer {token}"
})
log("7. GET /api/addresses - Listar endereços", resp)

# 8. PUT /api/addresses/{id} - Atualizar endereço
if address_id:
    resp = requests.put(f"{BASE_URL}/addresses/{address_id}",
        json={
            "label": "Casa Principal",
            "name": "João Silva",
            "phone": "(11) 99999-9999",
            "street": "Rua das Flores",
            "number": "123",
            "complement": "Apto 50",  # Mudou
            "city": "Vila Mariana",
            "state": "SP",
            "zip": "04010-010",
            "country": "Brasil",
            "is_default": True
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    log("8. PUT /api/addresses/{id} - Atualizar endereço", resp)

# 9. POST /api/addresses/{id}/default - Marcar como default
if address_id2:
    resp = requests.post(f"{BASE_URL}/addresses/{address_id2}/default",
        headers={"Authorization": f"Bearer {token}"}
    )
    log("9. POST /api/addresses/{id}/default - Marcar como default", resp)

# 10. GET /api/addresses - Listar novamente para ver mudanças
resp = requests.get(f"{BASE_URL}/addresses", headers={
    "Authorization": f"Bearer {token}"
})
log("10. GET /api/addresses - Listar após mudanças", resp)

# 11. DELETE /api/addresses/{id} - Excluir um endereço
if address_id:
    resp = requests.delete(f"{BASE_URL}/addresses/{address_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    log("11. DELETE /api/addresses/{id} - Excluir endereço", resp)

# 12. GET /api/orders/user - Listar pedidos (vazio, pois não tem pedidos ainda)
resp = requests.get(f"{BASE_URL}/orders/user", headers={
    "Authorization": f"Bearer {token}"
})
log("12. GET /api/orders/user - Listar pedidos do usuário", resp)

print("\n\n" + "="*60)
print("✅ TESTES CONCLUÍDOS!")
print("="*60)
