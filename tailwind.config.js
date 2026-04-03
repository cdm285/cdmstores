/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './pages/**/*.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      /* ── Typography ── */
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.68rem',
        'xs':  ['0.75rem', { lineHeight: '1rem' }],
        'sm':  ['0.875rem', { lineHeight: '1.25rem' }],
      },

      /* ── Brand Colours ── */
      colors: {
        primary:      { DEFAULT: '#1a56db', hover: '#1449c4', light: 'rgba(26,86,219,0.08)' },
        accent:       '#f59e0b',
        success:      '#059669',
        danger:       '#dc2626',
        dark:         { DEFAULT: '#111827', mid: '#374151' },
        'bg-page':    '#f2f2ef',
        'bg-subtle':  '#f5f5f3',
        'text-muted': '#9ca3af',
        'promo-bg':   '#0f172a',
        'footer-bg':  '#0f172a',
        'hero-bg':    '#090e1a',
        'sky-blue':   '#38bdf8',
        'cyan-cta':   { DEFAULT: '#0891b2', hover: '#0e7490' },
        'slate-text': '#8b98b0',
      },

      /* ── Spacing / Sizing ── */
      spacing: {
        'header':   '72px',
        'promo':    '40px',
        'header-m': '60px',
        'promo-m':  '36px',
      },
      maxWidth: {
        'site': '1280px',
      },
      minHeight: {
        'hero':   '700px',
        'hero-m': '520px',
      },
      width: {
        'cart': '420px',
      },

      /* ── Border Radius ── */
      borderRadius: {
        'xs':   '4px',
        'sm':   '6px',
        'md':   '10px',
        'lg':   '14px',
        'xl':   '20px',
        'full': '9999px',
      },

      /* ── Premium Box Shadows ── */
      boxShadow: {
        'sm':      '0 1px 3px rgba(0,0,0,0.08)',
        'md':      '0 4px 12px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
        'lg':      '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        'xl':      '0 24px 64px rgba(0,0,0,0.16)',
        'header':  '0 2px 20px rgba(0,0,0,0.07)',
        'hero-img':'0 32px 80px rgba(0,0,0,0.55)',
        'float':   '0 8px 32px rgba(0,0,0,0.22)',
        'btn-hero':'0 6px 28px rgba(8,145,178,0.4)',
        'btn-hero-hover': '0 10px 36px rgba(8,145,178,0.5)',
        'mobile-nav': '-16px 0 48px rgba(0,0,0,0.14)',
        'cart':    '-8px 0 40px rgba(0,0,0,0.14)',
      },

      /* ── Transitions ── */
      transitionTimingFunction: {
        'premium': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'fast': '200ms',
        'slow': '350ms',
      },

      /* ── Animations ── */
      keyframes: {
        heroFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-7px)' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'hero-float':       'heroFloat 4s ease-in-out infinite',
        'hero-float-delay': 'heroFloat 4s ease-in-out 2s infinite',
        'marquee':          'marquee 20s linear infinite',
      },

      /* ── Z-index ── */
      zIndex: {
        'promo':      '10200',
        'header':     '10100',
        'cart-overlay':'10999',
        'cart':       '11000',
        'nav-overlay':'11400',
        'nav':        '11500',
      },
    },
  },
  plugins: [],
};
