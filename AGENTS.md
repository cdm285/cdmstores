# CDM STORES — Agent Instructions

## Project Layout

| Path                                                  | Purpose                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `d:\cdmstores\` (root)                                | **Frontend** — HTML pages, CSS, JS served via Cloudflare Pages |
| `worker/`                                             | **Backend** — Cloudflare Workers (TypeScript), D1 SQLite, KV   |
| `css/global.css`, `css/desktop.css`, `css/mobile.css` | Styling — see [UI conventions](#ui-conventions)                |
| `js/auth.js`                                          | Auth modal system (login / sign-up)                            |
| `js/script.js`                                        | Page init, hamburger nav, language switcher                    |
| `.github/workflows/deploy.yml`                        | CI/CD — auto-deploys on push to `main`                         |

## Build & Test Commands

Run all commands from `worker/` unless noted.

```bash
# Install
npm ci

# TypeScript check (no emit)
npx tsc --noEmit

# Local dev (wrangler)
npx wrangler dev

# Deploy to production
npx wrangler deploy --env production

# E2E test suite (requires local wrangler dev running on :8787)
node test-suite-e2e.mjs

# Stress / guardian tests
node stress-guardian.mjs

# Production tail logs
npx wrangler tail --env production --format pretty --config D:\cdmstores\worker\wrangler.toml
```

> **Deploy is automatic**: push to `main` → GitHub Actions runs TypeScript check → deploys Worker + Pages. Manual deploy only needed for hotfixes.

## UI Conventions

### Navigation — Desktop

Desktop nav links live inside `<header>` in each HTML page:

```html
<a
  href="#"
  class="nav-link"
  onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')"
  data-i18n="nav.login"
  >Login</a
>
<a
  href="#"
  class="nav-link"
  onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')"
  data-i18n="nav.signup"
  >Sign Up</a
>
```

- **No standalone login icon** in the header. Login/Sign Up are text links in `.nav-links`.
- Cart icon is the only icon in the header (`#menu-cart-btn`).

### Navigation — Mobile (Hamburger Menu)

Mobile nav is an **off-canvas panel** (`#mobile-nav`). The hamburger button (`#hamburger-btn`) is hidden on desktop via CSS (`display: none`) and shown at the mobile breakpoint (`display: flex`).

The hamburger panel **must contain** Login and Sign Up links — they are the mobile equivalent of the desktop nav links:

```html
<nav class="mobile-nav-links" aria-label="Menu mobile">
  <a href="index.html" class="mobile-nav-link">Home</a>
  <a href="#produtos" class="mobile-nav-link">Products</a>
  <a href="#sobre" class="mobile-nav-link">About</a>
  <!-- Login and Sign Up MUST be here -->
  <a
    href="#"
    class="mobile-nav-link"
    onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('login')"
    data-i18n="nav.login"
    >Login</a
  >
  <a
    href="#"
    class="mobile-nav-link"
    onclick="event.preventDefault();window.openAuthModal&&window.openAuthModal('register')"
    data-i18n="nav.signup"
    >Sign Up</a
  >
</nav>
```

Hamburger JS init: `initMobileNav()` in `js/script.js`. Classes toggled: `.is-open` on `#hamburger-btn`, `#mobile-nav`, `#mobile-nav-overlay`.

### Auth Modal System

All login/register UI is a **single dynamically-created modal** (`#auth-modal`) injected by `js/auth.js`:

- `window.openAuthModal('login')` → shows login form
- `window.openAuthModal('register')` → shows register form
- Modal is created lazily on first call (`createAuthModal()`)
- Never add a separate login page — use the modal

### Internationalisation

All user-visible strings use `data-i18n="<key>"` attributes. The language switcher in `js/script.js` applies translations at runtime. Always add `data-i18n` when adding new text elements.

## Backend Conventions

See [worker/README.md](worker/README.md) for full backend docs.

Key rules:

- Secrets via `env.*` (not `process.env.*`)
- PBKDF2 iterations hard-capped at **100 000** in Cloudflare Workers (`crypto.subtle.deriveBits` limit)
- Turnstile validation is **opt-in** (`if (turnstileToken && ...)`) — do not make it mandatory or every signup silently 403s
- D1: `cdmstores` (`a22156d2-037a-400d-9408-d064020b4ca8`), KV: `RATE_LIMIT`, `METRICS`

## Testing Workflow

1. Start local worker: `npx wrangler dev` (in `worker/`)
2. Run E2E suite: `node test-suite-e2e.mjs` (in `worker/`)
3. Visually verify in browser at `http://localhost:8787` + the HTML pages opened from root
4. For UI changes specifically: test hamburger open/close on mobile viewport in DevTools, verify Login/Sign Up links open the auth modal
5. Only deploy after tests pass: `npx wrangler deploy --env production` or push to `main`

## Common Pitfalls

- **Frontend files are at repo root**, not inside `worker/`. Editing `worker/src/` does not affect the HTML pages.
- **Do not duplicate login/signup UI** — the modal (`js/auth.js`) is the single source; nav links only call `window.openAuthModal()`.
- **wrangler.toml** path: when running from repo root use `--config D:\cdmstores\worker\wrangler.toml`.
- **TypeScript** lives only in `worker/src/`. Root JS files (`js/*.js`) are plain ES modules, no build step.
