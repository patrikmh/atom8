/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#f5f5f5',
          dark: '#1a1a2e',
          grid: '#e0e0e0',
        },
      },
    },
  },
  plugins: [],
}
