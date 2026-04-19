import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
  },
  // React 19 automatic JSX runtime — lets .test.tsx files use JSX without
  // importing React. Without this, esbuild defaults to the classic runtime
  // which requires `import React from "react"` in every test file.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
