#!/usr/bin/env node
// check-nav.mjs — CDM Stores nav audit & fix
// Usage:
//   node check-nav.mjs            → audit only (exit 1 if issues)
//   node check-nav.mjs --fix      → audit + fix
//   node check-nav.mjs --fix --deploy → fix + git push to main

import { execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "../../../..");
const FIX = process.argv.includes("--fix");
const DEPLOY = process.argv.includes("--deploy");

// Collect HTML pages from root (skip utility/tool pages and standalone pages with no header nav)
const SKIP = new Set(["audit.html", "guardian.html", "verify-email.html"]);
const htmlFiles = readdirSync(ROOT)
  .filter((f) => f.endsWith(".html") && !SKIP.has(f))
  .map((f) => join(ROOT, f));

// Also check pages/ subdirectory
try {
  readdirSync(join(ROOT, "pages"))
    .filter((f) => f.endsWith(".html"))
    .forEach((f) => htmlFiles.push(join(ROOT, "pages", f)));
} catch {
  /* pages/ may not exist */
}

// Regex patterns — match the exact CDM Stores onclick pattern
const DESKTOP_LOGIN_RE = /class="nav-link"[^>]*openAuthModal\('login'\)/;
const DESKTOP_SIGNUP_RE = /class="nav-link"[^>]*openAuthModal\('register'\)/;
const MOBILE_LOGIN_RE = /class="mobile-nav-link"[^>]*openAuthModal\('login'\)/;
const MOBILE_SIGNUP_RE =
  /class="mobile-nav-link"[^>]*openAuthModal\('register'\)/;

const LOGIN_DESKTOP_LINK = `<a href="#" class="nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')" data-i18n="nav.login">Login</a>`;
const LOGIN_MOBILE_LINK = `<a href="#" class="mobile-nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')" data-i18n="nav.login">Login</a>`;

let totalIssues = 0;
let totalFixed = 0;

console.log(`\nCDM Stores — nav audit (${htmlFiles.length} pages)\n`);

for (const filePath of htmlFiles) {
  const name = filePath.split(/[/\\]/).pop();
  let content = readFileSync(filePath, "utf8");
  const original = content;
  const issues = [];

  if (!DESKTOP_LOGIN_RE.test(content)) issues.push("desktop: missing Login");
  if (!DESKTOP_SIGNUP_RE.test(content)) issues.push("desktop: missing Sign Up");
  if (!MOBILE_LOGIN_RE.test(content)) issues.push("mobile:  missing Login");
  if (!MOBILE_SIGNUP_RE.test(content)) issues.push("mobile:  missing Sign Up");

  if (issues.length === 0) {
    console.log(`  ✓  ${name}`);
    continue;
  }

  console.log(`  ✗  ${name}`);
  issues.forEach((i) => console.log(`       · ${i}`));
  totalIssues += issues.length;

  if (!FIX) continue;

  // Fix desktop: insert Login immediately before the Sign Up nav-link
  if (!DESKTOP_LOGIN_RE.test(content) && DESKTOP_SIGNUP_RE.test(content)) {
    content = content.replace(
      /(<a href="#" class="nav-link" onclick="event\.preventDefault\(\);window\.openAuthModal&&window\.openAuthModal\('register'\)")/,
      `${LOGIN_DESKTOP_LINK}\n                $1`,
    );
  }

  // Fix desktop: both missing — append after the last nav-link inside header-nav
  if (!DESKTOP_LOGIN_RE.test(content) && !DESKTOP_SIGNUP_RE.test(content)) {
    content = content.replace(
      /(<\/nav>\s*(?:<div class="desktop-lang"|<\/div>))/,
      `\n                ${LOGIN_DESKTOP_LINK}\n                <a href="#" class="nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')" data-i18n="nav.signup">Sign Up</a>\n            $1`,
    );
  }

  // Fix mobile: insert Login immediately before the Sign Up mobile-nav-link
  if (!MOBILE_LOGIN_RE.test(content) && MOBILE_SIGNUP_RE.test(content)) {
    content = content.replace(
      /(<a href="#" class="mobile-nav-link" onclick="event\.preventDefault\(\);window\.openAuthModal&&window\.openAuthModal\('register'\)")/,
      `${LOGIN_MOBILE_LINK}\n            $1`,
    );
  }

  // Fix mobile: both missing — append before closing </nav> inside mobile-nav-links
  if (!MOBILE_LOGIN_RE.test(content) && !MOBILE_SIGNUP_RE.test(content)) {
    content = content.replace(
      /(<\/nav>\s*<div class="mobile-nav-footer")/,
      `\n            ${LOGIN_MOBILE_LINK}\n            <a href="#" class="mobile-nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')" data-i18n="nav.signup">Sign Up</a>\n        $1`,
    );
  }

  if (content !== original) {
    writeFileSync(filePath, content, "utf8");
    totalFixed++;
    console.log(`       → fixed`);
  }
}

console.log(`\n── Summary ──────────────────────────────────`);
console.log(`   Pages checked : ${htmlFiles.length}`);
console.log(`   Issues found  : ${totalIssues}`);
if (FIX) console.log(`   Files fixed   : ${totalFixed}`);
console.log(`─────────────────────────────────────────────\n`);

if (totalIssues > 0 && !FIX) {
  console.log("Run with --fix to automatically repair missing links.\n");
  process.exit(1);
}

if (DEPLOY && totalFixed > 0) {
  console.log(
    "Deploying via git push → main (GitHub Actions will deploy to Cloudflare)...\n",
  );
  execSync(
    'git add -A && git commit -m "fix: restore Login/Sign Up links in all nav menus" && git push origin main',
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log(
    "\nPushed. Monitor deploy at https://github.com/cdm285/cdmstores/actions\n",
  );
} else if (DEPLOY && totalFixed === 0) {
  console.log("No changes to deploy.\n");
}
