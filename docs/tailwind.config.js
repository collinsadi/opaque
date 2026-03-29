/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#07080d",
          900: "#0c0e14",
          800: "#13161f",
          700: "#1c2030",
          600: "#2a3145",
        },
        mist: "#94a3b8",
        glow: {
          DEFAULT: "#5eead4",
          dim: "#2dd4bf",
          muted: "#134e4a",
        },
        flare: "#f472b6",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, transparent 0%, rgb(7 8 13) 100%), linear-gradient(90deg, rgba(94,234,212,0.03) 1px, transparent 1px), linear-gradient(rgba(94,234,212,0.03) 1px, transparent 1px)",
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease-out forwards",
        pulseSoft: "pulseSoft 3s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};
