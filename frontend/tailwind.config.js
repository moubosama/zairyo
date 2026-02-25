/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ZAIRYO カラーパレット
        gold: {
          DEFAULT: '#D4A853',
          50: '#FAF5E8',
          100: '#F5EBD1',
          200: '#EBD7A3',
          300: '#E1C375',
          400: '#D4A853',
          500: '#C49A3C',
          600: '#A47D2F',
          700: '#7D5F24',
          800: '#564118',
          900: '#2F230D',
        },
        dark: {
          DEFAULT: '#1a1a2e',
          50: '#e8e8ec',
          100: '#c5c5cf',
          200: '#9e9eb2',
          300: '#777795',
          400: '#595980',
          500: '#3b3b6b',
          600: '#2d2d52',
          700: '#1f1f39',
          800: '#1a1a2e',
          900: '#0f0f1a',
        }
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
