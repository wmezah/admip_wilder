/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        surface: {
          DEFAULT: '#0f172a',
          card: '#1e293b',
          hover: '#334155',
          border: '#334155',
        },
        accent: {
          cyan: '#22d3ee',
          green: '#4ade80',
          amber: '#fbbf24',
          red: '#f87171',
          purple: '#a78bfa',
        }
      }
    }
  },
  plugins: []
}
