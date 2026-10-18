import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const nonDeterministic = [
  { object: "Math", property: "random", message: "Use the seeded PRNG (src/util/rng.ts)." },
  {
    object: "Date",
    property: "now",
    message: "Time comes from the injected clock (src/app/clock.ts).",
  },
  {
    object: "performance",
    property: "now",
    message: "Time comes from the injected clock (src/app/clock.ts).",
  },
  { object: "crypto", property: "getRandomValues", message: "Use the seeded PRNG." },
  { object: "crypto", property: "randomUUID", message: "Use the seeded PRNG." },
];

const noPersistence = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
];

export default tseslint.config(
  { ignores: ["dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "no-console": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-restricted-properties": ["error", ...nonDeterministic],
      "no-restricted-globals": [
        "error",
        ...noPersistence.map((name) => ({
          name,
          message: "The game is stateless: no storage and no network sockets.",
        })),
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // Pure simulation: no DOM, no audio, no rendering imports, no clocks.
  {
    files: ["src/sim/**/*.ts"],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "navigator",
        "AudioContext",
        "requestAnimationFrame",
        "setTimeout",
        "setInterval",
        "fetch",
        ...noPersistence,
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["**/render/**", "**/audio/**", "**/input/**", "**/ui/**", "**/app/**"] },
      ],
    },
  },
  // The only places allowed to read real time or the network.
  { files: ["src/app/clock.ts"], rules: { "no-restricted-properties": "off" } },
  { files: ["src/assets/loader.ts"], rules: { "no-restricted-globals": "off" } },
  // Node-side tooling and tests.
  {
    files: ["scripts/**/*.mjs", "*.config.ts", "*.config.js", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "no-console": "off",
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },
  { files: ["scripts/**/*.mjs", "eslint.config.js"], ...tseslint.configs.disableTypeChecked },
);
