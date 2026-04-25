import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-be-vietnam-pro)", "system-ui", "sans-serif"],
        display: ["var(--font-epilogue)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        risk: {
          low: "var(--risk-low)",
          "low-fg": "var(--risk-low-fg)",
          medium: "var(--risk-medium)",
          "medium-fg": "var(--risk-medium-fg)",
          high: "var(--risk-high)",
          "high-fg": "var(--risk-high-fg)",
        },
        success: {
          DEFAULT: "var(--semantic-success)",
          foreground: "var(--semantic-success-fg)",
          muted: "var(--semantic-success-muted)",
          "muted-fg": "var(--semantic-success-muted-fg)",
          border: "var(--semantic-success-border)",
        },
        warning: {
          DEFAULT: "var(--semantic-warning)",
          foreground: "var(--semantic-warning-fg)",
          muted: "var(--semantic-warning-muted)",
          "muted-fg": "var(--semantic-warning-muted-fg)",
          border: "var(--semantic-warning-border)",
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "ai-breathe": "ai-breathe 3s ease-in-out infinite",
      },
      keyframes: {
        "ai-breathe": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.65", transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
