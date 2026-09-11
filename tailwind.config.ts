import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      // Body-copy floor: never ship Tailwind's default 14px text-sm on phones.
      fontSize: {
        sm: ["0.9375rem", { lineHeight: "1.45" }], // 15px
        xs: ["0.9375rem", { lineHeight: "1.45" }], // 15px — labels use .stat-label / text-[11px]
      },
      fontFamily: {
        display: ["var(--font-display)"],
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        numeric: ["var(--font-numeric)"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          dim: "hsl(var(--gold-dim) / <alpha-value>)",
          bright: "hsl(var(--gold-bright) / <alpha-value>)",
        },
        ember: "hsl(var(--ember) / <alpha-value>)",
        siege: "hsl(var(--siege) / <alpha-value>)",
        oxygen: "hsl(var(--oxygen) / <alpha-value>)",
        liberty: "hsl(var(--liberty) / <alpha-value>)",
        sponsor: "hsl(var(--sponsor) / <alpha-value>)",
        steel: "hsl(var(--steel) / <alpha-value>)",
        arcane: "hsl(var(--arcane) / <alpha-value>)",
        stage: {
          available: "hsl(var(--stage-available) / <alpha-value>)",
          reserved: "hsl(var(--stage-reserved) / <alpha-value>)",
          closed: "hsl(var(--stage-closed) / <alpha-value>)",
          note_sold: "hsl(var(--stage-note-sold) / <alpha-value>)",
        },
      },
      borderRadius: {
        "2xl": "calc(var(--radius) * 2.5)",
        xl: "calc(var(--radius) * 1.75)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        glow: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 3s linear infinite",
        glow: "glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
