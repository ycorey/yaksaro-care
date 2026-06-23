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
    // 핸드오프 프로토타입 — 앱 소스 아님, 린트 대상 제외
    "design_handoff_yaksaro_care/**",
    // 상호작용 PoC·평가 하네스(독립 .mjs 스크립트) — 앱 소스 아님, 린트 대상 제외
    "interaction-poc/**",
  ]),
]);

export default eslintConfig;
