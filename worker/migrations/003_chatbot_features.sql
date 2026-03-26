-- Tabela de Notificações (para alertar sobre promoções, pedidos, etc)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL,
  type TEXT NOT NULL, -- 'product', 'promotion', 'order_status', 'support'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_email) REFERENCES customers(email)
);

-- Tabela de Agendamentos (para agendar atendimento com suporte)
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  scheduled_date DATETIME NOT NULL,
  reason TEXT, -- 'support', 'consultation', 'return'
  status TEXT DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_email) REFERENCES customers(email)
);

-- Tabela de Chat Sessions (para rastrear conversas com bot)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE,
  customer_email TEXT,
  language TEXT DEFAULT 'pt',
  last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_messages INTEGER DEFAULT 0,
  sentiment_score INTEGER DEFAULT 0, -- agregado
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_email) REFERENCES customers(email)
);

-- Tabela de Chat Messages (histórico de conversas)
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  action TEXT, -- 'add_to_cart', 'apply_coupon', 'track_order', etc
  sentiment TEXT, -- 'positive', 'negative', 'neutral'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(user_id)
);

-- Tabela de Cupons adicionais (para gerenciar descontos)
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  discount_value REAL NOT NULL, -- valor do desconto em R$
  discount_percentage REAL, -- ou percentual
  min_order_value REAL DEFAULT 0,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  valid_from DATETIME,
  valid_until DATETIME,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications(customer_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_appointments_email ON appointments(customer_email);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);
