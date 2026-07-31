import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "dist-node/", "node_modules/", "coverage/", ".wrangler/"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-empty": ["error", { "allowEmptyCatch": true }],
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
        File: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        Request: "readonly",
        Response: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  }
);
