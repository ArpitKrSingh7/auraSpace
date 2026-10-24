import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3e6658',
          light: '#4d7d6b',
          dark: '#2e4d42',
          50: '#f0f5f3',
          100: '#dce8e3',
          200: '#b8d1c7',
          300: '#8db5a5',
          400: '#5e9481',
          500: '#3e6658',
          600: '#325248',
          700: '#293f3a',
          800: '#22332f',
          900: '#1c2a27',
        },
        surface: {
          DEFAULT: '#faf8f5',
          warm: '#f5f0ea',
          muted: '#ede7de',
          dim: '#ddd5c9',
        },
        accent: {
          DEFAULT: '#C9977D',
          light: '#dbb5a0',
          dark: '#a87a5e',
        },
        text: {
          DEFAULT: '#2c2c2c',
          secondary: '#6b6560',
          muted: '#9a938c',
          inverse: '#faf8f5',
        },
        danger: {
          DEFAULT: '#c0392b',
          light: '#e74c3c',
        },
        warning: {
          DEFAULT: '#d4a017',
          light: '#f0c040',
        },
      },
      fontFamily: {
        sans: [
          'system-ui', '-apple-system', 'BlinkMacSystemFont',
          '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial',
          '"Noto Sans"', 'sans-serif',
        ],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(44, 44, 44, 0.08)',
        medium: '0 4px 16px rgba(44, 44, 44, 0.12)',
        elevated: '0 8px 32px rgba(44, 44, 44, 0.16)',
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
      },
      animation: {
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toastIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-out': 'toastOut 0.3s ease-in forwards',
      },
      keyframes: {
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        slideDown: {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastOut: {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(-8px) scale(0.96)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
