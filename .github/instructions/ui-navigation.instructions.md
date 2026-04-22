---
applyTo: "**/*.html,css/**,js/**"
description: "CDM Stores UI conventions — hamburger menu, navigation, login/signup modal, auth patterns. Use when editing HTML pages, CSS, or frontend JS."
---

# UI & Navigation Conventions

## Header Structure (all HTML pages)

Each page header follows this pattern:

```
<header>
  <nav>
    <logo>          ← .nav-logo
    <desktop-links> ← .nav-links (hidden on mobile)
      Login link    ← calls window.openAuthModal('login')
      Sign Up link  ← calls window.openAuthModal('register')
    </desktop-links>
    <cart-button>   ← #menu-cart-btn (icon only)
    <hamburger>     ← #hamburger-btn (mobile only, display:none on desktop)
  </nav>
</header>
<mobile-nav panel>  ← #mobile-nav (off-canvas, contains Login + Sign Up)
<overlay>           ← #mobile-nav-overlay
```

**Rule**: The header must NOT contain a standalone login icon. Login/Sign Up are text links (`.nav-link`) on desktop and `.mobile-nav-link` entries inside `#mobile-nav` on mobile.

## Hamburger Menu Checklist

When modifying navigation:

- [ ] Desktop nav (`.nav-links`) has Login and Sign Up text links
- [ ] Mobile panel (`#mobile-nav > .mobile-nav-links`) has Login and Sign Up as `.mobile-nav-link`
- [ ] Both call `window.openAuthModal('login')` / `window.openAuthModal('register')`
- [ ] Hamburger button is `display:none` in `css/global.css`, `display:flex` in `css/mobile.css`
- [ ] `initMobileNav()` in `js/script.js` manages open/close with `.is-open` class
- [ ] Overlay (`#mobile-nav-overlay`) exists and closes the nav on click

## Auth Modal Rules

- **Single modal** created dynamically by `js/auth.js` → `createAuthModal()`
- Trigger from anywhere: `window.openAuthModal('login')` or `window.openAuthModal('register')`
- Never create a separate login page or a second modal
- When a user is logged in, auth.js replaces the Login/Sign Up links with a user menu (`.nav-user`)

## CSS Breakpoints

The project uses **CSS file separation** (no media queries inside a single file):

| File | Scope |
|------|-------|
| `css/global.css` | Base styles, desktop defaults |
| `css/desktop.css` | Desktop-specific overrides |
| `css/mobile.css` | Mobile overrides (loaded via `<link media="...">` or always included) |

Hamburger visibility:
```css
/* global.css */
.hamburger { display: none; }

/* mobile.css */
.hamburger { display: flex; }
```

## i18n

Every user-visible text node must have `data-i18n="<key>"`. Keys are defined in `js/script.js` in the translations object. Nav keys: `nav.home`, `nav.products`, `nav.sobre`, `nav.login`, `nav.signup`.
