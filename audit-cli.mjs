// CDM STORES — Pre-Deploy Audit CLI
// Usage: node audit-cli.mjs
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

function readFile(f) {
  const p = join(__dirname, f);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

const results = [];
function chk(label, file, pattern, shouldMatch = true) {
  const content = readFile(file);
  if (content === null) {
    results.push({ status: 'FAIL', label, reason: `File not found: ${file}` });
    return;
  }
  const matched = pattern.test(content);
  const pass = (shouldMatch && matched) || (!shouldMatch && !matched);
  results.push({ status: pass ? 'OK' : 'FAIL', label, reason: pass ? '' : `shouldMatch=${shouldMatch}, pattern=${pattern}` });
}

// ── [1] Navigation ────────────────────────────────────────────────────────
chk('EN default lang (index.html)',     'index.html',              /lang="en"/);
chk('#sobre section exists',           'index.html',              /id="sobre"/);
chk('#contato section exists',         'index.html',              /id="contato"/);
chk('Main navigation aria-label',      'index.html',              /Main navigation/);

// ── [2] Currency / USD ────────────────────────────────────────────────────
chk('No R$ in index.html',             'index.html',              /R\$/, false);
chk('USD promo bar ($199)',             'index.html',              /\$199/);
chk('No R$ in checkout.html',          'pages/checkout.html',     /R\$/, false);
chk('No R$ in frontend-integration',   'frontend-integration.js', /R\$/, false);

// ── [3] Authentication ────────────────────────────────────────────────────
chk('Sign In button (auth.js)',         'js/auth.js',              /Sign In/);
chk('Create Account (auth.js)',         'js/auth.js',              /Create Account/);
chk('Continue with Google (auth.js)',   'js/auth.js',              /Continue with Google/);
chk('Country default: United States',  'js/auth.js',              /United States/);
chk('No CEP/BR validation in auth.js', 'js/auth.js',              /cep|CEP/, false);

// ── [4] Chatbot / Payment methods ────────────────────────────────────────
chk('No PIX in chatbot.js',            'js/chatbot.js',           /PIX|Pix/, false);
chk('No PIX in script.js',            'js/script.js',            /PIX|Pix/, false);
chk('No Boleto in index.html',         'index.html',              /[Bb]oleto/, false);

// ── [5] Stripe ────────────────────────────────────────────────────────────
chk('Pay with Stripe button',          'pages/checkout.html',     /Pay with Stripe/);
chk('Stripe.js loaded',                'pages/checkout.html',     /js\.stripe\.com/);
chk('No PayPal in checkout',           'pages/checkout.html',     /[Pp]ay[Pp]al/, false);

// ── [6] Shipping logic ────────────────────────────────────────────────────
chk('Free shipping at subtotal >= 199','frontend-integration.js', /subtotal >= 199/);
chk('Shipping fallback $9.99',         'frontend-integration.js', /9\.99/);
chk('No hardcoded R$ 15',             'frontend-integration.js', /R\$\s*15/, false);

// ── [7] Responsiveness ────────────────────────────────────────────────────
chk('mobile.css linked',               'index.html',              /mobile\.css/);
chk('Viewport meta tag',               'index.html',              /name="viewport"/);

// ── [8] i18n ─────────────────────────────────────────────────────────────
chk("detectLang() returns 'en'",       'js/script.js',            /return ['"]en['"]/);
chk('EN lang button active (index)',   'index.html',              /data-lang="en"/);
chk('EN lang active (checkout)',       'pages/checkout.html',     /data-lang="en"/);

// ── [9] Security ─────────────────────────────────────────────────────────
chk('No inline Stripe secret (index)', 'index.html',              /sk_live|sk_test|whsec_/, false);
chk('No inline secret (auth.js)',      'js/auth.js',              /sk_live|sk_test/, false);
chk('HTTPS API base URL',              'js/auth.js',              /https:\/\/cdmstores\.com\/api/);
chk('Fetch uses credentials:include',  'js/auth.js',              /credentials['":\s]+include/);
// ── [+] Additional deep checks ────────────────────────────────────────────
chk('checkout.html: no Portuguese h1',        'pages/checkout.html',     /Finalizar Pagamento/, false);
chk('checkout.html: no Portuguese nav links', 'pages/checkout.html',     /In\u00edcio|Produtos|Rastreio|Fechar menu|Abrir menu|Idioma/, false);
chk('checkout.html: productData closing };',  'pages/checkout.html',     /stripeLink.*\}\s*\}\s*;/);
chk('checkout.html: EN mobile lang default',  'pages/checkout.html',     /mobile-lang-btn active.*data-lang="en"/);
chk('rastreio.html: no Portuguese fallback',  'pages/rastreio.html',     /Rastrear Pedido|Rastrear"/, false);
chk('rastreio.html: EN mobile lang default',  'pages/rastreio.html',     /mobile-lang-btn active.*data-lang="en"/);
chk('stripe.ts: currency USD',                'worker/src/routes/stripe.ts', /currency.*usd/);
chk('stripe.ts: no BRL currency',             'worker/src/routes/stripe.ts', /currency.*brl/, false);
chk('stripe.ts: English error messages',      'worker/src/routes/stripe.ts', /Dados incompletos|Assinatura/, false);
// ── Report ────────────────────────────────────────────────────────────────
const ok   = results.filter(r => r.status === 'OK').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
console.log(`${CYAN}╔═══════════════════════════════════════════════════╗${RESET}`);
console.log(`${CYAN}║    CDM STORES — Pre-Deploy Audit Report           ║${RESET}`);
console.log(`${CYAN}╚═══════════════════════════════════════════════════╝${RESET}`);
console.log(`  Timestamp : ${ts}`);
console.log('');

const cats = [
  { name: '[1] Navigation',          from: 0,  count: 4 },
  { name: '[2] Currency/USD',        from: 4,  count: 4 },
  { name: '[3] Authentication',      from: 8,  count: 5 },
  { name: '[4] Chatbot/Payment',     from: 13, count: 3 },
  { name: '[5] Stripe',              from: 16, count: 3 },
  { name: '[6] Shipping Logic',      from: 19, count: 3 },
  { name: '[7] Responsiveness',      from: 22, count: 2 },
  { name: '[8] i18n',                from: 24, count: 3 },
  { name: '[9] Security',            from: 27, count: 4 },
  { name: '[+] Deep page checks',    from: 31, count: 9 },
];

for (const cat of cats) {
  console.log(`  ${YELLOW}${cat.name}${RESET}`);
  const slice = results.slice(cat.from, cat.from + cat.count);
  for (const r of slice) {
    if (r.status === 'OK') {
      console.log(`    ${GREEN}[  OK  ]${RESET} ${r.label}`);
    } else {
      console.log(`    ${RED}[ FAIL ]${RESET} ${r.label}`);
      if (r.reason) console.log(`             ${RED}${r.reason}${RESET}`);
    }
  }
}

console.log('');
const scoreColor = fail === 0 ? GREEN : RED;
console.log(`  ${scoreColor}SCORE: ${ok} / ${ok + fail} checks passed${RESET}`);
if (fail === 0) {
  console.log(`  ${GREEN}All checks passed. Ready for deployment.${RESET}`);
} else {
  console.log(`  ${RED}${fail} check(s) failed. Resolve above before deploying.${RESET}`);
}
console.log('');

// Machine-readable exit code for CI
process.exit(fail === 0 ? 0 : 1);
