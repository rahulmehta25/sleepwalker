/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lunar/celestial palette — deep midnight base, dawn warmth accents, moonlight silver text
        ink: {
          900: "#06070d",   // deepest midnight
          800: "#0b0d18",   // panel base
          700: "#11141f",   // raised panel
          600: "#1a1d2c",   // hairline borders
          500: "#262a3d",   // hover state
        },
        moon: {
          50:  "#f5f6fa",   // headline white
          200: "#d8dde8",   // body text
          400: "#9aa0b6",   // muted text
          600: "#5e6378",   // dim text
        },
        dawn: {
          200: "#ffe9c1",   // soft glow highlight
          400: "#f3c282",   // dawn warm primary
          500: "#e8a35a",   // dawn warm pressed
          700: "#9a6233",   // dawn warm shadow
        },
        aurora: {
          400: "#7b9eff",   // cool blue accent
          500: "#5a82f5",   // pressed
        },
        signal: {
          green:  "#76d1a8",
          amber:  "#f3c282",
          red:    "#e87a7a",
        },
      },
      fontFamily: {
        // Display: Fraunces (variable, with SOFT and OPSZ — characterful)
        display: ["Fraunces", "ui-serif", "Georgia"],
        // Body: Bricolage Grotesque (variable, distinctive sans)
        sans: ["'Bricolage Grotesque'", "ui-sans-serif", "system-ui"],
        // Data: JetBrains Mono (characterful monospace)
        mono: ["'JetBrains Mono'", "ui-monospace", "Menlo"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.025em",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(243, 194, 130, 0.15), 0 0 30px -8px rgba(243, 194, 130, 0.35)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 0 0 1px rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "atmosphere": "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(122, 158, 255, 0.08), transparent 60%), radial-gradient(ellipse 60% 50% at 100% 0%, rgba(243, 194, 130, 0.06), transparent 50%), radial-gradient(ellipse 70% 70% at 0% 100%, rgba(122, 158, 255, 0.04), transparent 60%)",
      },
    },
  },
  plugins: [],
};
