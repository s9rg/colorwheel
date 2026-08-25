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
  external: ["@angular/core"],
  esbuildOptions(options) {
    // Angular CLI's dependency prebundler uses the literal ɵɵngDeclare
    // marker to decide whether a published library needs the Angular linker.
    // esbuild's default ASCII charset escapes that identifier and prevents the
    // linker from running in development builds.
    options.charset = "utf8";
  }
});
