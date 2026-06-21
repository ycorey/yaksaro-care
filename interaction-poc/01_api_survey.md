# 01. API 조사 보고서 — 건기식·식품-약물 상호작용 PoC

> 작성일: 2026-06-21 · 범위: STEP 1 (문서 조사, 무자본)
> 목적: MedData / NIH ODS / RxNorm 3종의 **인증·무료한도·약관(상업이용)·엔드포인트**를 검증해 다음 단계 진입 여부 판단.

---

## 0. 한눈에 보기 (의사결정 요약)

| API | 역할 | 인증 | 무료 한도 | 상업 이용 | 상호작용 데이터 | PoC 판정 |
|---|---|---|---|---|---|---|
| **A. MedData (anthesia.io)** | 상호작용 1차 판정 | API key (`X-API-Key`) | **250 calls/월**, 카드 불필요 | ⚠️ **불명확** (유료티어는 명시 허용) | ✅ 약물-건기식 구조화 제공(120+ 보충제) | **검증 진행** (PoC는 무료티어 OK, 상용은 약관 확인 필요) |
| **B. NIH ODS** | 무료 원천 | 없음(공개) | 사실상 무제한(공공) | ✅ 퍼블릭 도메인(美 연방) | ⚠️ **비구조화**(팩트시트 HTML 산문) / DSLD는 라벨만 | **보조 원천** (구조화는 직접) |
| **C. RxNorm/RxNav (NLM)** | 성분 정규화 | **불필요** | 별도 키 없음(rate limit만) | ✅ 비독점·공개 | ❌ (상호작용 API는 2024.1 폐지) | **핵심 채택** (정규화 전용) |

**결론(잠정):** `RxNorm(정규화) → MedData(1차 판정) → PubMed(근거심화)` 조합이 1순위. NIH ODS는 MedData가 못 잡는 케이스의 **백업 원천**(단, 산문 파싱 필요). 셋 다 **무료로 PoC 가능**. 단 **MedData 무료티어의 상업 이용 가부가 최대 미해결 리스크** → STEP 5 전에 확정 필요.

---

## A. MedData API (anthesia.io) — 1순위 검증 대상

### 인증
- 무료 회원가입 → "Get my free key"로 즉시 발급. 이메일로도 사본 발송.
- 호출 시 **`X-API-Key` 헤더**에 키 전달.

### 무료 한도 / 가격
| 티어 | 가격 | 호출/월 | 비고 |
|---|---|---|---|
| Free | $0 | **250** | 카드 불필요. 약물검색+보충제+상호작용 체크 포함 |
| Starter | $29 | 5,000 | "Drug-supplement interactions" + **commercial use** 명시 |
| Growth | $79 | 25,000 | adverse event 데이터 + batch 엔드포인트 |
| Business | $199 | 100,000 | custom rate limit + SLA |
| Enterprise | Custom | 100,000+ | 별도 계약 |

### 약관(이용약관 https://anthesia.io/terms) — 핵심 발췌
- 금지: *"Resell, sublicense, or commercially exploit the Service except as expressly permitted by these Terms or a separate written agreement."*
- 캐싱: *"You may cache API responses solely to the extent necessary to operate your application … You may not build or distribute a derivative database that materially substitutes for the API itself."*
- 출처표기: *"If we provide source data attribution requirements, you agree to display them in any user-facing context where the data appears."*
- 면책: *"…not medical advice and is not a substitute for the diagnosis, advice, or treatment of a qualified healthcare professional."* + 간접·결과손해 면책.

> ⚠️ **상업 이용 리스크(최우선 확인 사항)**
> - 약관은 티어별 상업 구분을 **명시하지 않음**. 마케팅 페이지는 **Starter($29) 티어에 "commercial use"를 명시** → 무료티어=비상업으로 해석될 소지.
> - "Service 자체를 재판매/상업적 착취" 금지일 뿐, **내 앱 내부에서 결과를 활용**하는 것(=재판매 아님)은 일반적으로 허용 범위. 그러나 **무료티어로 상용 서비스 운영**은 회색지대.
> - **PoC(내부 검증)에는 무료티어로 충분.** 상용 출시 전 → ① Starter 이상 결제 또는 ② 서면 확인 메일 필요. **리포트(STEP 5)에 명시 플래그 유지.**

### 엔드포인트
- 확인된 예시: `GET /api/v1/drugs/search?name=metformin` → RxCUI·brand·generic·manufacturer·dosage form·strength 반환.
- 상호작용: "drug-drug / drug-supplement / unified" 체크 **기능은 명시**되나 정확한 경로·파라미터는 마케팅 페이지에 미공개. → **Swagger UI(`https://meddata.anthesia.io` 개발자 문서)에서 STEP 3 직전 확정** 필요.
- MCP 서버 제공: `github.com/anthesiallc/meddata-mcp` (Smithery: `smithery.ai/server/anthesiallc/meddata`).

### 데이터 출처
openFDA(라벨·NDC·이상사례) + RxNorm(RxCUI 정규화) + **NIH ODS(보충제 120+종: 용량·상호작용·근거등급 큐레이션)**.

> 📝 검증 메모: WebFetch가 초기에 반환한 `https://meddata.api/docs` 류 URL은 **실재하지 않는 placeholder(환각)** 로 판단 → 무시. 실제 문서·데모는 `meddata.anthesia.io` 하위. STEP 3에서 Live Demo로 실제 응답 JSON 확인.

---

## B. NIH ODS — 무료 원천 (두 갈래로 분리해서 이해해야 함)

ODS는 단일 API가 아니라 **성격이 다른 두 리소스**다. 이 구분이 핵심.

