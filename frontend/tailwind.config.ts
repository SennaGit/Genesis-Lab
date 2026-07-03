import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./ui/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        genesis: {
          ink: "#18201c",
          muted: "#66736a",
          panel: "#fbfcf7",
          line: "#dce4d7",
          green: "#226b5b",
          gold: "#b98521",
          red: "#ad3434"
        }
      }
    }
  },
  plugins: []
};

export default config;
