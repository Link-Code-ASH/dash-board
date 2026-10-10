import { defineConfig } from "vite";
import { hubPwa } from "./scripts/pwa-vite.js";
import { stockMarketPlugin } from "./scripts/stock-market.js";

export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  plugins: [stockMarketPlugin(), hubPwa()],
});
