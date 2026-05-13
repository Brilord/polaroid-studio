/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 20px 45px rgba(21, 27, 38, 0.12)',
        polaroid: '0 24px 60px rgba(17, 24, 39, 0.24)',
      },
      colors: {
        paper: '#f7f3ea',
        ink: '#171923',
        accent: '#8f4f24',
        accentSoft: '#f7e4d6',
      },
      fontFamily: {
        display: ['"Avenir Next"', '"Segoe UI"', 'sans-serif'],
        handwritten: ['"Segoe Print"', '"Bradley Hand"', '"Comic Sans MS"', 'cursive'],
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.65), transparent 32%), radial-gradient(circle at 80% 10%, rgba(209,143,99,0.08), transparent 28%), linear-gradient(140deg, #fffaf4 0%, #f5ede2 52%, #f0e5d6 100%)',
      },
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(18px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        floatIn: 'floatIn 380ms ease-out',
      },
    },
  },
  plugins: [],
};
