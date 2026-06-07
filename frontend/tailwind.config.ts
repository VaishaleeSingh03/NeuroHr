import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    screens: {
      xs: "375px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        aqua: {
          DEFAULT: "#00B8B8",
          light: "#7FE7DC",
          dark: "#008B8B",
        },
        cream: {
          DEFAULT: "#FFF4DE",
          warm: "#F6E6C2",
        },
        teal: {
          dark: "#0D4F4F",
          DEFAULT: "#1A6B6B",
          muted: "rgba(13, 79, 79, 0.55)",
          light: "rgba(26, 107, 107, 0.75)",
        },
      },
      textColor: {
        heading: "#0D4F4F",
        body: "#1A6B6B",
        muted: "rgba(13, 79, 79, 0.55)",
        label: "rgba(13, 79, 79, 0.65)",
        accent: "#00B8B8",
        "accent-light": "#7FE7DC",
        inverse: "#FFFFFF",
        cream: "#FFF4DE",
        beige: "#F6E6C2",
      },
      backgroundImage: {
        "gradient-main": "linear-gradient(135deg, #00B8B8 0%, #7FE7DC 50%, #FFF4DE 100%)",
        "gradient-card": "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(127,231,220,0.1) 100%)",
        "gradient-sidebar": "linear-gradient(180deg, #0D4F4F 0%, #1A6B6B 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 184, 184, 0.15)",
        card: "0 4px 24px rgba(13, 79, 79, 0.08)",
        glow: "0 0 24px rgba(0, 184, 184, 0.25)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "slide-in-left": "slideInLeft 0.3s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        "zara-speak": "zaraSpeak 0.4s ease-in-out infinite alternate",
        "zara-glow": "zaraGlow 4s ease-in-out infinite",
        "zara-sparkle": "zaraSparkle 1.2s ease-in-out infinite",
      },
      keyframes: {
        zaraSpeak: {
          "0%": { transform: "scale(1)", boxShadow: "0 8px 40px rgba(0, 184, 184, 0.25)" },
          "100%": { transform: "scale(1.06)", boxShadow: "0 12px 60px rgba(0, 184, 184, 0.45)" },
        },
        zaraGlow: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.08)" },
        },
        zaraSparkle: {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1.2) rotate(180deg)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
