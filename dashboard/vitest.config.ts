import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
    // Fork pool (process-per-file) isolates process.cwd() and process.env so
    // tests that use process.chdir() or mutate SLEEPWALKER_REPO_ROOT don't
    // bleed into parallel workers. The default threads pool shares process
    // state across workers in the same thread pool, which broke ~50 tests
    // whenever bundles.test.ts (process.chdir) ran alongside save-to-repo
    // tests (SLEEPWALKER_REPO_ROOT).
    pool: "forks",
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
