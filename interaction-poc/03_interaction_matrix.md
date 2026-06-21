# 03. 상호작용 매트릭스 — 구조 조사 + 틀 (키 발급 전)

> STEP 3 (키 없이) · 2026-06-21 · 러너: `03_run_matrix.mjs` · 구조탐침: `03_probe_structure.mjs`
> 상태: **MedData·DSLD·ODS 접근성/구조 확정 완료. 10케이스 실제 결과는 MedData 키 발급 후 1커맨드로 채움.**

---

## A. API 접근성 검증 결과 (키 없이 실호출로 확인)

| 원천 | 키 없이 접근 | 결과 | 상호작용 데이터 |
|---|---|---|---|
| **MedData OpenAPI 스펙** | ✅ `GET /openapi.json` 200 (48KB) | 전체 엔드포인트·스키마 확보 | (호출엔 키 필요) |
| **MedData 상호작용 호출** | ❌ 키 필요(`X-API-Key`) | 401/403 예상 | ✅ 구조 확정(아래) |
| **DSLD `search-filter`** | ✅ 200 JSON | 성분/라벨 데이터 | ❌ 없음(라벨만) |
| **ODS 팩트시트 API** | ❌ **Cloudflare 챌린지(403)** | 자동접근 차단 | ⚠️ 산문 HTML(접근 불가) |

> **중요 발견:** ODS 팩트시트 API는 Cloudflare "Just a moment…" 봇 차단에 막혀 **서버사이드 자동 호출 불가**. → ODS 상호작용을 직접 긁는 경로는 사실상 닫힘. **MedData가 ODS를 큐레이션해 구조화 제공하는 가치가 더 커짐.** ODS 직접은 (수동 열람/근거표기용)으로만.

---

## B. MedData 상호작용 API 구조 (openapi.json에서 확정)

### 핵심 엔드포인트
| 엔드포인트 | 파라미터 | 용도 |
|---|---|---|
| `GET /api/v1/interactions/supplements` | `drugs`*(콤마구분 영문 약물명), `supplements`*(콤마구분 영문 건기식명) | **약물-건기식(우리 핵심)** |
| `GET /api/v1/interactions/check` | `items`*(약물+건기식 혼합 콤마구분) | 통합 체크 |
| `GET /api/v1/interactions` | `drugs`(RxCUI) 또는 `names` | 약물-약물(DUR, 기존 보유) |
| `GET /api/v1/supplements/search` | `name`*, `limit` | 건기식 인식 여부 확인 |
| `POST /api/v1/signup` | body | **무료 키 발급(프로그램적 가능)** |

> **입력이 "이름 기반"** → STEP 2의 RxNorm 정규화로 얻은 **영문 성분명을 그대로** `supplements=`에 넣으면 됨. RxCUI는 응답에서 역확인용으로 돌아옴.

### 응답 데이터 shape — `InteractionPair`
```jsonc
{
  "item_1_name": "warfarin", "item_1_rxcui": "11289", "item_1_type": "drug",
  "item_2_name": "Fish Oil", "item_2_rxcui": null,    "item_2_type": "supplement",
  "severity": "moderate",          // ✅ 제공
  "description": "May increase ...",// ✅ 제공 (기전은 이 산문 안에 섞임)
  "source": "NIH ODS"              // ✅ 제공 (출처표기 의무 대응)
}
```
### `SupplementProfile` (supplements/search·get)
```jsonc
{ "id","name","alternate_names":[], "description", "common_dosages":[],
  "known_interactions":[], "evidence_summary", "source_url" }
```

> ⚠️ **갭 분석 (STEP 4 근거층의 존재 이유):**
> MedData는 **severity·description·source는 주지만** `mechanism`(기전 구조화)·`citation`(PubMed 논문) 필드는 **없음**. 기전은 description 산문에 섞여 있고, 근거는 "source 라벨"뿐.
> → **약사용 신뢰 등급/근거 논문**은 우리 `/api/evidence`(PubMed) 레이어가 보강해야 함. 이게 경쟁 차별점의 핵심.

---

## C. DSLD `search-filter` 구조 (키 없이 200 확인)
- `GET https://api.ods.od.nih.gov/dsld/v9/search-filter?q={성분}&size=N` → Elasticsearch식 `hits[]`
- `_source.allIngredients[]`: `{ ingredientGroup, name, category("mineral"/"vitamin"/…), notes(염/형태) }`
- 용도: **"이 제품에 이 성분이 들어있나/어떤 염 형태인가"** 확인 → 제품→성분 역매핑 보조. **상호작용 판정엔 부적합.**

---

## D. 10케이스 매트릭스 틀 (결과 칸은 키 발급 후 자동 채움)

각 케이스의 **실행할 정확한 요청 URL은 `03_run_matrix.mjs` 드라이런 출력에 이미 생성됨.** 키 주입 시 `03_matrix_result.json`으로 자동 적재.

**실측 완료(2026-06-21, 무료키 발급 후 20콜).** 원자료: `03_matrix_result.json`

