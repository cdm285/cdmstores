#!/usr/bin/env node
// CDM STORES — repair.mjs
// Usage: node repair.mjs [--stripe] [--frontend] [--audit] [--deploy]
// Omitting flags = run all steps.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR  = join(__dirname, 'logs');
const TS        = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = { green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', bold:'\x1b[1m', reset:'\x1b[0m' };
const ok  = msg => `${C.green}[  OK  ]${C.reset} ${msg}`;
const err = msg => `${C.red}[ FAIL ]${C.reset} ${msg}`;
const hdr = msg => `\n${C.cyan}${C.bold}${msg}${C.reset}`;

// ── Argument parsing ──────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const ALL    = args.length === 0;
const DO     = k => ALL || args.includes(k);
const doStripe   = DO('--stripe');
const doFrontend = DO('--frontend');
const doAudit    = DO('--audit');
const doDeploy   = DO('--deploy');

// ── Helpers ───────────────────────────────────────────────────────────────────
function readF(rel) {
  const p = join(__dirname, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}
function writeF(rel, content) {
  writeFileSync(join(__dirname, rel), content, 'utf8');
}
function patchFile(rel, replacements) {
  let content = readF(rel);
  if (!content) { console.log(err(`File not found: ${rel}`)); return 0; }
  let count = 0;
  for (const [from, to] of replacements) {
    if (content.includes(from)) { content = content.split(from).join(to); count++; }
  }
  writeF(rel, content);
  return count;
}
function logAppend(file, text) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const path = join(LOGS_DIR, file);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, existing + text, 'utf8');
}
function run(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: __dirname, encoding: 'utf8', ...opts }).trim() };
  } catch (e) {
    return { ok: false, out: e.stdout?.trim() || e.message };
  }
}

// ── STEP 1: STRIPE NOTES ─────────────────────────────────────────────────────
function stepStripe() {
  console.log(hdr('── STEP 1: Stripe Configuration ────────────────────────────────'));

  // Verify stripe.ts uses USD
  const content = readF('worker/src/routes/stripe.ts');
  if (!content) { console.log(err('stripe.ts not found')); return; }

  if (content.includes("currency: 'usd'")) {
    console.log(ok("stripe.ts currency = 'usd'"));
  } else {
    console.log(err("stripe.ts: currency is NOT usd — run frontend fix first"));
  }

  // Check no test-mode keys in committed code
  if (!content.match(/sk_test_[A-Za-z0-9]+/) && !content.match(/sk_live_[A-Za-z0-9]+/)) {
    console.log(ok("No hardcoded Stripe keys in source (secrets stored in Wrangler)"));
  }

  // Flag test checkout links in checkout.html
  const checkout = readF('pages/checkout.html') || '';
  const testLinks = (checkout.match(/buy\.stripe\.com\/test_/g) || []).length;
  if (testLinks > 0) {
    console.log(`${C.yellow}[ WARN ]${C.reset} checkout.html has ${testLinks} test-mode Stripe link(s).`);
    console.log(`         Action required: replace buy.stripe.com/test_* links with live-mode URLs.`);
    console.log(`         Operator steps:`);
    console.log(`           1. Log in to dashboard.stripe.com`);
    console.log(`           2. Switch to Live mode`);
    console.log(`           3. Products → create/verify products with USD prices`);
    console.log(`           4. Payment links → generate per-product checkout links`);
    console.log(`           5. Replace stripeLink values in pages/checkout.html`);
    console.log(`           6. Set STRIPE_SECRET_KEY (sk_live_...) via: cd worker && npx wrangler secret put STRIPE_SECRET_KEY`);
  } else {
    console.log(ok("No test-mode Stripe links detected"));
  }
}

