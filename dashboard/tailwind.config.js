/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sw: {
          bg: "#0a0a0f",
          panel: "#13131a",
          border: "#1f1f29",
          text: "#e5e5ec",
          muted: "#7c7c8a",
          accent: "#6366f1",
          green: "#10b981",
          yellow: "#f59e0b",
          red: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui"],
        mono: ["ui-monospace", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [],
};
