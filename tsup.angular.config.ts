import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: ".angular-build/angular/index.js"
  },
  outDir: "dist/angular",
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  external: ["@angular/core"]
});
