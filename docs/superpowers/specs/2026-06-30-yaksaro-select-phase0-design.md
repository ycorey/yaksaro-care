# 약사로 셀렉트 — Phase 0 설계 (개화약국용 맞춤 건기식 추천 도구)

> 작성: 2026-06-30 · 상태: 설계 확정 · 후속: 구현계획(writing-plans)
> 선행 분석: `interaction-poc/06_engine_assessment.md` (엔진 완성도 평가 + 활용 방안)

---

## 1. 목적 & 성공 지표

**한 줄:** 약사가 환자의 **복약을 보고 "무엇이 부족한지"를 파악 → 짧은 맞춤 문진 → 상호작용·근거로 안전한 맞춤 건강기능식품을 추천**하는, 개화약국 내부용 상담 도구.

**Phase 0의 유일한 검증 질문:**
> *이 도구로 상담하면 단골이 건기식을 실제로 사는가?*

**성공 지표:** **추천→구매 전환율** = Σ(구매 항목) / Σ(추천 항목), 상담 N건 누적.

이 한 가지가 증명되면 그다음에 소분·구독(규제 투자) 또는 타 약국 판매(B2B SaaS)로 갈지 **데이터로** 결정한다.

---

## 2. 범위 (in / out)

### 포함 (Phase 0)
- 약사가 상담 세션을 만들고 환자 복약을 **OCR 또는 수동 입력**(워크인 환자 포함, 케어 앱 미사용자도 OK)
- 복약 → **약물성 영양소 고갈 + 질환 갭** 분석
- 갭을 확정하는 **짧고 단순한 확인 문진**(약사 구두 진행)
- 후보 건기식 → **상호작용 게이트 + 근거 등급** → 추천 카드
- 약사 검수·확정 → **추천서 저장**
- **구매 결과 기록**(추천 N개 중 구매 M개) → 전환율 측정

### 제외 (Phase 1+로 명시적 연기)
- 소분·조합 (= 맞춤형건강기능식품판매업 신고·시설·표시기재·관리약사)
- 정기구독·결제·주문 워크플로
- 별도 앱/도메인(`select.yaksaro.co.kr`), 다약국 B2B SaaS
- 환자 셀프 입력(환자용 화면)

---

## 3. 아키텍처 & 위치

- **별도 앱 아님.** 기존 케어 레포의 **약사 영역 새 라우트** `/pharmacy/select`. 약사 인증·RLS·엔진·OCR·Supabase 그대로 공유 (신규 코드 최소화).
- **워크인 대응:** 케어 동의 환자 목록에 종속되지 않는 **독립 상담 세션**. 환자 계정·로그인 불필요. 약사가 그 자리에서 생성.
- **서버 경계:** 고갈 분석·상호작용·근거는 server-only(MedData/PubMed/Claude 키). 환자에게 직접 판정 노출 없음 — **약사가 검수자**.

### 데이터 흐름
```
약사: 상담 시작 (/pharmacy/select/new)
  → [입력] 처방전 OCR(/api/ocr) 또는 약 검색(/api/drugs/search) → 복약 스냅샷
  → [고갈] analyzeDepletion(복약, nutrient_depletion) → 갭 목록
  → [질환] estimateDiseases(복약) → 질환 갭 보강            (lifestyle-info 재사용)
  → [문진] buildQuestionnaire(갭) → 3~6문항(큰 글씨)
  → [응답] 약사 구두 체크 → 갭 확정·보정
  → [추천] recommend(갭, 응답, 복약):
       · supplement_catalog 후보 도출
       · analyzeInteraction(후보 × 복약) → 위험쌍 차단/경고   (supplement-interaction 재사용)
       · searchGradedEvidence(후보 × 갭) → A/B/C + 요약        (evidence-grade 재사용)
       · 안전 ∧ 근거순 랭킹
  → [검수] 약사 편집/추가/제외 → 확정
  → [저장] select_consultations (status=confirmed)
  → [결과] 구매 항목 기록 (status=closed) → 전환율
```

---

## 4. 컴포넌트 (단위 · 책임 · 인터페이스 · 의존)

| 단위 | 파일(예정) | 책임 | 인터페이스 | 의존 |
|---|---|---|---|---|
| 고갈 분석 | `lib/select/depletion.ts` | 복약 → 갭 | `analyzeDepletion(meds, rules): Gap[]` | `nutrient_depletion` |
| 문진 생성 | `lib/select/questionnaire.ts` | 갭 → 문항 | `buildQuestionnaire(gaps): Question[]` (순수) | — |
| 추천 오케스트레이터 | `lib/select/recommend.ts` | 갭+응답 → 안전·근거 추천 | `recommend({gaps, survey, meds}): RecItem[]` | catalog · analyzeInteraction · searchGradedEvidence · safety-frame |
| 상담 영속화 | `app/pharmacy/select/actions.ts` | 세션 CRUD·결과기록 | server actions | Supabase(약사 RLS) |
| UI | `app/pharmacy/select/*` | 마법사·검수·결과 | 라우트 | YC 컴포넌트 |

**설계 원칙:** 각 lib 단위는 DB/엔진 의존을 인자로 주입받아 **단위 테스트 가능**(결정적)하게. UI는 server action만 호출.

---

## 5. 데이터 모델 (신규 테이블 3개 · 케어 Supabase)

> jsonb를 적극 사용해 Phase 0를 얇게. 마이그레이션 1개(`041_select_phase0.sql`).

