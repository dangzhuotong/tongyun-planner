import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "src-tauri/target"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "warn",
    },
  },
  {
    files: ["src/plugins/**/*.{ts,tsx}"],
    ignores: ["src/plugins/**/*.test.ts", "src/plugins/**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/data/**", "**/utils/sync/**", "@tauri-apps/plugin-sql"],
              message:
                "插件只能走宿主 ctx。不要引用同步实现或 SQL 插件。这不是安全沙箱，只是评审边界。",
            },
          ],
        },
      ],
    },
  },
);
