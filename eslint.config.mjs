import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // CJS build scripts — not part of the Next.js app bundle
    "data-entry/**",
    // Claude Code worktrees
    ".claude/worktrees/**",
    // Generated data (millions of lines; ESLint runs out of memory on it)
    "data/**",
    // Static assets and prebuilt JSON
    "public/**",
    // Hand-run pipeline scripts and e2e output — tooling, not shipped code
    "scripts/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
