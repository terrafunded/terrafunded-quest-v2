import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // shadcn-style primitives export their cva variants next to the component, and the
    // auth module exports its provider and hook together. Both are intentional.
    files: ["src/components/ui/**/*.tsx", "src/data/auth.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // The domain layer is pure TypeScript: no React, no Supabase, no DOM.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "@tanstack/*", "@supabase/*", "@/data/*", "@/components/*"], message: "src/domain must stay pure TypeScript." },
          ],
        },
      ],
    },
  },
);
