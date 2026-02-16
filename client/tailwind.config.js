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
      },
      animation: {
        'ping-once': 'ping-once 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
};
