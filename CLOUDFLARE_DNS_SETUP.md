# 🔧 Guia: Configurar cdmstores.com (com e sem www) - Cloudflare

## Objetivo
Fazer que AMBOS funcionem:
- ✅ `cdmstores.com` 
- ✅ `www.cdmstores.com`

---

## 📋 PASSO-A-PASSO NO CLOUDFLARE DASHBOARD

### **PASSO 1: Acessar DNS**

```
1. Abra: https://dash.cloudflare.com
2. Selecione seu domínio: cdmstores.com
3. No menu esquerdo: DNS → Records
```

### **PASSO 2: Verificar Records Existentes**

Você deve VER algo como isto:

```
Type  | Name           | Content                          | TTL
------|----------------|----------------------------------|------
CNAME | www            | d32b3c71.cdmstores.pages.dev    | Auto
```

Se só tem isso, está FALTANDO O RECORD RAIZ (`@`)

### **PASSO 3: Adicionar Record RAIZ (@ = cdmstores.com)**

Se NÃO tem um CNAME com Nome `@`:

```
1. Clique: "+ Add Record"
2. Preencha assim:
   
   Type:     CNAME
   Name:     @ (ou deixe em branco)
   Content:  d32b3c71.cdmstores.pages.dev
   TTL:      Auto
   Proxy:    Proxied (nuvem laranja)

3. Clique: "Save"
```

**Resultado esperado:**
```
Type  | Name | Content                          
------|------|----------------------------------
CNAME | @    | d32b3c71.cdmstores.pages.dev    
CNAME | www  | d32b3c71.cdmstores.pages.dev    
```

---

## ✅ VERIFICAR SE FUNCIONOU

Depois que adicionar, espere **5-10 minutos** e teste:

```
No navegador:
✅ https://cdmstores.com
✅ https://www.cdmstores.com

Ambas devem mostrar a loja!
```

---

## 🔄 BONUS: Redirecionar cdmstores.com → www (Opcional)

Se quiser que `cdmstores.com` sempre redirecione para `www`:

```
1. Menu esquerdo: Rules → Page Rules
2. "+ Create Page Rule"
3. URL: cdmstores.com/*
4. Forward URL: Select "Permanent Redirect (301)"
5. Redirect to: https://www.cdmstores.com/$1
6. Save
```

---

## ⚠️ TROUBLESHOOTING

**Problema: Ainda não funciona depois de 10min**

```
1. Limpar cache do navegador: Ctrl+Shift+Del
2. Usar outro navegador (Chrome, Firefox)
3. Testar com DevTools: Ctrl+Shift+I
4. Verificar se Pages URL está correta:
   d32b3c71.cdmstores.pages.dev
```

**Verificar no terminal:**
```powershell
nslookup cdmstores.com
# Deve retornar IP do Cloudflare
```

---

## 📞 Se Precisar de Ajuda

Print da sua tela DNS:
1. Vá em: https://dash.cloudflare.com
2. Selecione cdmstores.com
3. DNS → Records
4. Screenshot e me manda

Ou copie/cole o que vê aí! 👍
