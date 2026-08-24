import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptFiles = ["**/*.{ts,tsx}"];

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".angular-build",
      "coverage",
      "demo/dist",
      "playwright-report",
      "test-results",
      // These are compiled as external consumers against the packed tarball.
      "test/types"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles
  })),
  {
    files: ["*.{js,mjs,ts}", "scripts/**/*.{js,mjs,ts}", "demo/vite.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["src/{core,editor}/**/*.ts"],
    languageOptions: {
      globals: globals.es2021
    }
  },
  {
    files: [
      "src/react/**/*.{ts,tsx}",
      "src/dom/**/*.ts",
      "src/vue/**/*.ts",
      "src/angular/**/*.ts",
      "src/react-native/**/*.{ts,tsx}",
      "demo/src/**/*.{ts,tsx}",
      "test/**/*.{ts,tsx}"
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ["src/react/**/*.{ts,tsx}", "src/react-native/**/*.{ts,tsx}", "demo/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    files: ["demo/src/**/*.{ts,tsx}"],
    plugins: {
      "react-refresh": reactRefresh
    },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
