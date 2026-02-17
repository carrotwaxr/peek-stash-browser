/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        // Custom breakpoints for large displays (media app use case)
        '3xl': '1920px',  // Full HD monitors/TVs
        '4xl': '2560px',  // QHD/1440p displays
        '5xl': '3840px',  // 4K UHD monitors/TVs
      },
      keyframes: {
        'ping-once': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.3)', opacity: '0.8' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'heart-pop': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '20%': { transform: 'scale(1.15)', opacity: '1' },
          '40%': { transform: 'scale(0.95)', opacity: '1' },
          '55%': { transform: 'scale(1.05)', opacity: '1' },
          '70%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'heart-shrink': {
          '0%': { transform: 'scale(1)', opacity: '0' },
          '15%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(0.85)', opacity: '0.7' },
          '100%': { transform: 'scale(0.7)', opacity: '0' },
        },
      },
      animation: {
        'ping-once': 'ping-once 0.6s ease-out forwards',
        'heart-pop': 'heart-pop 0.8s ease-out forwards',
        'heart-shrink': 'heart-shrink 0.7s ease-out forwards',
      },
    },
  },
  plugins: [],
};
