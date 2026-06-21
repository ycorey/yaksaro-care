# 02. 성분 정규화 검증 — 한국 건기식 10종 → RxNorm

> STEP 2 · 2026-06-21 · RxNav 실호출(`https://rxnav.nlm.nih.gov/REST`, 키 불필요)
> 스크립트: `02_rxnorm_probe.mjs`(임상명) / `02b_naive_probe.mjs`(통칭 격차) · 원자료: `02_*_result.json`

## 핵심 결론 (3줄)
1. **10/10 전부 ingredient(IN) 레벨로 RxCUI 매핑 성공** → RxNorm의 성분 커버리지는 우리 용도에 **충분**.
2. 단, **정밀 매핑은 "올바른 영문 임상 성분명"을 알아야** 정확 → 한글 통칭→임상명 **수동 사전이 실제 산출물**이다(RxNorm 커버리지가 문제가 아니라 *입력 정규화*가 관건).
3. **프로바이오틱스는 진짜 난제**(속명/통칭 매칭 실패 → **균주 단위** 필요). 그 외 통칭은 대체로 매칭되나 **광의 개념으로 풀려 정밀도 손실** 위험.

---

## A. 임상명 기반 매핑 결과 (정밀 사전용)

| # | 한글 통칭 | 채택 영문 성분명 | RxCUI | RxNorm name | tty | 매칭 |
|---|---|---|---|---|---|---|
| 1 | 오메가3(EPA/DHA) | omega-3 acid ethyl esters | **484348** | omega-3 acid ethyl esters (USP) | IN | EXACT |
| 2 | 마그네슘 | magnesium | **6574** | magnesium | IN | EXACT |
| 3 | 비타민K | phytonadione | **8308** | vitamin K1 | IN | EXACT |
| 4 | 은행잎 추출물 | ginkgo biloba | **236809** | Ginkgo biloba extract | IN | EXACT |
| 5 | 세인트존스워트 | st. john's wort | **258326** | St. John's wort extract | IN | EXACT |
| 6 | 칼슘 | calcium | **1895** | calcium | IN | EXACT |
| 7 | 철분 | iron | **90176** | iron | IN | EXACT |
| 8 | 코엔자임Q10 | ubidecarenone | **21406** | ubidecarenone | IN | EXACT |
| 9 | 프로바이오틱스 | lactobacillus acidophilus | **6205** | Lactobacillus acidophilus | IN | EXACT |
| 10 | 비타민D | cholecalciferol | **2418** | cholecalciferol | IN | EXACT |

> 전 항목 `tty=IN`(ingredient) — 상호작용 조회의 기준 단위로 적합.

## B. "통칭 직역" 격차 검증 (naive vs 임상명)

`search=2`(normalized) 모드로 한글 직역 통칭을 그대로 넣었을 때:

| 통칭 입력 | 결과 | RxCUI | 임상명 RxCUI와 비교 |
|---|---|---|---|
| omega-3 | EXACT | 4301 | ⚠️ **다름**(484348) — 광의 fish-oil 개념 |
| fish oil | EXACT | 4419 | ⚠️ 또 다른 개념 |
| vitamin K | EXACT | 11258 | ⚠️ **다름**(phytonadione 8308) |
| vitamin D | EXACT | 11253 | ⚠️ **다름**(cholecalciferol 2418) |
| coenzyme Q10 | EXACT | 21406 | ✅ 동일(동의어 해소됨) |
| ginkgo | EXACT | 236809 | ✅ 동일 |
| st johns wort | EXACT | 258326 | ✅ 동일 |
| calcium / iron / magnesium | EXACT | 1895 / 90176 / 6574 | ✅ 동일 |
| **probiotics** | **NONE** | – | ❌ 매칭 실패 |
| **lactobacillus**(속명) | **NONE** | – | ❌ 매칭 실패 |

