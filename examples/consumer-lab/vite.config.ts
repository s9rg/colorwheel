import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vue()],
  server: {
    host: "127.0.0.1",
    port: 4175,
    proxy: {
      "/angular": {
        target: "http://127.0.0.1:4177",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4176,
    proxy: {}
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        react: resolve(import.meta.dirname, "react/index.html"),
        vanilla: resolve(import.meta.dirname, "vanilla/index.html"),
        vue: resolve(import.meta.dirname, "vue/index.html")
      }
    }
  }
});
