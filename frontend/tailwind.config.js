/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Cormorant Garamond", "ui-serif", "Georgia", "serif"],
        body: ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "#1b1a17",
        haze: "#f6f1e8",
        mist: "#efe7da",
        accent: "#b08d57",
        glow: "#fbf5ea",
      },
      boxShadow: {
        soft: "0 28px 70px -44px rgba(55, 39, 20, 0.42)",
        card: "0 24px 60px -40px rgba(46, 34, 20, 0.36)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.7" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s ease forwards",
        "fade-in": "fade-in 0.6s ease forwards",
        "glow-pulse": "glow-pulse 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
