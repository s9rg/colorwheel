import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "editor/index": "src/editor/index.ts",
    "react/index": "src/react/index.ts",
    "dom/index": "src/dom/index.ts",
    "vue/index": "src/vue/index.ts",
    "react-native/index": "src/react-native/index.ts"
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["react", "react-dom", "react-native", "react-native-svg", "vue"]
});
