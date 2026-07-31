import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/", "coverage/"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        crypto: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        btoa: "readonly",
      },
    },
  }
);