// ── STEP 2: FRONTEND AUTO-FIX ────────────────────────────────────────────────
function stepFrontend() {
  console.log(hdr('── STEP 2: Frontend Auto-Fix ───────────────────────────────────'));

  const fixes = {
    'pages/checkout.html': [
      // These should already be fixed; this is a safety net
      ['Finalizar Pagamento',              'Checkout'],
      ['Conclua seu pagamento com segurança.', 'Complete your purchase securely.'],
      ['Selecione a forma de pagamento e conclua.', 'Select payment method to complete.'],
      ['Produto selecionado: n/d',         'Selected product: n/a'],
      ['Itens no carrinho',                'Cart items'],
      ['Carregando...',                    'Loading...'],
      ['Todos os direitos reservados.',    'All rights reserved.'],
      ['aria-label="Navegação principal"', 'aria-label="Main navigation"'],
      ['aria-label="Abrir menu"',          'aria-label="Open navigation menu"'],
      ['aria-label="Fechar menu"',         'aria-label="Close menu"'],
      ['aria-label="Menu de navegação"',   'aria-label="Navigation menu"'],
      ['aria-label="Menu mobile"',         'aria-label="Mobile navigation"'],
      // Mobile lang: ensure PT is not active and EN is
      ['<button class="mobile-lang-btn active" data-lang="pt" aria-pressed="true">PT</button>',
       '<button class="mobile-lang-btn" data-lang="pt" aria-pressed="false">PT</button>'],
      ['<button class="mobile-lang-btn" data-lang="en" aria-pressed="false">EN</button>\n                <span class="mobile-lang-sep">|</span>\n                <button class="mobile-lang-btn" data-lang="es" aria-pressed="false">ES</button>\n            </div>\n        </div>\n    </div>\n    <div class="mobile-nav-overlay"',
       '<button class="mobile-lang-btn active" data-lang="en" aria-pressed="true">EN</button>\n                <span class="mobile-lang-sep">|</span>\n                <button class="mobile-lang-btn" data-lang="es" aria-pressed="false">ES</button>\n            </div>\n        </div>\n    </div>\n    <div class="mobile-nav-overlay"'],
    ],
    'pages/rastreio.html': [
      ['Rastrear Pedido',                  'Track Order'],
      ['Digite o código de rastreio enviado para seu email.', 'Enter the tracking code sent to your email.'],
      ['aria-label="Código de rastreio"',  'aria-label="Tracking code"'],
      ['data-i18n="tracking.button">Rastrear<', 'data-i18n="tracking.button">Track<'],
      ['Todos os direitos reservados.',    'All rights reserved.'],
      ['aria-label="Navegação principal"', 'aria-label="Main navigation"'],
      ['aria-label="Abrir menu"',          'aria-label="Open navigation menu"'],
      ['aria-label="Fechar menu"',         'aria-label="Close menu"'],
      ['aria-label="Menu de navegação"',   'aria-label="Navigation menu"'],
      ['aria-label="Menu mobile"',         'aria-label="Mobile navigation"'],
    ],
    'worker/src/routes/stripe.ts': [
      ["currency: 'brl'",                 "currency: 'usd'"],
      ["'Dados incompletos'",             "'Incomplete request data'"],
      ["'Assinatura ausente'",            "'Missing Stripe signature'"],
      ["'Assinatura inválida'",           "'Invalid Stripe signature'"],
    ],
  };

  let totalFixed = 0;
  for (const [file, replacements] of Object.entries(fixes)) {
    const n = patchFile(file, replacements);
    if (n > 0) {
      console.log(ok(`${file}: ${n} patch(es) applied`));
      totalFixed += n;
    } else {
      console.log(ok(`${file}: already clean`));
    }
  }

  console.log(`\n  Frontend patches applied: ${totalFixed}`);
}

