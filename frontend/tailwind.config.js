/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          500: '#06b6d4',
          600: '#0891b2',
        },
      },
      boxShadow: {
        soft: '0 22px 60px -32px rgba(15, 23, 42, 0.45)',
        glow: '0 20px 70px -35px rgba(37, 99, 235, 0.85)',
      },
      borderRadius: {
        '2xl': '1.15rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
