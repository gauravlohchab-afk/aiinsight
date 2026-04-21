import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-cabinet)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d1ff',
          300: '#9eb2ff',
          400: '#7888fd',
          500: '#5b63f8',
          600: '#4640ed',
          700: '#3b32d5',
          800: '#302aac',
          900: '#2c2888',
          950: '#1a1852',
        },
        surface: {
          50: '#f8f9fc',
          100: '#f1f3f9',
          200: '#e4e8f3',
          300: '#cdd4e8',
          400: '#aab4d0',
          500: '#8493b8',
          600: '#6374a0',
          700: '#4f5e88',
          800: '#3d4a6e',
          850: '#2a3352',
          900: '#1e2640',
          950: '#121826',
          1000: '#090d18',
        },
        accent: {
          cyan: '#22d3ee',
          green: '#4ade80',
          amber: '#fbbf24',
          red: '#f87171',
          purple: '#c084fc',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #5b63f8 0%, #7b3fe4 100%)',
        'gradient-surface': 'linear-gradient(180deg, #1e2640 0%, #090d18 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(91,99,248,0.1) 0%, rgba(123,63,228,0.05) 100%)',
        'grid-pattern': 'radial-gradient(circle, rgba(91,99,248,0.08) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
      boxShadow: {
        'brand': '0 0 0 1px rgba(91,99,248,0.3), 0 4px 24px rgba(91,99,248,0.15)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)',
        'glow-brand': '0 0 20px rgba(91,99,248,0.4)',
        'glow-cyan': '0 0 20px rgba(34,211,238,0.3)',
        'glow-green': '0 0 20px rgba(74,222,128,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
