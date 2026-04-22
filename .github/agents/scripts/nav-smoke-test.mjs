#!/usr/bin/env node
// nav-smoke-test.mjs — Playwright smoke test for CDM Stores nav
// Tests: desktop nav Login/Sign Up links, hamburger open/close, modal opens
// Run: node .github/agents/scripts/nav-smoke-test.mjs [baseUrl]

import { resolve } from "path";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:8787";
const ROOT = resolve(import.meta.dirname, "../../..");
// Test local HTML files directly when not testing via wrangler
const INDEX = BASE.startsWith("http")
  ? `${BASE}/`
  : `file://${ROOT}/index.html`;

let pass = 0,
  fail = 0;

function log(name, ok, detail = "") {
  const mark = ok ? "  PASS" : "  FAIL";
  console.log(`${mark}  ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await ctx.newPage();

try {
  // ── Desktop tests ──────────────────────────────────────────────
  await page.goto(INDEX, { waitUntil: "domcontentloaded", timeout: 15000 });

  // Desktop Login link
  const desktopLogin = page
    .locator('nav.header-nav a.nav-link[data-i18n="nav.login"]')
    .first();
  log("Desktop nav — Login link exists", (await desktopLogin.count()) > 0);

  // Desktop Sign Up link
  const desktopSignup = page
    .locator('nav.header-nav a.nav-link[data-i18n="nav.signup"]')
    .first();
  log("Desktop nav — Sign Up link exists", (await desktopSignup.count()) > 0);

  // Clicking Login opens auth modal
  if ((await desktopLogin.count()) > 0) {
    await desktopLogin.click();
    await page.waitForTimeout(400);
    const modalVisible =
      (await page
        .locator('#auth-modal.active, #auth-modal[style*="display: block"]')
        .count()) > 0 ||
      (await page
        .locator("#auth-modal")
        .evaluate(
          (el) =>
            el.classList.contains("active") || el.style.display !== "none",
        )
        .catch(() => false));
    log("Login link — opens auth modal", modalVisible);
    // Close modal
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // ── Mobile / hamburger tests ───────────────────────────────────
  await ctx.newPage().close();
  const mobilePage = await ctx.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto(INDEX, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Hamburger visible at mobile viewport
  const hamburger = mobilePage.locator("#hamburger-btn");
  const hVisible = await hamburger.isVisible().catch(() => false);
  log("Hamburger button — visible on mobile", hVisible);

  // Hamburger click opens nav panel
  if (hVisible) {
    await hamburger.click();
    await mobilePage.waitForTimeout(500);
    const panelOpen =
      (await mobilePage.locator("#mobile-nav.is-open").count()) > 0;
    log("Hamburger click — opens nav panel", panelOpen);

    // Mobile Login link inside panel
    const mobileLogin = mobilePage.locator(
      '#mobile-nav a.mobile-nav-link[data-i18n="nav.login"]',
    );
    log("Mobile panel — Login link exists", (await mobileLogin.count()) > 0);

    // Mobile Sign Up link inside panel
    const mobileSignup = mobilePage.locator(
      '#mobile-nav a.mobile-nav-link[data-i18n="nav.signup"]',
    );
    log("Mobile panel — Sign Up link exists", (await mobileSignup.count()) > 0);

    // Clicking mobile Login opens modal
    if ((await mobileLogin.count()) > 0) {
      await mobileLogin.click();
      await mobilePage.waitForTimeout(500);
      const mModalVisible = await mobilePage
        .locator("#auth-modal")
        .evaluate(
          (el) =>
            el.classList.contains("active") ||
            getComputedStyle(el).display !== "none",
        )
        .catch(() => false);
      log("Mobile Login link — opens auth modal", mModalVisible);
    }
  }

  await mobilePage.close();
} catch (err) {
  log("Smoke test runtime", false, err.message);
} finally {
  await browser.close();
}

console.log(`\n── Result: ${pass} passed, ${fail} failed ──`);
if (fail > 0) {
  console.log("FAIL — do not deploy until all tests pass.");
  process.exit(1);
} else {
  console.log("PASS — nav smoke tests green.");
}