### 해석
- RxNorm `search=2`는 의외로 관대 → 통칭 12개 중 **10개 매칭**. 그러나…
- **함정 1 — 개념 드리프트:** omega-3/vitamin K/vitamin D는 통칭이 **광의 개념(class성)** 으로 풀려 정밀 성분(ethyl ester, phytonadione, cholecalciferol)과 **RxCUI가 갈린다.** 상호작용 조회 시 광의 개념이 더 많이/적게 잡힐 수 있어 **사전에 "정밀 RxCUI 고정"이 안전.**
- **함정 2 — 프로바이오틱스:** "probiotics"·"lactobacillus"(속) 모두 실패. **균주(species) 단위**("Lactobacillus acidophilus")로 내려가야 매칭. 실제 제품은 다균주 혼합이라 **대표 균주 매핑 + 일반 규칙(항생제와 2시간 간격)** 으로 보완 필요.

---

## C. 실패/주의 항목 대체 전략

| 항목 | 문제 | 대체 매핑 전략 |
|---|---|---|
| 프로바이오틱스 | 통칭/속명 매칭 불가 | 대표 균주(L. acidophilus 6205, Bifidobacterium 등)로 매핑 + "항생제 동시복용 시 간격" **규칙 기반** 처리(상호작용 DB 의존 X) |
| 오메가3 | 통칭이 광의로 드리프트 | 사전에 **484348(정밀) 우선, 4301(광의) 보조** 둘 다 보관해 교차조회 |
| 비타민K/D | 통칭≠임상명 RxCUI | 사전에 phytonadione/cholecalciferol **임상명 고정**(통칭은 별칭으로만) |
| 한글 OCR 변형 | "오메가-3", "오메가쓰리" 등 표기 흔들림 | 입력 정규화 단계에서 **한글 별칭 테이블** 선적용 후 사전 조회 |

### 권장: 수동 정규화 사전 스키마 (이번 PoC의 실질 산출물)
```jsonc
// ko_supplement_dictionary.json (시드 10종, 확장 대상)
{
  "오메가3": { "en": "omega-3 acid ethyl esters", "rxcui": "484348", "rxcui_broad": "4301",
               "aliases": ["오메가-3","오메가쓰리","EPA","DHA","피쉬오일"] },
  "마그네슘": { "en": "magnesium", "rxcui": "6574", "aliases": ["Mg","마그네숨"] },
  "비타민K": { "en": "phytonadione", "rxcui": "8308", "aliases": ["비타민케이","vitamin k1"] },
  "은행잎추출물": { "en": "ginkgo biloba", "rxcui": "236809", "aliases": ["징코","은행잎"] },
  "세인트존스워트": { "en": "st. john's wort", "rxcui": "258326", "aliases": ["성요한초","고추나물"] },
  "칼슘": { "en": "calcium", "rxcui": "1895", "aliases": ["Ca"] },
  "철분": { "en": "iron", "rxcui": "90176", "aliases": ["철","Fe","훼럼"] },
  "코엔자임Q10": { "en": "ubidecarenone", "rxcui": "21406", "aliases": ["코큐텐","CoQ10","유비퀴논"] },
  "프로바이오틱스": { "en": "lactobacillus acidophilus", "rxcui": "6205", "strain_level": true,
                    "rule": "항생제와 2시간 이상 간격", "aliases": ["유산균","락토바실러스"] },
  "비타민D": { "en": "cholecalciferol", "rxcui": "2418", "aliases": ["비타민디","비타민D3","D3"] }
}
```

---

## D. 검증된 사실 / 미결

| 항목 | 상태 |
|---|---|
| RxNorm 키·라이선스 불필요, 실호출 정상 | ✅ 확인 |
| 10종 IN 레벨 매핑 가능 | ✅ 10/10 |
| 통칭 직역의 한계(드리프트·프로바이오틱스 실패) | ✅ 입증 |
| RxNav rate limit 정확 수치 | △ 미측정(스로틀 미발생, 호출당 120ms 간격으로 무에러). 대량 배치 시 백오프 필요 |
| 한글 별칭/OCR 변형 커버리지 | △ 사전 확장 시 실측 필요 |

## 다음 단계 연결
이 사전의 RxCUI가 **STEP 3 상호작용 매트릭스의 입력 키**가 된다. 즉 "한글 건기식 → (사전) → RxCUI/영문명 → MedData·ODS 질의" 흐름으로 STEP 3 진행.
