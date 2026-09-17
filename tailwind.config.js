/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          page: '#F4F6F5',
          card: '#FFFFFF',
          border: '#E4EAE7',
          sidebar: '#0B5C45',
          logo: '#1D9E75',
          text: '#10241E',
          muted: '#5F6E68',
          accent: '#0F7A5C',
          gold: '#C89A2E',
          rose: '#C4525B',
          indigo: '#5B5FC7',
        },
        brand: {
          50: '#e6f4f0',
          100: '#cce9e1',
          500: '#0F7A5C',
          600: '#0B5C45',
          800: '#094a37',
          900: '#063628',
        },
      },
      fontFamily: {
        marathi: ['Noto Sans Devanagari', 'Mukta', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