### B-1. DSLD Label API (Dietary Supplement Label Database)
- Base URL: **`https://api.ods.od.nih.gov/dsld/v9/`** (v9.2.0, 2023.11 기준), 응답 **JSON**, SwaggerHub 문서.
- 내용: 제품 **라벨/성분 정보**(성분명·함량·%DV·제조사·경고문구·라벨 이미지).
- ⚠️ **상호작용 데이터 없음.** 라벨에 적힌 것만 제공 → "어떤 제품에 어떤 성분이 얼마" 확인용이지, "이 성분 ↔ 이 약" 판정은 불가.
- 약관: 美 연방 공공데이터(퍼블릭 도메인) → 상업 이용 자유. 인증키 불필요(추정, STEP 3 실호출로 확인).
- 문서: https://dsld.od.nih.gov/api-guide (※ WebFetch는 403 → 브라우저/실호출로 확인 필요)

### B-2. ODS Fact Sheets API (팩트시트)
- 엔드포인트: `https://ods.od.nih.gov/api/` — 파라미터: `resourcename`, 가독수준(전문가/소비자), 출력형식(**HTML**).
- 내용: 마그네슘·오메가3 등 성분별 **팩트시트 본문**(건강효과·안전성·권장량·**약물 상호작용**·영문/스페인어).
- ⚠️ **상호작용이 "구조화 데이터"가 아니라 산문(HTML)** 안에 서술됨 → 기계 판정하려면 **직접 파싱/추출** 필요(정규식·LLM 추출). 이게 ODS 직접 연동의 최대 단점.

> **B 요약:** 무료·공개·상업가능이지만, **바로 쓸 수 있는 구조화된 상호작용 테이블이 없다.** MedData가 바로 이 ODS를 큐레이션해 구조화한 것 → MedData를 쓰면 이 가공을 대신해 줌. ODS 직접은 MedData가 비는 케이스의 **근거 보강·교차검증용**으로 한정 권장.

---

## C. RxNorm / RxNav (NLM) — 성분 정규화 핵심 (무료)

### 인증 / 약관
- **API 키 불필요, 라이선스 불필요.** 사유: *"no license is needed to use the RxNorm API"* — RxNorm은 NLM의 비독점 어휘.
- 상업 이용 가능(비독점·공개). 단 **출처표기 권고**: *"This product uses publicly available data from the U.S. National Library of Medicine … NLM is not responsible for the product and does not endorse…"*
- Rate limit: NLM이 IP당 throttle 적용(통상 문서상 ~20 req/s 수준) → STEP 2에서 실측·백오프 적용. (정확 수치는 RxNav TermsofService에서 확인)

### Base URL / 엔드포인트 (정규화용)
- Base: **`https://rxnav.nlm.nih.gov/REST/`**
- `GET /rxcui?name={성분명}` — findRxcuiByString: 이름→RxCUI
- `GET /approximateTerm?term={질의}` — getApproximateMatch: 근사 매칭(철자흔들림·동의어)
- `GET /drugs?name={이름}` — getDrugs: 관련 약물
- `GET /displaynames` — 자동완성용 표시명

### 제공 API 목록 / 주의
- RxNorm API, Prescribable RxNorm API, RxTerms API, RxClass API.
- ⚠️ **독립 Drug Interaction(ONCHigh) API는 NLM이 2024년 1월 폐지.** → RxNav는 더 이상 상호작용 판정을 주지 않음. **우리 설계와 일치**: RxNorm은 **정규화 전용**, 판정은 MedData/ODS가 담당.

### 건기식 성분 커버리지 (STEP 2의 최대 관건)
- 비타민·미네랄(오메가3·마그네슘·칼슘·철·D 등)은 ingredient로 대체로 존재할 가능성 높음.
- 허브·식물추출물(은행잎 Ginkgo, 세인트존스워트, CoQ10, 프로바이오틱스)은 **부분 커버**일 수 있음 → 실패 시 수동 사전(대체 매핑) 필요. **STEP 2에서 10종 실제 매핑으로 확정.**

---

## 검증 상태 / 미결 항목 (다음 단계로 이월)

| 항목 | 상태 | 다음 액션 |
|---|---|---|
| MedData 무료티어 **상업 이용 가부** | ⚠️ 회색지대 | 상용 전 결제 또는 서면 확인. PoC엔 무방 |
| MedData **상호작용 엔드포인트 경로/파라미터** | 미확정 | STEP 3 직전 Swagger/Live Demo로 확정 |
| MedData 실제 **응답 JSON 구조·severity 제공 여부** | 미확정 | STEP 3 실호출 |
| DSLD **인증키 필요 여부** | 추정(불필요) | STEP 3 실호출로 확인 |
| RxNav **정확한 rate limit 수치** | 추정 | STEP 2 실측 + 백오프 |
| RxNorm **허브 성분 커버리지** | 미검증 | STEP 2 핵심 검증 |

---

## 출처
- MedData: https://meddata.anthesia.io/ · https://anthesia.io/meddata · 약관 https://anthesia.io/terms · MCP https://github.com/anthesiallc/meddata-mcp
- NIH DSLD: https://dsld.od.nih.gov/api-guide · API base https://api.ods.od.nih.gov/dsld/v9/ · https://ods.od.nih.gov/Research/databases.aspx
- NIH ODS Fact Sheets/API: https://ods.od.nih.gov/api/ · https://ods.od.nih.gov/factsheets/list-all/
- RxNorm/RxNav (NLM): https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html · base https://rxnav.nlm.nih.gov/REST/
