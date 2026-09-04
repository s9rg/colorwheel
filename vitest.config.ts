import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "portable",
          environment: "node",
          include: ["test/core/**/*.test.ts", "test/editor/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "web-adapters",
          environment: "jsdom",
          include: [
            "test/dom/**/*.test.ts",
            "test/dom/**/*.test.tsx",
            "test/react/**/*.test.ts",
            "test/react/**/*.test.tsx"
          ],
          setupFiles: ["./test/setup.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "vue-adapter",
          environment: "jsdom",
          include: ["test/vue/**/*.test.ts", "test/vue/**/*.test.tsx"],
          setupFiles: ["./test/setup.ts"]
        }
      },
      {
        extends: true,
        oxc: {
          decorator: {
            legacy: true
          }
        },
        test: {
          name: "angular-adapter",
          environment: "jsdom",
          globals: true,
          include: ["test/angular/**/*.test.ts", "test/angular/**/*.test.tsx"],
          setupFiles: ["./test/setup.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "react-native-adapter",
          environment: "node",
          include: ["test/react-native/**/*.test.ts", "test/react-native/**/*.test.tsx"]
        }
      },
      {
        extends: true,
        test: {
          name: "demo-theme-builder",
          environment: "node",
          include: ["test/demo/**/*.test.ts"]
        }
      }
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70
      }
    }
  }
});
