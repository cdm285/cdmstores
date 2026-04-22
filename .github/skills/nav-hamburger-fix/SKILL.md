---
name: nav-hamburger-fix
description: "Audit and fix CDM Stores navigation. Use when: Login or Sign Up links are missing from the desktop nav or hamburger mobile panel; after adding a new HTML page; before deploying. Checks all HTML pages for correct Login + Sign Up placement and repairs them automatically."
argument-hint: "--fix to repair, --fix --deploy to repair and push to main"
---

# Nav Hamburger Fix

Audits every HTML page in the project root for the required Login and Sign Up nav links, reports issues, and optionally repairs them and deploys.

## When to Use

- Login/Sign Up missing from desktop nav or hamburger panel on any page
- Adding a new HTML page (run audit after)
- Before any deploy involving HTML changes

## Required Pattern

Every page must have **both** links in **both** locations:

**Desktop** (inside `<nav class="header-nav">`):
```html
<a href="#" class="nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')" data-i18n="nav.login">Login</a>
<a href="#" class="nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')" data-i18n="nav.signup">Sign Up</a>
```

**Mobile** (inside `<nav class="mobile-nav-links">`):
```html
<a href="#" class="mobile-nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')" data-i18n="nav.login">Login</a>
<a href="#" class="mobile-nav-link" onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')" data-i18n="nav.signup">Sign Up</a>
```

## Procedure

### 1. Audit only
```bash
node .github/skills/nav-hamburger-fix/scripts/check-nav.mjs
```
Prints ✓ / ✗ per file. Exit code 1 if issues found.

### 2. Audit + Fix
```bash
node .github/skills/nav-hamburger-fix/scripts/check-nav.mjs --fix
```
Inserts missing Login link immediately before the Sign Up link.

### 3. Audit + Fix + Deploy
```bash
node .github/skills/nav-hamburger-fix/scripts/check-nav.mjs --fix --deploy
```
Commits fixed files and pushes to `main` — GitHub Actions auto-deploys.

## Agent Steps

When invoked, the agent must:

1. Run the audit script (no args) → read output
2. If issues found: run with `--fix` → confirm files changed
3. Re-run audit to verify zero issues remain
4. If `--deploy` requested: run with `--fix --deploy`
5. Report: files checked, issues found, files fixed, deploy status
