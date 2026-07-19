/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd",
          400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9",
          800: "#5b21b6", 900: "#4c1d95",
        },
        accent: {
          50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
          400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c",
        },
        ink: "#1e1b31",
        surface: "#faf9fe",
      },
      fontFamily: {
        sans: ["Fira Sans", "Tajawal", "system-ui", "sans-serif"],
        display: ["Sora", "Tajawal", "Fira Sans", "sans-serif"],
        mono: ["Fira Code", "monospace"],
        ar: ["Tajawal", "Fira Sans", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 10px -2px rgba(67,26,158,0.07), 0 8px 32px -12px rgba(67,26,158,0.10)",
        lift: "0 10px 34px -8px rgba(67,26,158,0.28)",
        glow: "0 0 0 3px rgba(124,58,237,0.16)",
        card: "0 1px 2px rgba(67,26,158,0.05), 0 12px 40px -16px rgba(67,26,158,0.14)",
      },
      borderRadius: { xl2: "1rem" },
    },
  },
  plugins: [],
};
