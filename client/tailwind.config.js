/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: "#00f5ff",
          purple: "#8b5cf6",
          pink: "#ff2fd3"
        }
      }
    }
  },
  plugins: []
};
