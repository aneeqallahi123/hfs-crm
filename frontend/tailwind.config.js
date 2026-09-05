/** @type {import('tailwindcss').Config} */
const PAPER = '#FFFFFF', FOG = '#F1F4F2', TINT = '#C9DBD2', GREEN = '#147B58', DEEP = '#0B4A36', INK = '#1C1C1C';
const ink35 = 'rgba(28,28,28,.35)', ink50 = 'rgba(28,28,28,.5)', ink65 = 'rgba(28,28,28,.65)', ink80 = 'rgba(28,28,28,.8)';

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: ['Roboto', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      serif: ['Roboto', 'system-ui', 'sans-serif'],
      mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '600' },
    borderRadius: { none: '0', sm: '4px', DEFAULT: '4px', md: '4px', lg: '8px', xl: '8px', '2xl': '8px', '3xl': '8px', full: '9999px' },
    boxShadow: { none: 'none', sm: 'none', DEFAULT: 'none', md: 'none', lg: 'none', xl: 'none', '2xl': 'none' },
    extend: {
      colors: {
        paper: PAPER, fog: FOG, tint: TINT, green: GREEN, deep: DEEP, ink: INK,
        teal:    { 50: FOG, 100: FOG, 200: TINT, 300: TINT, 400: GREEN, 500: GREEN, 600: GREEN, 700: GREEN, 800: GREEN, 900: INK },
        stone:   { 50: FOG, 100: FOG, 200: TINT, 300: TINT, 400: ink50, 500: ink65, 600: ink80, 700: INK, 800: INK, 900: INK },
        slate:   { 50: FOG, 100: FOG, 200: TINT, 300: ink35, 400: ink50, 500: ink65, 600: ink80, 700: INK, 800: INK, 900: INK },
        emerald: { 50: FOG, 100: FOG, 200: TINT, 500: GREEN, 600: GREEN, 700: GREEN, 800: DEEP },
        rose:    { 50: FOG, 100: FOG, 200: TINT, 500: DEEP, 600: DEEP, 700: DEEP },
        amber:   { 50: FOG, 100: FOG, 200: TINT, 300: TINT, 400: TINT, 600: INK, 700: INK },
      },
    },
  },
  plugins: [],
};
