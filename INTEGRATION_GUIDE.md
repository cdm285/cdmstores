# 📱 Frontend Integration - CDM Stores

## Como Usar

### 1. Incluir Script no HTML

Adicione em suas páginas HTML (antes do `</body>`):

```html
<script src="/frontend-integration.js"></script>
```

### 2. Botão de Compra Rápida

```html
<button onclick="cdmStore.adicionarCarrinho(1, 'Fone Bluetooth', 89.90)">
  Adicionar ao Carrinho
</button>
```

### 3. Iniciar Checkout

```html
<button onclick="cdmStore.comprar('seu@email.com')">
  Finalizar Compra
</button>
```

### 4. Rastreamento

```html
<input type="text" id="trackingCode" placeholder="Código de rastreamento">
<button onclick="cdmStore.rastrear(document.getElementById('trackingCode').value)">
  Rastrear
</button>
```

## Exemplos Completos

### Página de Produtos

```html
<!DOCTYPE html>
<html>
<head>
  <title>Loja</title>
  <style>
    .carrinho-count {
      background: red;
      color: white;
      border-radius: 50%;
      padding: 2px 6px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>
    <h1>CDM Stores</h1>
    <span>Carrinho: <span id="carrinho-count">0</span></span>
  </header>

  <section>
    <h2>Produtos</h2>
    <div class="product-card">
      <h3>Fone Bluetooth</h3>
      <p>R$ 89,90</p>
      <button onclick="cdmStore.adicionarCarrinho(1, 'Fone Bluetooth', 89.90)">
        Comprar
      </button>
    </div>

    <div class="product-card">
      <h3>Carregador USB-C</h3>
      <p>R$ 49,90</p>
      <button onclick="cdmStore.adicionarCarrinho(2, 'Carregador USB-C', 49.90)">
        Comprar
      </button>
    </div>

    <div class="product-card">
      <h3>Cabo Lightning</h3>
      <p>R$ 29,90</p>
      <button onclick="cdmStore.adicionarCarrinho(3, 'Cabo Lightning', 29.90)">
        Comprar
      </button>
    </div>
  </section>

  <section>
    <h2>Seu Carrinho</h2>
    <button onclick="cdmStore.comprar('seu@email.com')">
      Finalizar Compra
    </button>
  </section>

  <script src="/frontend-integration.js"></script>
</body>
</html>
```

### Página de Rastreamento

```html
<!DOCTYPE html>
<html>
<head>
  <title>Rastreamento</title>
</head>
<body>
  <h1>Rastreie seu Pedido</h1>
  
  <input 
    type="text" 
    id="trackingCode" 
    placeholder="Digite o código de rastreamento"
  >
  <button onclick="cdmStore.rastrear(document.getElementById('trackingCode').value)">
    Rastrear
  </button>

  <script src="/frontend-integration.js"></script>
</body>
</html>
```

## API do Frontend

### `cdmStore.adicionarCarrinho(productId, productName, productPrice)`
Adiciona produto ao carrinho local + valida no backend.

```javascript
cdmStore.adicionarCarrinho(1, 'Fone Bluetooth', 89.90);
```

### `cdmStore.comprar(email, phone = '')`
Inicia o checkout e cria pedido.

```javascript
cdmStore.comprar('cliente@email.com', '11999999999');
```

### `cdmStore.rastrear(trackingCode)`
Rastreia um pedido pelo código.

```javascript
cdmStore.rastrear('ABC123XYZ');
```

### `cdmStore.carregarProdutos()`
Retorna lista de produtos do backend.

```javascript
const produtos = await cdmStore.carregarProdutos();
console.log(produtos);
// [
//   { id: 1, name: 'Fone Bluetooth', price: 89.90, stock: 50 },
//   { id: 2, name: 'Carregador USB-C', price: 49.90, stock: 100 },
//   { id: 3, name: 'Cabo Lightning', price: 29.90, stock: 75 }
// ]
```

## Carrinho Local

O carrinho é salvo em `localStorage` automaticamente:

```javascript
// Acessar carrinho
console.log(cdmStore.cart.items);

// Limpar carrinho
cdmStore.cart.clear();

// Obter total de itens
console.log(cdmStore.cart.getTotal());
```

## Próximas Etapas

1. **Stripe Checkout**: Integrar com `@stripe/js` para checkout seguro
2. **Persistência**: Salvar carrinho em backend via sessão
3. **Auth**: Adicionar autenticação de usuário
4. **Mobile**: Otimizar para dispositivos móveis
5. **Analytics**: Rastrear eventos de compra

## Teste Local

```bash
# Dev server Cloudflare
cd worker
npm run dev

# Em outro terminal: abrir página HTML
# Frontend fará requisições para http://localhost:8787/api/*
```
