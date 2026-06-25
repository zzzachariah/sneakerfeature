import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        lift: "0 4px 16px rgb(var(--shadow) / 0.18)",
        cinematic: "0 40px 80px rgb(var(--shadow) / 0.48)"
      },
      backgroundImage: {
        grid: "linear-gradient(to right, rgb(var(--text) / 0.02) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--text) / 0.02) 1px, transparent 1px)"
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
} satisfies Config;
