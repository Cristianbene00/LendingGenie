import type { Config } from 'tailwindcss';
import path from 'path';

// Resolve content globs against THIS file's directory (project root), so it
// works regardless of the process cwd that Next/Tailwind run under.
const here = __dirname;

export default {
  content: [
    path.join(here, 'src/web/app/**/*.{ts,tsx}'),
    './src/web/app/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: { 'fade-in': 'fade-in 0.15s ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
