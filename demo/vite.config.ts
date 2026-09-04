import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { thirdPartyNoticesPlugin } from "./third-party-notices.js";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/colorwheel/",
  plugins: [react(), thirdPartyNoticesPlugin()],
  resolve: {
    alias: {
      "@library": fileURLToPath(new URL("../src", import.meta.url))
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
