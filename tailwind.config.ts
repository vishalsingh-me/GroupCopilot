import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 10px 30px -15px rgba(17, 24, 39, 0.35)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui"],
        body: ["Source Sans 3", "ui-sans-serif", "system-ui"],
      },
      backgroundImage: {
        "mesh-light":
          "radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.16), transparent 40%), radial-gradient(circle at 90% 10%, rgba(251, 191, 36, 0.2), transparent 40%), radial-gradient(circle at 50% 80%, rgba(16, 185, 129, 0.16), transparent 45%)",
        "mesh-dark":
          "radial-gradient(circle at 15% 20%, rgba(56, 189, 248, 0.16), transparent 45%), radial-gradient(circle at 85% 15%, rgba(251, 191, 36, 0.14), transparent 40%), radial-gradient(circle at 50% 85%, rgba(16, 185, 129, 0.12), transparent 45%)",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
};

export default config;
