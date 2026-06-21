// end-to-end 시연: 한글 건기식 + 약물 → 구조화 JSON
// 실행: node --env-file=../.env demo.mjs   (../.env 의 MEDDATA_API_KEY 사용)
import { analyzeInteraction } from "./pipeline.mjs";

const KEY = process.env.MEDDATA_API_KEY || "";
const CASES = [
  ["오메가3", "warfarin"],              // 정상 검출 + 매칭
  ["세인트존스워트", "ethinyl estradiol"], // ★ 클래스 라벨 매칭 테스트(문자열엔 약물명 없음)
  ["자몽", "simvastatin"],              // 사전 미수록(식품) — NORMALIZE_FAIL 폴백
];

for (const [supp, drug] of CASES) {
  console.log("\n" + "=".repeat(70));
  console.log(`입력: ${supp} × ${drug}`);
  const out = await analyzeInteraction(supp, drug, { apiKey: KEY });
  // 요약 라인
  console.log(`status=${out.status}` +
    (out.meddata ? ` | 반환 ${out.meddata.returned_pairs}→dedup ${out.meddata.deduped}→매칭 ${out.meddata.matched}(드롭 ${out.meddata.dropped})` : "") +
    (out.interpretation ? ` | severity=${out.interpretation.severity_final}` : ""));
  console.log(JSON.stringify(out, null, 2));
}
