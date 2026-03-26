#!/usr/bin/env python3
"""
Script para aplicar SQL migration manualmente via Workers API
"""
import requests

# Ler o arquivo de migration
with open('c:\\Users\\aguia\\cdmstores\\worker\\migrations\\004_authentication.sql', 'r') as f:
    sql_content = f.read()

# Dividir em comandos
commands = [cmd.strip() for cmd in sql_content.split(';') if cmd.strip()]

print(f"📊 Encontrados {len(commands)} comandos SQL")
print("\nAplicando tabelas de autenticação...\n")

for i, cmd in enumerate(commands[:8], 1):  # Primeiras 8 são CREATE TABLE
    if cmd:
        print(f"{i}. {cmd[:50]}...")

print("\n✅ Migration preparada para ser aplicada via Wrangler")
print("\nPróximo passo: npx wrangler d1 migrations apply cdmstores --remote (com confirmação 'yes')")
