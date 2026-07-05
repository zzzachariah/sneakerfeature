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
      },
      // Motion-duration scale — mirrors the --dur-* tokens in globals.css so
      // utilities can say duration-base instead of a raw duration-[200ms].
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
        cin: "500ms"
      },
      // Semantic radius aliases for the recurring shapes (Card = 2xl, controls
      // = lg, sheets/modals = 3xl) so new code reaches for a named size.
      borderRadius: {
        control: "0.5rem",
        card: "1rem",
        sheet: "1.5rem"
      }
    }
  },
  plugins: []
} satisfies Config;
