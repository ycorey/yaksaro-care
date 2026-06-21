# 04. 통합 파이프라인 프로토타입 (PoC)

한글 건기식명 + 약물명 → **구조화 상호작용 JSON**. STEP 1~3 검증 결과를 반영한 최소 동작 코드.

## 흐름
```
한글 건기식 + 약물명
 → [정규화]   normalize.mjs : ko 사전(건기식) + RxNorm(약물) → 영문/RxCUI
 → [1차 판정] meddata.mjs   : GET /interactions/supplements (건기식 전체 목록 반환)
 → [관련성]   relevance.mjs : ★질의약물 기준 선별 + dedup★  ← STEP 3 핵심 발견 대응
 → [근거]     evidence.mjs  : PubMed(NCBI E-utilities) 실연동 — esearch+esummary+efetch
 → [해석]     interpret.mjs : severity 종합 + 약사/환자 문구 (Claude stub, 실호출 TODO)
 → JSON 출력  pipeline.mjs  : analyzeInteraction(koSupp, drug, {apiKey})
```

## 실행
```bash
# ../.env 에 MEDDATA_API_KEY 필요 (signup으로 발급됨)
cd 04_pipeline_poc
node --env-file=../.env demo.mjs
```

## 실제 동작(✅) vs 인터페이스만(🟡 TODO)
| 레이어 | 상태 | 비고 |
|---|---|---|
| 건기식 정규화(사전) | ✅ | 시드 10종, 별칭/통칭 매칭 |
| 약물 정규화(RxNorm) | ✅ | findRxcuiByString 실호출 |
| MedData 1차 판정 | ✅ | 실호출(키 사용) |
| **관련성 매칭 + dedup** | ✅ | **PoC의 핵심 — 클래스 라벨 매칭** |
| PubMed 근거 | ✅ | `fetchEvidence()` 실연동(NCBI E-utilities, 의존성 0). 실제 PMID·초록 반환 |
| Claude 해석 | 🟡 TODO | `interpret()` 시그니처만. 기전/문구 생성 예정 |

## 검증된 동작(demo 3케이스)
| 입력 | 결과 | 포인트 |
|---|---|---|
| 오메가3 × warfarin | INTERACTION_FOUND, moderate, **evidence-backed** | 4쌍→dedup→warfarin 1쌍 선별(2 드롭) + PubMed 3건(top: PMID 14742793 "Fish oil interaction with warfarin") |
| 세인트존스워트 × ethinyl estradiol | INTERACTION_FOUND, high, **evidence-backed** | **8쌍 중 "Oral contraceptives" 1쌍만 매칭**(7 드롭) + PubMed 3건(2016 체계적고찰·2003 RCT) |
| 자몽 × simvastatin | NORMALIZE_FAIL | 식품/사전미수록 graceful 처리 |

> PubMed `confidence`가 `unverified` → **`evidence-backed`** 로 전환됨(근거 논문 ≥1건 시).

## 핵심 설계 결정 (STEP 3 발견 반영)
1. **MedData는 passthrough 불가.** 건기식 전체 상호작용을 반환하고 약물쪽 `rxcui=null`·자유텍스트 클래스 라벨 → `relevance.mjs`가 **질의약물을 클래스/동의어로 확장해 선별**. 미적용 시 노이즈(전체노출) 또는 누락(정확매칭)·
2. **dedup 필수.** 동일 내용이 `Supplements DB` / `ODS factsheet` 출처로 중복 등장.
3. **근거·해석 분리.** MedData엔 citation·근거등급 없음 → PubMed(evidence) + Claude(interpret)가 신뢰층을 담당. 이 분리가 경쟁 차별점.

## 프로덕션 승급 TODO
- `relevance.mjs` 규칙매처 → **Claude LLM 관련성 판정**(클래스 표현 다양성 흡수, 한글 약물명 대응).
- `DRUG_HINTS` 수기 → **RxClass API(RxNav)** 로 약물→클래스 자동 확장.
- 약물 정규화에 **한글 제품명→성분** 경로 추가(기존 앱 drugs 테이블/DUR 재사용).
- 식품(자몽 등) 별도 소스(PubMed/규칙) — MedData supplement DB 미수록.
- 캐싱(상호작용 쌍은 거의 불변) + MedData 무료 250콜/월 한도 관리.
- 면책/약사검수 게이트: severity 절대시 금지, 환자 노출 전 검수.

## 파일
```
ko_supplement_dictionary.json   정규화 사전(시드 10)
lib/normalize.mjs  lib/meddata.mjs  lib/relevance.mjs  lib/evidence.mjs  lib/interpret.mjs
pipeline.mjs       오케스트레이터
demo.mjs           end-to-end 시연
```
