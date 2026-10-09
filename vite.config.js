import { defineConfig } from "vite";
import { hubPwa } from "./scripts/pwa-vite.js";

export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  plugins: [hubPwa()],
});
