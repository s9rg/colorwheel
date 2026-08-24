import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/angular/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"]
  }
});
