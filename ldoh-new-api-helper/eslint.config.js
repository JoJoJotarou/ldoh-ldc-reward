import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  // 1. 针对 src 目录：浏览器 + 油猴环境
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
        unsafeWindow: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },
  // 2. 针对 根目录脚本 (build.js)：Node.js 环境
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
];
