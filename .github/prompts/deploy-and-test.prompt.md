---
name: deploy-and-test
description: "Run full test suite and deploy to production. Use when: ready to ship, after UI changes, after backend changes, when you need to test-then-deploy."
---

# Test → Deploy Workflow

## Steps

### 1. TypeScript check (backend)
```bash
cd worker && npx tsc --noEmit
```
Fix all errors before continuing.

### 2. Start local worker
```bash
cd worker && npx wrangler dev
```
Worker will be at `http://localhost:8787`.

### 3. Run E2E test suite
```bash
cd worker && node test-suite-e2e.mjs
```
All tests must pass. If tests fail, fix the issue and re-run from step 1.

### 4. Manual UI verification (for frontend changes)

Open `index.html` in browser (or via local server). Verify:
- [ ] Desktop nav shows Login and Sign Up text links
- [ ] Clicking Login opens auth modal (sign-in form)
- [ ] Clicking Sign Up opens auth modal (register form)
- [ ] Hamburger button visible at mobile viewport (≤768px)
- [ ] Opening hamburger shows Login and Sign Up links
- [ ] Clicking Login/Sign Up from hamburger opens auth modal and closes nav
- [ ] Hamburger animates to X when open, back to three lines when closed

### 5. Deploy

**Automatic** (preferred): Push to `main` branch. GitHub Actions runs TypeScript check + deploys Worker + Pages automatically.

**Manual** (hotfix):
```bash
cd worker && npx wrangler deploy --env production
```

### 6. Verify production

```bash
# Tail live logs
npx wrangler tail --env production --format pretty --config D:\cdmstores\worker\wrangler.toml

# Health check
curl https://cdmstores.com/health
```

Check the browser at `https://cdmstores.com` — repeat the UI verification checklist from step 4.

## Only stop when

- TypeScript has zero errors
- E2E test suite passes (all green)
- UI manual checklist complete (all checkboxes)
- Production health check returns 200
- Login and Sign Up are accessible on both desktop nav and mobile hamburger menu
