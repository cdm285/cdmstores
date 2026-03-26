// ============================================
// CDM STORES - TESTE DOS ENDPOINTS
// ============================================
// Execute esses testes no seu navegador ou com curl

const API_URL = 'http://localhost:8787'; // Desenvolvimento
// const API_URL = 'https://api.cdmstores.com'; // Produção

// ==================================
// ✅ TESTE 1: HEALTH CHECK
// ==================================
async function testHealth() {
  console.log('🔍 Testando health check...');
  
  const response = await fetch(`${API_URL}/api/health`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  console.log('Status:', response.status);
  
  return response.status === 200;
}

// ==================================
// ✅ TESTE 2: LISTAR PRODUTOS
// ==================================
async function testGetProducts() {
  console.log('🔍 Testando GET /api/products...');
  
  const response = await fetch(`${API_URL}/api/products`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  console.log('Total de produtos:', data.data?.length);
  
  return data.success && data.data?.length > 0;
}

// ==================================
// ✅ TESTE 3: OBTER UM PRODUTO
// ==================================
async function testGetProduct(productId = 1) {
  console.log(`🔍 Testando GET /api/products/${productId}...`);
  
  const response = await fetch(`${API_URL}/api/products/${productId}`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  
  return data.success;
}

// ==================================
// ✅ TESTE 4: CALCULAR FRETE
// ==================================
async function testCalculateShipping() {
  console.log('🔍 Testando GET /api/cart/calculate-shipping...');
  
  const response = await fetch(`${API_URL}/api/cart/calculate-shipping?cep=01310100&items=1`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  console.log('Frete:', data.shipping_cost);
  
  return data.success;
}

// ==================================
// ✅ TESTE 5: CRIAR PEDIDO
// ==================================
async function testCreateOrder() {
  console.log('🔍 Testando POST /api/orders...');
  
  const response = await fetch(`${API_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: 'João Teste',
      customer_email: 'joao@test.com',
      items: [
        { product_id: 1, quantity: 1, name: 'Fone Bluetooth', price: 89.90 }
      ],
      total: 89.90,
      shipping_cost: 25.00
    })
  });
  
  const data = await response.json();
  
  console.log('✅ Response:', data);
  console.log('Order ID:', data.order_id);
  
  return data.success;
}

// ==================================
// ✅ TESTE 6: OBTER PEDIDO
// ==================================
async function testGetOrder(orderId = 1) {
  console.log(`🔍 Testando GET /api/orders/${orderId}...`);
  
  const response = await fetch(`${API_URL}/api/orders/${orderId}`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  
  return data.success;
}

// ==================================
// ✅ TESTE 7: LISTAR PEDIDOS POR EMAIL
// ==================================
async function testGetCustomerOrders() {
  console.log('🔍 Testando GET /api/orders/customer/:email...');
  
  const response = await fetch(`${API_URL}/api/orders/customer/joao@test.com`);
  const data = await response.json();
  
  console.log('✅ Response:', data);
  console.log('Pedidos encontrados:', data.data?.length);
  
  return data.success;
}

// ==================================
// 🧪 EXECUTAR TODOS OS TESTES
// ==================================
async function runAllTests() {
  console.log('🚀 INICIANDO TESTES...\n');
  
  const tests = [
    { name: 'Health Check', fn: testHealth },
    { name: 'Listar Produtos', fn: testGetProducts },
    { name: 'Obter Produto #1', fn: () => testGetProduct(1) },
    { name: 'Calcular Frete', fn: testCalculateShipping },
    { name: 'Criar Pedido', fn: testCreateOrder },
    { name: 'Obter Pedido #1', fn: () => testGetOrder(1) },
    { name: 'Listar Pedidos por Email', fn: testGetCustomerOrders }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name}: PASSOU\n`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FALHOU\n`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ERRO - ${error.message}\n`);
      failed++;
    }
  }
  
  console.log('=====================================');
  console.log(`✅ PASSOU: ${passed}`);
  console.log(`❌ FALHOU: ${failed}`);
  console.log(`📊 Taxa de sucesso: ${Math.round((passed / tests.length) * 100)}%`);
  console.log('=====================================');
}

// ==================================
// 📝 COMO USAR
// ==================================
/*

1. Abra o Console do navegador (F12 → Console)

2. Cole todo esse código no console

3. Execute um teste:
   testHealth()
   testGetProducts()
   testGetProduct(1)
   testCalculateShipping()
   testCreateOrder()
   testGetOrder(1)
   testGetCustomerOrders()

4. Ou execute TODOS os testes:
   runAllTests()

5. Veja os resultados no console

*/

// Executar automaticamente ao carregar
console.log('🧪 CDM STORES - TESTE SUITE CARREGADA');
console.log('Execute: runAllTests() para testar tudo');
console.log('Ou individual: testHealth(), testGetProducts(), etc');