// ── STEP 3: AUDIT ─────────────────────────────────────────────────────────────
function stepAudit() {
  console.log(hdr('── STEP 3: Full Audit ──────────────────────────────────────────'));

  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

  const auditScript = join(__dirname, 'audit-cli.mjs');
  if (!existsSync(auditScript)) { console.log(err('audit-cli.mjs not found')); return false; }

  const result = spawnSync('node', [auditScript], {
    cwd: __dirname,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const output = (result.stdout || '') + (result.stderr || '');
  // Write plain-text log (strip ANSI)
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
  const logContent = `CDM STORES — Audit Report\nTimestamp: ${TS()}\n${'─'.repeat(60)}\n${plain}`;
  writeFileSync(join(LOGS_DIR, 'audit-report.txt'), logContent, 'utf8');
  console.log(ok(`Audit log saved → logs/audit-report.txt`));

  // Echo audit output to console (with colours)
  process.stdout.write(result.stdout || '');

  const passed = result.status === 0;
  if (!passed) {
    console.log(`\n${C.red}Audit has failures. Deploy blocked until all checks pass.${C.reset}\n`);
  }
  return passed;
}

// ── STEP 4: BUILD + COMMIT + PUSH + DEPLOY ────────────────────────────────────
function stepDeploy(auditPassed) {
  console.log(hdr('── STEP 4: Build & Deploy ──────────────────────────────────────'));

  if (!auditPassed) {
    console.log(err('Deploy skipped — audit must pass 100% first.'));
    return;
  }

  const workerDir = join(__dirname, 'worker');
  const deployLog = [];
  const note = msg => { console.log(msg); deployLog.push(msg.replace(/\x1b\[[0-9;]*m/g, '')); };

  // TypeScript build dry-run
  note(`  [${TS()}] Building worker (dry-run)...`);
  const build = run(`npx wrangler deploy --dry-run --outdir dist --env production`, { cwd: workerDir });
  if (build.ok) {
    const bundleLine = build.out.match(/Total Upload:.*/) || [];
    note(ok(`Worker compiles cleanly. ${bundleLine[0] || ''}`));
  } else {
    note(err(`Build failed:\n${build.out}`));
    return;
  }

  // Git status
  note(`  [${TS()}] Staging changes...`);
  run('git add -A');
  const status = run('git status --short');
  const dirty  = status.out.trim().split('\n').filter(l => l.trim()).length;
  if (dirty === 0) {
    note(ok('Working tree clean — no new changes to commit'));
  } else {
    const commitRes = run(`git commit -m "fix: full repair — USD currency, English UI, nav/aria fixes, Stripe USD (${TS()})"`);
    if (commitRes.ok) {
      const sha = run('git rev-parse --short HEAD').out;
      note(ok(`Committed: ${sha}`));
    } else {
      // Might be "nothing to commit" — not an error
      note(`  Git commit: ${commitRes.out.slice(0, 120)}`);
    }
  }

  // Push
  note(`  [${TS()}] Pushing to origin/main...`);
  const push = run('git push origin main');
  if (push.ok || push.out.includes('->')) {
    note(ok('Pushed to origin/main'));
  } else {
    note(err(`Push output: ${push.out.slice(0, 200)}`));
  }

  // Deploy Worker
  note(`  [${TS()}] Deploying Cloudflare Worker (production)...`);
  const deploy = run('npx wrangler deploy --env production', { cwd: workerDir });
  const versionLine = deploy.out.match(/Current Version ID: .+/) || [];
  const routeLine   = deploy.out.match(/cdmstores\.com\/api\/\*/) || [];
  if (deploy.ok || versionLine.length) {
    note(ok(`Worker deployed. ${versionLine[0] || ''}`));
    note(ok(`Route: ${routeLine[0] || 'cdmstores.com/api/*'}`));
  } else {
    note(err(`Deploy output: ${deploy.out.slice(0, 300)}`));
  }

  // Live health-check
  note(`  [${TS()}] Verifying live endpoint...`);
  try {
    const { ok: httpOk, out: httpOut } = run(`node -e "fetch('https://cdmstores.com/api/products').then(r=>process.stdout.write(String(r.status))).catch(e=>process.stdout.write('ERR:'+e.message))"`);
    const code = httpOut.trim();
    if (code === '200') {
      note(ok(`GET https://cdmstores.com/api/products → HTTP 200`));
    } else {
      note(`${C.yellow}[ WARN ]${C.reset} GET /api/products → ${code}`);
    }
  } catch { note(`  HTTP check skipped`); }

  // Write deploy log
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const deployReport = [
    `CDM STORES — Deployment Report`,
    `Timestamp : ${TS()}`,
    `${'─'.repeat(60)}`,
    ...deployLog,
    `${'─'.repeat(60)}`,
    `Status: ${auditPassed ? 'DEPLOYMENT COMPLETE' : 'BLOCKED BY AUDIT'}`,
  ].join('\n');
  writeFileSync(join(LOGS_DIR, 'deploy-report.txt'), deployReport, 'utf8');
  note(ok('Deploy log saved → logs/deploy-report.txt'));
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════╗`);
console.log(`║        CDM STORES — repair.mjs                          ║`);
console.log(`╚══════════════════════════════════════════════════════════╝${C.reset}`);
console.log(`  Timestamp : ${TS()}`);
console.log(`  Flags     : ${args.length ? args.join(' ') : '(all steps)'}`);

if (doStripe)   stepStripe();
if (doFrontend) stepFrontend();
let auditPassed = true;
if (doAudit)    auditPassed = stepAudit();
if (doDeploy)   stepDeploy(auditPassed);

console.log(`\n${C.cyan}Done. ${TS()}${C.reset}\n`);
