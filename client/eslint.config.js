import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactRefresh.configs.vite,
    ],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
        // tsconfig.json covers src/ and tests/
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // tsc handles undefined checks natively
      "no-undef": "off",
      // Use TS-aware no-unused-vars
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^[A-Z_]",
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // The server's rule settings (server/eslint.config.js)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // A default does not excuse a missing union member, so a new entity
      // type cannot fall silently into it
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-conversion": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Ratcheted in eslint-suppressions.json, fixed by the PRs that own the
      // code: `any`, unsafe access and non-null assertions in the filters,
      // playback, list and detail-page code (only there), a `||` on a string
      // or number (where "" or 0 can mean something), and conditions that
      // only become checkable once types are honest. The counts may only fall.
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",

      // Not adopted, as on the server. Enums are string-literal unions, so
      // TypeScript already rejects a comparison with a non-member; the other
      // is style.
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  // untrusted() is the deliberate cast for invalid input: its type parameter
  // is the target type, used once by design (as on the server).
  {
    files: ["tests/helpers/untrusted.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
    },
  },
]);
