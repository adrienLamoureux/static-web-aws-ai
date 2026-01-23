/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "#111111",
        haze: "#f5f4f7",
        mist: "#e9eef5",
        accent: "#1a46d9",
        glow: "#eff1ff",
      },
      boxShadow: {
        soft: "0 24px 60px -40px rgba(15, 23, 42, 0.45)",
        card: "0 20px 45px -35px rgba(17, 24, 39, 0.35)",
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
