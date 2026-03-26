/**
 * CDM STORES - Sistema de Autenticação
 * Login, Registro e Gestão de Usuário
 */

const API_BASE = 'https://cdmstores.com/api';
let currentUser = null;
let currentToken = null;

class AuthSystem {
  constructor() {
    this.loadUser();
    this.initAuthUI();
  }

  /**
   * Carregar usuário do localStorage
   */
  loadUser() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');

    if (token && user) {
      currentToken = token;
      currentUser = JSON.parse(user);
      this.updateUIForLoggedIn();
    }
  }

  /**
   * Inicializar UI de autenticação
   */
  initAuthUI() {
    // Injetar estilos
    this.injectStyles();

    // Criar botão de usuário na nav
    this.createUserButton();

    // Criar modais
    this.createAuthModal();

    // Inicializar OAuth após modal ser criada
    setTimeout(() => {
      initGoogleOAuth();
      initFacebookOAuth();
    }, 100);
  }

  /**
   * Injetar CSS
   */
  injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      /* Botão de usuário */
      .user-btn {
        background: linear-gradient(135deg, #00AFFF, #9B4DFF);
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      }

      .user-btn:hover {
        opacity: 0.9;
      }

      /* Floating Action Buttons Container */
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
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
      }

      .fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }

      .fab-login {
        background: linear-gradient(135deg, #00AFFF, #9B4DFF);
        color: white;
      }

      .fab-chat {
        background: linear-gradient(135deg, #FF6B6B, #FF8E53);
        color: white;
      }

      @media (max-width: 768px) {
        .fab {
          width: 50px;
          height: 50px;
          font-size: 20px;
        }
      }

      /* Auth Modal */
      .auth-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        align-items: center;
        justify-content: center;
      }

      .auth-modal.active {
        display: flex;
      }

      .auth-modal-content {
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }

      .auth-modal-close {
        position: absolute;
        top: 15px;
        right: 15px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .auth-form h2 {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
      }

      .auth-form input {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 14px;
      }

      .auth-form input:focus {
        outline: none;
        border-color: #00AFFF;
        box-shadow: 0 0 0 3px rgba(0, 175, 255, 0.1);
      }

      .auth-form button {
        padding: 12px;
        background: linear-gradient(135deg, #00AFFF, #9B4DFF);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
      }

      .auth-form button:hover {
        opacity: 0.9;
      }

      .auth-toggle {
        text-align: center;
        margin-top: 15px;
        font-size: 14px;
        color: #666;
      }

      .auth-toggle button {
        background: none;
        color: #00AFFF;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }

      .auth-error {
        color: #e74c3c;
        font-size: 13px;
        padding: 10px;
        background: #ffe6e6;
        border-radius: 6px;
        text-align: center;
      }

      .auth-success {
        color: #27ae60;
        font-size: 13px;
        padding: 10px;
        background: #e6ffe6;
        border-radius: 6px;
        text-align: center;
      }

      .user-panel {
        position: fixed;
        top: 60px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
        padding: 15px;
        z-index: 9999;
        display: none;
        min-width: 200px;
      }

      .user-panel.active {
        display: block;
      }

      .user-panel-header {
        font-weight: 600;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }

      .user-panel-item {
        padding: 8px 0;
        cursor: pointer;
        color: #333;
        font-size: 14px;
      }

      .user-panel-item:hover {
        color: #00AFFF;
      }

      .user-panel-logout {
        border-top: 1px solid #eee;
        padding-top: 10px;
        margin-top: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Criar botão de usuário flutuante (FAB)
   */
  createFloatingButtons() {
    // Verificar se já existe e usar o container existente
    let container = document.getElementById('fab-container');
    
    // Se não existe, criar novo
    if (!container) {
      container = document.createElement('div');
      container.id = 'fab-container';
      container.className = 'fab-container';
      document.body.appendChild(container);
    }

    // Verificar se FAB de login já existe
    if (document.getElementById('fab-login')) return;

    const loginFab = document.createElement('button');
    loginFab.id = 'fab-login';
    loginFab.className = 'fab fab-login';
    loginFab.title = 'Login / Entrar';
    loginFab.innerHTML = '👤';

    loginFab.addEventListener('click', () => {
      document.getElementById('auth-modal').classList.add('active');
    });

    container.appendChild(loginFab);
  }

  /**
   * Criar botão de usuário na nav (remover - usar FAB em seu lugar)
   */
  createUserButton() {
    // Criar FAB em vez de botão na nav
    this.createFloatingButtons();
  }

  /**
   * Verificar se está em mobile
   */
  isMobile() {
    return window.innerWidth <= 768;
  }

  /**
   * Criar botões OAuth responsivos
   */
  createOAuthButtons(isRegister = false) {
    const isMobileView = this.isMobile();
    const formPrefix = isRegister ? 'register' : 'login';
    
    // SVG Google Logo
    const googleSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
      <rect width="24" height="24" fill="none"/>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>`;

    // SVG Facebook Logo
    const facebookSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>`;
    
    if (isMobileView) {
      // Ícones compactos lado a lado em mobile
      return `
        <div style="text-align: center; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">OU</p>
        </div>
        <div style="display: flex; justify-content: center; gap: 12px; margin: 16px 0;">
          <button type="button" id="google-${formPrefix}-btn" style="background: white; color: #333; border: 1px solid #ddd; width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.2s;">
            ${googleSvg}
          </button>
          <button type="button" id="facebook-${formPrefix}-btn" style="background: #1877F2; color: white; border: none; width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.2s;">
            ${facebookSvg}
          </button>
        </div>
      `;
    } else {
      // Botões compridos em desktop
      return `
        <div style="text-align: center; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">OU</p>
        </div>
        <button type="button" id="google-${formPrefix}-btn" style="background: white; color: #333; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 10px; transition: all 0.2s; font-size: 14px; font-weight: 500;">
          ${googleSvg}
          ${isRegister ? 'Cadastrar' : 'Entrar'} com Google
        </button>
        <button type="button" id="facebook-${formPrefix}-btn" style="background: #1877F2; color: white; border: none; display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 10px; transition: all 0.2s; font-size: 14px; font-weight: 500;">
          ${facebookSvg}
          ${isRegister ? 'Cadastrar' : 'Entrar'} com Facebook
        </button>
      `;
    }
  }

  /**
   * Criar modal de autenticação
   */
  createAuthModal() {
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
      <div class="auth-modal-content">
        <button class="auth-modal-close">&times;</button>

        <!-- Login Form -->
        <form class="auth-form" id="login-form" style="display: block;">
          <h2>Entrar</h2>
          <div id="login-error"></div>
          <input type="email" placeholder="Email" required>
          <input type="password" placeholder="Senha" required>
          <button type="submit">Entrar</button>
          
          ${this.createOAuthButtons(false)}
          
          <div class="auth-toggle">
            Não tem conta? <button type="button" onclick="document.getElementById('login-form').style.display='none'; document.getElementById('register-form').style.display='block';">Registre-se</button>
          </div>
        </form>

        <!-- Register Form -->
        <form class="auth-form" id="register-form" style="display: none;">
          <h2>Criar Conta</h2>
          <div id="register-error"></div>
          <input type="text" placeholder="Nome completo" required>
          <input type="email" placeholder="Email" required>
          <input type="password" placeholder="Senha (mín. 6 caracteres)" required>
          <button type="submit">Criar Conta</button>
          
          ${this.createOAuthButtons(true)}
          
          <div class="auth-toggle">
            Já tem conta? <button type="button" onclick="document.getElementById('login-form').style.display='block'; document.getElementById('register-form').style.display='none';">Entrar</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.auth-modal-close').addEventListener('click', () => {
      modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = e.target.querySelector('input[type="email"]').value;
      const password = e.target.querySelector('input[type="password"]').value;
      this.login(email, password);
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.querySelector('input[type="text"]').value;
      const email = e.target.querySelector('input[type="email"]').value;
      const password = e.target.querySelector('input[type="password"]').value;
      this.register(name, email, password);
    });

    // Adicionar hover effects aos botões OAuth em mobile
    if (this.isMobile()) {
      const googleLoginBtn = document.getElementById('google-login-btn');
      const facebookLoginBtn = document.getElementById('facebook-login-btn');
      const googleRegisterBtn = document.getElementById('google-register-btn');
      const facebookRegisterBtn = document.getElementById('facebook-register-btn');

      [googleLoginBtn, facebookLoginBtn, googleRegisterBtn, facebookRegisterBtn].forEach(btn => {
        if (btn) {
          btn.addEventListener('mousedown', function() {
            this.style.transform = 'scale(0.95)';
          });
          btn.addEventListener('mouseup', function() {
            this.style.transform = 'scale(1)';
          });
          btn.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
          });
        }
      });
    }

    // Criar user panel
    this.createUserPanel();
  }

  /**
   * Criar painel de usuário
   */
  createUserPanel() {
    const panel = document.createElement('div');
    panel.id = 'user-panel';
    panel.className = 'user-panel';
    panel.innerHTML = `
      <div class="user-panel-header" id="user-name">Usuário</div>
      <div class="user-panel-item" onclick="location.href='/profile.html'">👤 Perfil</div>
      <div class="user-panel-item" onclick="location.href='/orders.html'">📦 Meus Pedidos</div>
      <div class="user-panel-item" onclick="location.href='/addresses.html'">📍 Endereços</div>
      <div class="user-panel-item user-panel-logout" onclick="authSystem.logout()">🚪 Sair</div>
    `;

    document.body.appendChild(panel);

    const userBtn = document.getElementById('auth-user-btn');
    if (userBtn) {
      userBtn.addEventListener('click', () => {
        panel.classList.toggle('active');
      });
    }
  }

  /**
   * Registro
   */
  async register(name, email, password) {
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!data.success) {
        document.getElementById('register-error').innerHTML = `<div class="auth-error">${data.error}</div>`;
        return;
      }

      // Salvar token e usuário
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      currentToken = data.token;
      currentUser = data.user;

      document.getElementById('register-error').innerHTML = `<div class="auth-success">Conta criada com sucesso!</div>`;
      setTimeout(() => {
        document.getElementById('auth-modal').classList.remove('active');
        this.updateUIForLoggedIn();
      }, 1000);
    } catch (error) {
      document.getElementById('register-error').innerHTML = `<div class="auth-error">Erro ao registrar</div>`;
    }
  }

  /**
   * Login
   */
  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!data.success) {
        document.getElementById('login-error').innerHTML = `<div class="auth-error">${data.error}</div>`;
        return;
      }

      // Salvar tokens e usuário
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_refresh_token', data.refreshToken);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      currentToken = data.token;
      currentUser = data.user;

      document.getElementById('login-error').innerHTML = `<div class="auth-success">Login realizado!</div>`;
      setTimeout(() => {
        document.getElementById('auth-modal').classList.remove('active');
        this.updateUIForLoggedIn();
      }, 500);
    } catch (error) {
      document.getElementById('login-error').innerHTML = `<div class="auth-error">Erro ao fazer login</div>`;
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_refresh_token');
    localStorage.removeItem('auth_user');
    currentToken = null;
    currentUser = null;

    document.getElementById('user-panel').classList.remove('active');
    this.updateUIForLoggedOut();
  }

  /**
   * Atualizar UI para usuário logado
   */
  updateUIForLoggedIn() {
    const userBtn = document.getElementById('auth-user-btn');
    if (userBtn && currentUser) {
      userBtn.textContent = `👤 ${currentUser.name.split(' ')[0]}`;
    }

    const userNameEl = document.getElementById('user-name');
    if (userNameEl && currentUser) {
      userNameEl.textContent = currentUser.name;
    }
  }

  /**
   * Atualizar UI para usuário deslogado
   */
  updateUIForLoggedOut() {
    const userBtn = document.getElementById('auth-user-btn');
    if (userBtn) {
      userBtn.textContent = '👤 Entrar';
    }
  }

  /**
   * Obter headers com token
   */
  getAuthHeaders() {
    if (!currentToken) return {};
    return { 'Authorization': `Bearer ${currentToken}` };
  }

  /**
   * Login com Google
   */
  async loginWithGoogle(response) {
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          idToken: response.credential || response.id_token,
          accessToken: response.accessToken 
        })
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Erro ao fazer login com Google');
        return;
      }

      // Salvar token e usuário
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      currentToken = data.token;
      currentUser = data.user;

      // Fechar modal e atualizar UI
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.remove('active');
      this.updateUIForLoggedIn();

      // Redirecionar após login
      setTimeout(() => window.location.href = '/profile.html', 1000);
    } catch (error) {
      alert('Erro ao fazer login com Google: ' + error.message);
    }
  }

  /**
   * Login com Facebook
   */
  async loginWithFacebook(response) {
    try {
      const res = await fetch(`${API_BASE}/auth/facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accessToken: response.accessToken || response.authResponse?.accessToken,
          userID: response.userID || response.authResponse?.userID
        })
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Erro ao fazer login com Facebook');
        return;
      }

      // Salvar token e usuário
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      currentToken = data.token;
      currentUser = data.user;

      // Fechar modal e atualizar UI
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.remove('active');
      this.updateUIForLoggedIn();

      // Redirecionar após login
      setTimeout(() => window.location.href = '/profile.html', 1000);
    } catch (error) {
      alert('Erro ao fazer login com Facebook: ' + error.message);
    }
  }
}

// Inicializar Google OAuth
function initGoogleOAuth() {
  // Carregar Google Sign-In library
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  script.onload = () => {
    // Configurar botões do Google
    const googleLoginBtn = document.getElementById('google-login-btn');
    const googleRegisterBtn = document.getElementById('google-register-btn');

    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', () => {
        // Usar Google Sign-In button
        if (window.google) {
          window.google.accounts.id.initialize({
            client_id: 'YOUR_GOOGLE_CLIENT_ID', // Substituir com seu ID
            callback: (response) => {
              if (window.authSystem) {
                window.authSystem.loginWithGoogle(response);
              }
            }
          });
          window.google.accounts.id.renderButton(
            document.createElement('div'),
            { theme: 'outline', size: 'large' }
          );
        }
        // Para demonstração, usar prompt
        alert('Configure seu GOOGLE_CLIENT_ID para ativar Google Sign-In');
      });
    }
  };
}

// Inicializar Facebook OAuth
function initFacebookOAuth() {
  // Carregar Facebook SDK
  window.fbAsyncInit = function() {
    FB.init({
      appId: 'YOUR_FACEBOOK_APP_ID', // Substituir com seu ID
      cookie: true,
      xfbml: true,
      version: 'v18.0'
    });
  };

  const script = document.createElement('script');
  script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  // Configurar botões do Facebook após carregamento
  setTimeout(() => {
    const facebookLoginBtn = document.getElementById('facebook-login-btn');
    const facebookRegisterBtn = document.getElementById('facebook-register-btn');

    if (facebookLoginBtn) {
      facebookLoginBtn.addEventListener('click', () => {
        if (window.FB) {
          FB.login(function(response) {
            if (response.authResponse) {
              if (window.authSystem) {
                window.authSystem.loginWithFacebook(response.authResponse);
              }
            }
          }, {scope: 'public_profile,email'});
        } else {
          alert('Configure seu FACEBOOK_APP_ID para ativar Facebook Login');
        }
      });
    }
  }, 1000);
}

// Inicializar quando DOM está pronto
document.addEventListener('DOMContentLoaded', () => {
  window.authSystem = new AuthSystem();
  
  // Inicializar OAuth (comentado até configurar credenciais)
  // initGoogleOAuth();
  // initFacebookOAuth();
});

// Exportar para uso externo
window.currentUser = currentUser;
window.currentToken = currentToken;