### `nutrient_depletion` — 고갈 지식 (★약사 큐레이션 = 해자)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| label | text | 예: "PPI → 비타민 B12" |
| match_keywords | text[] | 복약 성분/약명에 부분일치 (예: `{prazole, omeprazole}`) |
| nutrient_ko / nutrient_en | text | 고갈 영양소 |
| severity | text | high / moderate / low |
| mechanism_ko | text | 기전(평이한 말) |
| evidence_note | text null | 근거 메모/PMID |
| created_at / updated_at | timestamptz | |

- 영양소 1개 = 1행(약물클래스가 2영양소면 2행, keywords 공유).
- 시드 ~20건: 메트포르민→B12, 스타틴→CoQ10, PPI→B12·Mg, 루프/티아지드 이뇨제→K·Mg·Zn, 스테로이드→Ca·VitD, MTX→엽산, 경구피임약→B6·엽산·Mg 등 확립된 것만.
- **RLS:** authenticated read, owner/admin write.

### `supplement_catalog` — 갭 → 내 약국 완제품
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| nutrient_en | text | 고갈 영양소와 연결 |
| product_name_ko | text | 약국 취급 완제품명 |
| form | text | 정/캡슐/액상 |
| typical_dose_ko | text | 통상 용량(정보) |
| ingredient_en | text | 상호작용/근거 검색에 투입할 영문 성분 |
| supplement_id | bigint null | `supplements` fk(있으면) |
| cautions_ko | text null | 주의 |
| active | bool | 취급중 |

- **RLS:** authenticated read, owner/admin write.

### `select_consultations` — 상담 세션 + 결과(전환율)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid pk | |
| pharmacy_id | uuid fk | |
| created_by | uuid | 약사 user id |
| patient_label | text | 약사 메모(예: "단골 김OO 75세") — 개인식별 최소 |
| meds | jsonb | `[{name, ingredient, source: ocr\|manual}]` |
| gaps | jsonb | `[{nutrient, severity, source: drug\|condition}]` |
| survey | jsonb | 문진 응답 |
| recommendations | jsonb | `[{product_name, nutrient, evidence_grade, evidence_summary, interaction_status, dose_note}]` |
| purchased | jsonb | 실제 구매 부분집합 `[{product_name}]` ← 전환율 |
| status | text | draft / confirmed / closed |
| created_at / updated_at | timestamptz | |

- **RLS:** 약사 본인 약국(pharmacy_id) 범위만 read/write.
- 전환율 = `closed` 세션들의 Σlen(purchased)/Σlen(recommendations).

---

## 6. 재사용 맵 (신규 최소화)

| 단계 | 재사용 자산 |
|---|---|
| 복약 입력 | `/api/ocr`(처방전) · `/api/drugs/search` |
| 질환 갭 | `lib/lifestyle-info/estimate.ts` |
| 상호작용 게이트 | `lib/supplement-interaction/analyzeInteraction` (MEDDATA_API_KEY) |
| 근거 등급 | `lib/evidence-grade.ts` + `lib/summarize.ts` (ANTHROPIC_API_KEY) |
| 안전 표현 | `lib/lifestyle-info/safety-frame.ts` |
| 약사 인증·RLS | 기존 약사 모드(`pharmacies`, role 가드, `pharmacist_can_view` 패턴) |
| UI | `components/yc/*` |

**신규 핵심:** `nutrient_depletion` 큐레이션 데이터 + `lib/select/*` 3개 + `/pharmacy/select` UI.

---

## 7. 규제 프레이밍 (Phase 0)

- **완제품 권유 = 약사의 일반 건강·복약 상담 범위.** 소분 0 → **맞춤형건강기능식품판매업 신고 불필요.**
- **정보제공이지 진단 아님.** **약사가 최종 결정자**(검수 게이트).
- 건기식 = 의약품 아님. 모든 생성 문구에 `safety-frame` 적용 — **효능 단정·질병 치료 주장 금지**, "연구에서 ~경향이 보고됨" 톤.
- 상호작용은 "정보·주의 환기"로 프레이밍, severity 절대시 금지(근거등급 병기).

---

## 8. 테스트·검증 전략

- **단위(결정적):** `analyzeDepletion`(복약 픽스처→갭), `buildQuestionnaire`(갭→문항 수·내용), `recommend` 랭킹(상호작용·근거 모킹).
- **통합(라이브):** 상호작용·근거는 기존 점검 스크립트 패턴(`test-evidence-grade.mjs` 등) 재사용.
- **수용:** 개화약국에서 실제 상담 1~N건 진행 → 전환율 기록.
- **회귀:** 고갈 매칭은 시드 약물 픽스처로 스냅샷 비교.

---

## 9. Phase 1+ 경계 (이번에 안 만들지만 인터페이스로 열어둠)

- `select_consultations.recommendations`(확정 추천서)가 **Phase 1(주문·구독)·Phase 2(소분 라벨·표시기재)**의 입력이 된다.
- 다약국 SaaS화 시 `pharmacy_id` 스코프가 멀티테넌시 키.
- 엔진 해자(ko 사전·고갈 테이블) 확장은 Phase 0 운영 데이터로 우선순위 결정.

---

## 10. 확정된 결정 사항 (브레인스토밍 합의)

1. 운영 주체 = **약사 전용 B2B**(환자 셀프 아님).
2. 갭 판정 = **약사 큐레이션 고갈 테이블 + 근거 보강**(A안: 복약 우선 → 문진 짧게).
3. 제품 구조 = 별도 제품(약사로 셀렉트) 비전이되 **Phase 0는 케어 레포 내 약사 라우트로 얇게**.
4. 사업 판단 = 구인구직 보류 · 케어=기반/셀렉트=현금화 · **Phase 0로 전환율부터 증명**.
