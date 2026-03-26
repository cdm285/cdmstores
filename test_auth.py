#!/usr/bin/env python3
"""
Testes do sistema de autenticação
"""
import requests
import json

API_URL = "https://cdmstores.com/api"

print("\n🔐 TESTES DE AUTENTICAÇÃO\n")
print("=" * 50)

# 1. Registro
print("\n1️⃣ Registro de novo usuário")
try:
    response = requests.post(
        f"{API_URL}/auth/register",
        json={
            "email": "user123@test.com",
            "password": "pass123",
            "name": "Teste User"
        }
    )
    data = response.json()
    print(f"   Status: {data['success']}")
    if data['success']:
        print(f"   User ID: {data['user']['id']}")
        print(f"   Token: {data['token'][:30]}...")
        token = data['token']
    else:
        print(f"   Erro: {data['error']}")
except Exception as e:
    print(f"   ❌ Erro: {str(e)}")

# 2. Login
print("\n2️⃣ Login com credenciais")
try:
    response = requests.post(
        f"{API_URL}/auth/login",
        json={
            "email": "user123@test.com",
            "password": "pass123"
        }
    )
    data = response.json()
    print(f"   Status: {data['success']}")
    if data['success']:
        print(f"   User: {data['user']['name']}")
        token = data['token']
    else:
        print(f"   Erro: {data['error']}")
except Exception as e:
    print(f"   ❌ Erro: {str(e)}")

# 3. Get current user
print("\n3️⃣ Obter usuário atual (GET /auth/me)")
try:
    response = requests.get(
        f"{API_URL}/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    data = response.json()
    print(f"   Status: {data['success']}")
    if data['success']:
        print(f"   Email: {data['user']['email']}")
        print(f"   Name: {data['user']['name']}")
    else:
        print(f"   Erro: {data['error']}")
except Exception as e:
    print(f"   ❌ Erro: {str(e)}")

print("\n" + "=" * 50)
print("✅ TESTES DE AUTENTICAÇÃO COMPLETOS!\n")
