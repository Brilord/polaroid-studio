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
        paper: '#fbf7ef',
        ink: '#171923',
        accent: '#76512f',
        accentSoft: '#f1e4d1',
      },
      fontFamily: {
        display: ['"Avenir Next"', '"Segoe UI"', 'sans-serif'],
        handwritten: ['"Segoe Print"', '"Bradley Hand"', '"Comic Sans MS"', 'cursive'],
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at 25% 20%, rgba(255,255,255,0.68), transparent 32%), radial-gradient(circle at 80% 10%, rgba(154,106,58,0.06), transparent 28%), linear-gradient(140deg, #fffaf4 0%, #f7f0e7 52%, #efe4d5 100%)',
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
