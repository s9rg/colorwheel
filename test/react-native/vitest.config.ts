import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "react-native-portable",
    environment: "node",
    include: ["test/react-native/**/*.test.ts", "test/react-native/**/*.test.tsx"]
  }
});
