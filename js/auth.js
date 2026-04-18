/**
 * CDM STORES - Sistema de Autenticação
 * Login, Registro Completo (com endereço) e OAuth Google/Facebook
 */

const API_BASE = 'https://cdmstores.com/api';
let currentUser = null;
// [ALTA-14] Tokens não são armazenados em localStorage.
// Sessão gerenciada pelo backend via cookies HttpOnly (credentials: 'include').

class AuthSystem {
  constructor() {
    this.loadUser().then(() => this.initAuthUI());
  }

  /* ────────────────────────────────────────────────────────────────
   * Carregar sessão via cookie seguro
   * ──────────────────────────────────────────────────────────────── */
  async loadUser() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          currentUser = data.user;
          this.updateUIForLoggedIn();
        }
      }
    } catch (_) {
      // Not authenticated — normal on first load
    }
  }

  /* ────────────────────────────────────────────────────────────────
   * Inicializar UI
   * ──────────────────────────────────────────────────────────────── */
  initAuthUI() {
    this.injectStyles();
    this.createUserButton();
    this.createAuthModal();
  }

  /* ────────────────────────────────────────────────────────────────
   * CSS
   * ──────────────────────────────────────────────────────────────── */
  injectStyles() {
    if (document.getElementById('auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'auth-styles';
    style.innerHTML = `
      /* ── FAB Container ─────────────────────────────────────── */
      .fab-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: flex-end;
      }
      .fab {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .fab:hover { transform: scale(1.1); box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
      .fab-login { background: linear-gradient(135deg,#00AFFF,#9B4DFF); color: white; }
      .fab-chat  { background: linear-gradient(135deg,#FF6B6B,#FF8E53); color: white; }
      @media (max-width: 768px) {
        .fab { width: 50px; height: 50px; font-size: 20px; }
      }

      /* ── Auth Modal ────────────────────────────────────────── */
      .auth-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 10000;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .auth-modal.active { display: flex; }

      .auth-modal-content {
        background: #fff;
        border-radius: 14px;
        padding: 32px 28px 28px;
        max-width: 476px;
        width: 100%;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.22);
        position: relative;
        scrollbar-width: thin;
      }
      .auth-modal-close {
        position: absolute;
        top: 14px;
        right: 18px;
        background: none;
        border: none;
        font-size: 26px;
        cursor: pointer;
        color: #9ca3af;
        line-height: 1;
        padding: 4px;
        z-index: 1;
      }
      .auth-modal-close:hover { color: #374151; }

      /* ── Form ──────────────────────────────────────────────── */
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .auth-form h2 {
        text-align: center;
        color: #111827;
        margin-bottom: 14px;
        font-size: 1.4rem;
        font-weight: 700;
      }
      .auth-section-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #9ca3af;
        margin: 10px 0 2px;
        padding-top: 6px;
        border-top: 1px solid #f3f4f6;
      }
      .auth-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .auth-form input,
      .auth-form select {
        padding: 11px 13px;
        border: 1.5px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        width: 100%;
        font-family: inherit;
        background: #fff;
        color: #111;
        transition: border-color 0.18s, box-shadow 0.18s;
      }
      .auth-form input:focus,
      .auth-form select:focus {
        outline: none;
        border-color: #00AFFF;
        box-shadow: 0 0 0 3px rgba(0,175,255,0.12);
      }
      .auth-form input.input-error { border-color: #ef4444; }
      .auth-form button[type="submit"] {
        padding: 13px;
        background: linear-gradient(135deg,#00AFFF,#9B4DFF);
        color: #fff;
        border: none;
        border-radius: 9px;
        font-weight: 700;
        cursor: pointer;
        font-size: 15px;
        margin-top: 6px;
        transition: opacity 0.2s;
        font-family: inherit;
      }
      .auth-form button[type="submit"]:hover { opacity: 0.88; }
      .auth-toggle {
        text-align: center;
        margin-top: 12px;
        font-size: 13.5px;
        color: #6b7280;
      }
      .auth-toggle button {
        background: none;
        color: #00AFFF;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
        font-size: inherit;
      }
      .auth-error {
        color: #dc2626;
        font-size: 13px;
        padding: 10px 12px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 7px;
        text-align: center;
      }
      .auth-success {
        color: #059669;
        font-size: 13px;
        padding: 10px 12px;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: 7px;
        text-align: center;
      }
      .auth-password-strength {
        font-size: 12px;
        min-height: 18px;
        padding: 2px 0;
      }
      .strength-weak   { color: #ef4444; }
      .strength-medium { color: #f59e0b; }
      .strength-strong { color: #10b981; }

      /* ── OAuth ─────────────────────────────────────────────── */
      .auth-or-divider {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #c4c7cf;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        margin: 4px 0;
      }
      .auth-or-divider::before, .auth-or-divider::after {
        content: ''; flex: 1; height: 1px; background: #e5e7eb;
      }
      .oauth-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 11px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        margin-bottom: 6px;
        font-family: inherit;
      }
      .oauth-btn-google { background:#fff; color:#333; border:1.5px solid #e5e7eb; }
      .oauth-btn-google:hover { background:#f9fafb; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
      .oauth-btn-facebook { background:#1877F2; color:#fff; border:none; }
      .oauth-btn-facebook:hover { background:#1560cc; }

      /* ── User Panel ────────────────────────────────────────── */
      .user-panel {
        position: fixed;
        top: 120px;
        right: 20px;
        background: #fff;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        padding: 14px;
        z-index: 9999;
        display: none;
        min-width: 200px;
        border: 1px solid #e5e7eb;
      }
      .user-panel.active { display: block; }
      .user-panel-header {
        font-weight: 600;
        font-size: 14px;
        color: #111;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid #e5e7eb;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-panel-item {
        padding: 8px 4px;
        cursor: pointer;
        color: #374151;
        font-size: 13.5px;
        border-radius: 6px;
        transition: color 0.15s;
      }
      .user-panel-item:hover { color: #00AFFF; }
      .user-panel-logout { border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 8px; }
    `;
    document.head.appendChild(style);
  }

  /* ────────────────────────────────────────────────────────────────
   * Criar FAB de Login
   * ──────────────────────────────────────────────────────────────── */
  createFloatingButtons() {
    let container = document.getElementById('fab-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fab-container';
      container.className = 'fab-container';
      document.body.appendChild(container);
    }
    if (document.getElementById('fab-login')) return;
    const loginFab = document.createElement('button');
    loginFab.id = 'fab-login';
    loginFab.className = 'fab fab-login';
    loginFab.title = 'Entrar / Login';
    loginFab.setAttribute('aria-label', 'Abrir login');
    loginFab.innerHTML = '👤';
    loginFab.addEventListener('click', () => {
      document.getElementById('auth-modal')?.classList.add('active');
    });
    container.appendChild(loginFab);
  }

  createUserButton() { return; }

  isMobile() { return window.innerWidth <= 768; }

  /* ────────────────────────────────────────────────────────────────
   * Botões OAuth HTML
   * ──────────────────────────────────────────────────────────────── */
  createOAuthButtons(formPrefix) {
    const gSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;
    const fSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
    return `
      <div class="auth-or-divider">OR</div>
      <button type="button" id="google-${formPrefix}-btn" class="oauth-btn oauth-btn-google">
        ${gSvg} Continue with Google
      </button>
      <button type="button" id="facebook-${formPrefix}-btn" class="oauth-btn oauth-btn-facebook">
        ${fSvg} Continue with Facebook
      </button>
    `;
  }

  /* ────────────────────────────────────────────────────────────────
   * Modal de Autenticação (Login + Registro Completo)
   * ──────────────────────────────────────────────────────────────── */
  createAuthModal() {
    if (document.getElementById('auth-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'auth-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Autenticação');

    modal.innerHTML = `
      <div class="auth-modal-content">
        <button class="auth-modal-close" aria-label="Fechar">&times;</button>

        <!-- ═══ LOGIN ═══ -->
        <form class="auth-form" id="login-form" style="display:block;">
          <h2>Sign In</h2>
          <div id="login-error" role="alert"></div>
          <input type="email" id="login-email" name="email" placeholder="Email" required autocomplete="email">
          <input type="password" id="login-password" name="password" placeholder="Password" required autocomplete="current-password">
          <button type="submit">Sign In</button>
          ${this.createOAuthButtons('login')}
          <div class="auth-toggle">
            No account? <button type="button" id="show-register-btn">Create free account</button>
          </div>
        </form>

        <!-- ═══ CADASTRO COMPLETO ═══ -->
        <form class="auth-form" id="register-form" style="display:none;">
          <h2>Create Account</h2>
          <div id="register-error" role="alert"></div>

          <div class="auth-section-label">Personal Information</div>
          <div class="auth-row-2">
            <input type="text" id="reg-firstname" placeholder="First Name *" required autocomplete="given-name">
            <input type="text" id="reg-lastname"  placeholder="Last Name *" required autocomplete="family-name">
          </div>
          <input type="email" id="reg-email" placeholder="Email *" required autocomplete="email">
          <input type="tel"   id="reg-phone" placeholder="Phone * e.g. +1 555 000 0000" required autocomplete="tel">

          <div class="auth-section-label">Password</div>
          <input type="password" id="reg-password"         placeholder="Password * (min. 8 characters)" required autocomplete="new-password">
          <input type="password" id="reg-confirm-password" placeholder="Confirm Password *"           required autocomplete="new-password">
          <div class="auth-password-strength" id="reg-strength" aria-live="polite"></div>

          <div class="auth-section-label">Delivery Address</div>
          <input type="text" id="reg-street"     placeholder="Street / Avenue *" required autocomplete="street-address">
          <div class="auth-row-2">
            <input type="text" id="reg-number"     placeholder="Number *" required>
            <input type="text" id="reg-complement" placeholder="Apt / Suite" autocomplete="address-line2">
          </div>
          <input type="text" id="reg-city" placeholder="City *" required autocomplete="address-level2">
          <div class="auth-row-2">
            <input type="text" id="reg-state"   placeholder="State / Province *" required maxlength="50" style="text-transform:uppercase;" autocomplete="address-level1">
            <input type="text" id="reg-zipcode" placeholder="ZIP / Postal Code *" required maxlength="12" autocomplete="postal-code">
          </div>
          <input type="text" id="reg-country" placeholder="Country *" value="United States" required autocomplete="country-name">

          <button type="submit">Create Account</button>
          ${this.createOAuthButtons('register')}
          <div class="auth-toggle">
            Already have an account? <button type="button" id="show-login-btn">Sign In</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    this._bindModalEvents(modal);
    this.createUserPanel();
  }

  /* ────────────────────────────────────────────────────────────────
   * Bind eventos do modal
   * ──────────────────────────────────────────────────────────────── */
  _bindModalEvents(modal) {
    // Fechar
    modal.querySelector('.auth-modal-close').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('active'); });

    // Alternar entre login / registro
    document.getElementById('show-register-btn')?.addEventListener('click', () => {
      document.getElementById('login-form').style.display    = 'none';
      document.getElementById('register-form').style.display = 'block';
    });
    document.getElementById('show-login-btn')?.addEventListener('click', () => {
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display    = 'block';
    });

    // Submit login
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value
      );
    });

    // Submit cadastro
    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRegister();
    });

    // Força da senha em tempo real
    document.getElementById('reg-password')?.addEventListener('input', (e) => {
      const el = document.getElementById('reg-strength');
      const v  = e.target.value;
      if (!v) { el.textContent = ''; return; }
      const score = (v.length >= 8 ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0) + (/\d/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) ? 1 : 0);
      if (score <= 1) { el.className = 'auth-password-strength strength-weak';   el.textContent = '🔴 Weak password'; }
      else if (score === 2) { el.className = 'auth-password-strength strength-medium'; el.textContent = '🟡 Medium password'; }
      else { el.className = 'auth-password-strength strength-strong'; el.textContent = '🟢 Strong password'; }
    });

    // ZIP code auto format (international)
    document.getElementById('reg-zipcode')?.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\s/g, '').slice(0, 12);
      e.target.value = v;
    });

    // Google OAuth
    const handleGoogle = () => {
      const clientId = window.GOOGLE_CLIENT_ID || '';
      if (!clientId || typeof google === 'undefined' || !google?.accounts?.id) {
        this._showError('login-error', 'Google Sign-In not configured. Set window.GOOGLE_CLIENT_ID.');
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        return;
      }
      try {
        google.accounts.id.initialize({ client_id: clientId, callback: (r) => this.loginWithGoogle(r) });
        google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Fallback: open Google popup manually
            const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=token&scope=email+profile`;
            window.open(authUrl, 'google-login', 'width=500,height=600');
          }
        });
      } catch (err) {
        this._showError('login-error', 'Failed to initialize Google Sign-In.');
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
      }
    };
    ['google-login-btn', 'google-register-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', handleGoogle);
    });

    // Facebook OAuth
    const handleFacebook = () => {
      if (typeof FB === 'undefined') {
        alert('Facebook SDK not loaded. Please add the Facebook SDK to the site.');
        return;
      }
      FB.login((res) => { if (res.status === 'connected') this.loginWithFacebook(res); }, { scope: 'email,public_profile' });
    };
    ['facebook-login-btn', 'facebook-register-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', handleFacebook);
    });
  }

  /* ────────────────────────────────────────────────────────────────
   * Validar e enviar cadastro completo
   * ──────────────────────────────────────────────────────────────── */
  submitRegister() {
    const g = (id) => (document.getElementById(id)?.value || '').trim();
    const firstname  = g('reg-firstname');
    const lastname   = g('reg-lastname');
    const email      = g('reg-email');
    const phone      = g('reg-phone').replace(/\D/g, '');
    const password   = document.getElementById('reg-password')?.value || '';
    const confirmPwd = document.getElementById('reg-confirm-password')?.value || '';
    const street     = g('reg-street');
    const number     = g('reg-number');
    const complement = g('reg-complement');
    const city       = g('reg-city');
    const state      = g('reg-state').toUpperCase();
    const zipcode    = g('reg-zipcode').replace(/\D/g, '');
    const country    = g('reg-country') || 'United States';

    const err = (msg) => this._showError('register-error', msg);

    if (!firstname || !lastname)                               { err('First and last name are required.'); return; }
    if (!email || !email.includes('@') || !email.includes('.')) { err('Invalid email address.'); return; }
    if (phone.length < 7)                                      { err('Invalid phone number.'); return; }
    if (password.length < 8)                                   { err('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(password))                               { err('Password must contain at least one uppercase letter.'); return; }
    if (!/\d/.test(password))                                  { err('Password must contain at least one number.'); return; }
    if (password !== confirmPwd)                               { err('Passwords do not match.'); return; }
    if (!street || !number || !city)                           { err('Please fill in all required address fields.'); return; }

    const address = { street, number, complement, city, state, zipcode, country };
    this.register(`${firstname} ${lastname}`, email, password, phone, address);
  }

  _showError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `<div class="auth-error">${_escHtml(msg)}</div>`;
  }

  /* ────────────────────────────────────────────────────────────────
   * Registro
   * ──────────────────────────────────────────────────────────────── */
  async register(name, email, password, phone = '', address = {}) {
    const errEl = document.getElementById('register-error');
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password, phone, address })
      });
      const data = await response.json();
      if (!data.success) {
        if (errEl) errEl.innerHTML = `<div class="auth-error">${_escHtml(data.error || 'Registration failed')}</div>`;
        return;
      }
      currentUser = data.user;
      if (errEl) errEl.innerHTML = `<div class="auth-success">✅ Account created successfully!</div>`;
      setTimeout(() => {
        document.getElementById('auth-modal')?.classList.remove('active');
        this.updateUIForLoggedIn();
      }, 1200);
    } catch (_) {
      if (errEl) errEl.innerHTML = `<div class="auth-error">Connection error. Please try again.</div>`;
    }
  }

  /* ────────────────────────────────────────────────────────────────
   * Login
   * ──────────────────────────────────────────────────────────────── */
  async login(email, password) {
    const errEl = document.getElementById('login-error');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!data.success) {
        if (errEl) errEl.innerHTML = `<div class="auth-error">${_escHtml(data.error || 'Invalid credentials')}</div>`;
        return;
      }
      currentUser = data.user;
      if (errEl) errEl.innerHTML = `<div class="auth-success">✅ Login successful!</div>`;
      setTimeout(() => {
        document.getElementById('auth-modal')?.classList.remove('active');
        this.updateUIForLoggedIn();
      }, 600);
    } catch (_) {
      if (errEl) errEl.innerHTML = `<div class="auth-error">Connection error. Please try again.</div>`;
    }
  }

  /* ────────────────────────────────────────────────────────────────
   * Logout
   * ──────────────────────────────────────────────────────────────── */
  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {}
    currentUser = null;
    document.getElementById('user-panel')?.classList.remove('active');
    this.updateUIForLoggedOut();
  }

  /* ────────────────────────────────────────────────────────────────
   * Google OAuth callback
   * ──────────────────────────────────────────────────────────────── */
  async loginWithGoogle(response) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken: response.credential })
      });
      const data = await res.json();
      if (!data.success) { alert(_escHtml(data.error) || 'Google login failed'); return; }
      currentUser = data.user;
      document.getElementById('auth-modal')?.classList.remove('active');
      this.updateUIForLoggedIn();
    } catch (_) { alert('Google login failed. Please try again.'); }
  }

  /* ────────────────────────────────────────────────────────────────
   * Facebook OAuth callback
   * ──────────────────────────────────────────────────────────────── */
  async loginWithFacebook(response) {
    try {
      const res = await fetch(`${API_BASE}/auth/facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accessToken: response.accessToken || response.authResponse?.accessToken,
          userID: response.userID || response.authResponse?.userID
        })
      });
      const data = await res.json();
      if (!data.success) { alert(_escHtml(data.error) || 'Facebook login failed'); return; }
      currentUser = data.user;
      document.getElementById('auth-modal')?.classList.remove('active');
      this.updateUIForLoggedIn();
    } catch (_) { alert('Facebook login failed. Please try again.'); }
  }

  /* ────────────────────────────────────────────────────────────────
   * Painel do Usuário
   * ──────────────────────────────────────────────────────────────── */
  createUserPanel() {
    if (document.getElementById('user-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'user-panel';
    panel.className = 'user-panel';
    panel.setAttribute('role', 'menu');
    panel.innerHTML = `
      <div class="user-panel-header" id="user-name">User</div>
      <div class="user-panel-item" onclick="location.href='profile.html'"   role="menuitem" tabindex="0">👤 Profile</div>
      <div class="user-panel-item" onclick="location.href='orders.html'"    role="menuitem" tabindex="0">📦 My Orders</div>
      <div class="user-panel-item" onclick="location.href='addresses.html'" role="menuitem" tabindex="0">📍 Addresses</div>
      <div class="user-panel-item user-panel-logout" onclick="window.authSystem?.logout()" role="menuitem" tabindex="0">🚪 Sign Out</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('fab-login')?.addEventListener('click', (e) => {
      if (currentUser) {
        e.stopPropagation();
        panel.classList.toggle('active');
      }
    });
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) panel.classList.remove('active');
    });
  }

  /* ────────────────────────────────────────────────────────────────
   * Atualizar UI
   * ──────────────────────────────────────────────────────────────── */
  updateUIForLoggedIn() {
    const fab = document.getElementById('fab-login');
    if (fab && currentUser) {
      const initial = currentUser.name?.charAt(0)?.toUpperCase() || '?';
      fab.textContent = initial;
      fab.title = `Signed in as ${currentUser.name}`;
    }
    const el = document.getElementById('user-name');
    if (el && currentUser) el.textContent = currentUser.name || 'User';
    window.currentUser = currentUser;
  }

  updateUIForLoggedOut() {
    const fab = document.getElementById('fab-login');
    if (fab) { fab.innerHTML = '👤'; fab.title = 'Sign In / Login'; }
    window.currentUser = null;
  }

  getAuthHeaders() { return {}; }
}

/* ── Init ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window.authSystem = new AuthSystem();
});

window.currentUser = currentUser;

/* ── Helper: escape HTML ─────────────────────────────────────────── */
function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

