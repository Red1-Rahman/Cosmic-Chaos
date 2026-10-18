import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: {
    target: "es2023",
    outDir: "dist",
    // Keep bundle output away from public/assets so the two never collide.
    assetsDir: "bundle",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/{spec,unit,cross-module,regression}/**/*.test.ts"],
    setupFiles: ["tests/setup/fail-on-console.ts"],
    passWithNoTests: false,
    retry: 0,
    sequence: { shuffle: false },
  },
});