| # | 건기식 | 약물 | 임상적 사실(정답) | MedData | 대표 severity | 해당 쌍 존재 | 반환쌍수 | 비고 |
|---|---|---|---|---|---|---|---|---|
| 1 | Fish Oil | warfarin | 출혈 위험↑ | DETECTED | moderate | ✅ | 4 | warfarin 쌍 명시 |
| 2 | Ginkgo | aspirin | 출혈 위험 | DETECTED | high | ✅ | 1 | NSAID/antiplatelet |
| 3 | St. John's Wort | sertraline | 세로토닌 증후군 | DETECTED | high | ✅ | 9 | SSRI 쌍 명시 |
| 4 | St. John's Wort | ethinyl estradiol | 피임효과 감소 | DETECTED | high | ✅* | 8 | *"Oral contraceptives" **클래스 라벨**로만 |
| 5 | Calcium | ciprofloxacin | 킬레이션 흡수저해 | DETECTED | moderate | ✅ | 5 | fluoroquinolone 쌍 명시 |
| 6 | Vitamin K | warfarin | 항응고 효과 감소 | DETECTED | high | ✅ | 3 | 정답 일치 |
| 7 | Iron | levothyroxine | 흡수 저해 | DETECTED | moderate | ✅ | 6 | 정답 일치 |
| 8 | Grapefruit | simvastatin | CYP3A4 농도↑ | **HTTP 404** | – | ❌ | 0 | **식품 — supplement DB 미수록 확정** |
| 9 | Coenzyme Q10 | warfarin | 항응고 변동 | DETECTED | moderate | ✅ | 1 | 기전설명 단순화(아래 플래그) |
| 10 | Probiotics | amoxicillin | 효과 상쇄(간격) | DETECTED | low | ✅ | 2 | 예상과 달리 검출됨(균주 통칭 인식) |

**커버리지: 9/10** 해당 상호작용 등재. 유일 미검출 = **자몽(식품)** → 식품군은 별도 처리/PubMed 필요.

---

## F. ⚠️ 결정적 발견 — "정밀 페어매칭이 아니다" (제품설계 핵심)

raw 응답(`item_1_name/rxcui`) 검사로 확인한 MedData 동작:

1. **질의 약물로 필터링하지 않음.** `supplements=SJW`면 SJW의 **알려진 상호작용 전체 목록**을 반환. → 케이스 3(×sertraline)과 4(×ethinyl estradiol)가 **거의 동일한 8~9쌍** 반환(SSRI·와파린·피임약·면역억제제·HIV약·digoxin·항경련제·statin 전부).
2. **약물 쪽이 자유텍스트 "클래스 라벨", `item_1_rxcui = null`.** 예: `"SSRIs (sertraline, fluoxetine, …)"`, `"Blood thinners (warfarin)"`, `"Oral contraceptives (birth control pills)"`.
   - → 질의어 `ethinyl estradiol`의 **문자열은 응답에 없음**(클래스로만 존재). **단순 정확매칭이면 케이스 4를 놓침.**
3. **중복 행 존재.** 동일 내용이 `source:"Supplements DB"`와 `source: ODS factsheet URL` 두 번 등장(케이스 1·3·6·7) → **dedup 필요.**

### 이게 의미하는 것 (우리 파이프라인이 반드시 해야 할 일)
- MedData는 "passthrough"로 못 씀. **관련성 매칭/필터 레이어가 필수**:
  `질의약물 → (RxNorm/RxClass로 약물클래스·동의어 확장) → 반환된 자유텍스트 라벨에 퍼지/의미 매칭 → 해당 쌍만 선별`.
- 미선별 시: 전체 프로필 노출(노이즈) ↔ 정확매칭(누락) 양극단. → **LLM 관련성 판정 또는 클래스 사전이 차별점의 실제 엔지니어링.**

## G. 임상 신뢰성 플래그 (약사 검수)
- 전반적으로 방향성은 임상적으로 타당.
- **케이스 9 CoQ10/warfarin**: "structurally similar to vitamin K" 기전 설명은 **단순화/논쟁적**(근거 혼재). 그대로 환자 노출 금지 → PubMed 근거 등급 병기 필요.
- **케이스 1 Fish Oil/warfarin "moderate"**: 최신 근거는 INR 영향 미미 쪽 → MedData가 **보수적으로 과대평가** 경향. severity를 절대시하지 말 것.
- severity는 `high/moderate/low` 3단계뿐, **수치·근거등급(GRADE)·논문 없음** → STEP 4 PubMed층에서 보강.

---

## E. 다음 액션 (택1)
1. **MedData 무료키 발급** → `.env`에 `MEDDATA_API_KEY=` → `node --env-file=.env 03_run_matrix.mjs` → 매트릭스 자동 완성.
   - 무료티어 250콜/월. 본 매트릭스는 케이스당 2콜×10 = **20콜**로 한도 내.
2. 또는 `POST /api/v1/signup`으로 **프로그램적 키 발급** 가능(약관·이메일 확인 후) — 원하면 이 경로도 자동화.

## 미결/리스크
- MedData 무료티어 상업이용 회색지대(STEP 1 플래그 유지)
- 자몽(식품)·프로바이오틱스(통칭) 커버리지 — 실측으로 PubMed 보완 필요성 판단
- ODS 직접 자동접근 불가(Cloudflare) → 근거 보강은 PubMed로 일원화 권장
