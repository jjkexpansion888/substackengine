import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  // Next's App Router uses the automatic JSX runtime; test transforms must agree
  // with it, or server components throw "React is not defined" under vitest.
  esbuild: { jsx: "automatic" },
  // Node-rendered markup tests do not need Next's PostCSS transform.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
