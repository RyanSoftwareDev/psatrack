// tailwind.config.(ts|js|mjs)
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "psa-bg": "#020617",
        "psa-panel": "#0B1120",
        "psa-border": "#1E293B",
        "psa-border-soft": "#334155",
        "psa-blue": "#0078D2",
        "psa-blue-dark": "#005A9E",
        "psa-red": "#D81E05",
        "psa-red-soft": "#F35A4A",
        "psa-text": "#F9FAFB",
        "psa-muted": "#9CA3AF",
      },
    },
  },
  plugins: [],
};

export default config;
