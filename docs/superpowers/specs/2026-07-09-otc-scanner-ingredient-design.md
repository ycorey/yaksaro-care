# 통합 인식 브레인 + OTC 전용 간소 화면 설계

**날짜:** 2026-07-09
**브랜치:** `feat/otc-scanner-ingredient`
**대상:** 일반약통(OTC 박스) 사진 촬영 인식 실패·재시작 루프 해결 + 성분 표시

---

## 1. 문제 (근본 원인)

사용자가 **"박스 사진으로 찾기"**(`/medications/add?method=photo` → `box-ocr-scanner.tsx`)로 일반약통을 촬영하면 인식이 "무시되고 재시작"된다.

원인 두 가지:

1. **오분류 → 처방전 루프.** `/api/ocr/product`의 `looksLikePrescription(rawText)`는 RX 신호(`/복용/`, `/(1일|하루)\s*\d+\s*[회번]/`, `/식후|식전.../` 등)가 **2개 이상**이면 처방전으로 판정한다. 그런데 일반약통 박스에는 통상 **"1일 3회", "식후 복용"** 이 인쇄돼 있어 이 신호가 쉽게 2~3개 걸린다. → "여러 약이 적힌 약봉투 같아요" 오판 → "처방전으로 정확히 읽기" 유도 → `/medications/ocr`(처방전 스캐너, `/api/ocr`)로 이동 → 처방전 표 구조/EDI 코드가 없어 **0건** → `ocr-uploader.tsx`의 "약을 읽지 못했어요 / 다시 촬영" 폴백 → **재촬영 무한 루프**.

2. **성분 미해결.** 오분류가 안 나더라도 박스 흐름은 제품명 **문자열만** 뽑아 `AddForm` 검색창에 프리필한다. OCR 제품명이 로컬 `drugs.item_name`과 정확히 안 맞으면 빈 검색 → 헛수고. **성분은 어디에도 표시되지 않는다.**

## 2. 목표

- 일반약통을 찍으면 **확실히 인식**하고 **성분까지** 보여준다.
- **재시작 루프 제거**: 실패해도 찍은 사진·읽은 텍스트를 유지하고 이름 검색으로 자연 연결.
- 처방전 흐름(`/api/ocr`, `ocr-uploader.tsx`)은 **무변경**(회귀 없음).
- OTC 결과는 처방전 카드 UI 재사용이 아니라 **OTC 전용 간소 화면**으로.

## 3. 설계

### 3.1 서버 — `/api/ocr/product`를 "OTC 인식기"로 승격

현재: `{ names: string[], isPrescription: boolean }` 반환.

변경 후: 제품명 후보를 뽑은 뒤 **성분·정식 품목을 해결**해 구조화 반환.

```
CLOVA OCR → rawText
  → BOX_PROMPT(GPT) 또는 휴리스틱으로 제품명 후보 1~3개
  → 각 후보를 순서대로 해결:
      1) 로컬 drugs 테이블 (item_name ilike, is_canceled=false)
           → 매칭 시 drug_ingredients 조인으로 성분(name_ko) 수집
      2) 로컬 미스 시 허가정보 API (item_name) → ITEM_NAME·ITEM_INGR_NAME(성분)·
           SPCLTY_PBLC(전문/일반)·PRDUCT_TYPE(분류)·BIG_PRDT_IMG_URL·ITEM_SEQ
  → 첫 해결 결과 = 대표 제품. 나머지 후보는 미해결이어도 candidates로 유지.
```

**반환 형태:**
```ts
{
  products: Array<{
    name:       string          // 공식 품목명(해결됨) 또는 후보 원문
    ingredient: string | null   // 성분 (핵심 요구사항)
    drug_id:    string | null   // 로컬 drugs.id (있으면 우선 — DUR 투입)
    item_seq:   string | null   // 허가정보 품목기준코드
    entp_name:  string | null   // 제조사
    image_url:  string | null   // 약 이미지
    category:   string | null   // 분류 (예: 해열·진통·소염제)
    classType:  string | null   // 전문/일반
    resolved:   boolean         // 정식 품목 매칭 성공 여부
  }>
  candidates: string[]          // 원본 이름 후보(전환용)
  isPrescription: boolean       // 아래 3.2의 강화된 판정
}
```

**오분류 수정 (`looksLikePrescription` 강화):** 문구 단독으로 처방전 판정하지 않는다. **강한 신호 조합**만 처방전으로 본다:
- 서로 다른 제형 약품명이 2종 이상 감지 **AND** (`조제|처방|약국|요양기관|교부` 중 1개 이상), 또는
- 9자리 EDI 코드 패턴(`\[?\d{9}\]?`)이 1개 이상 존재.
- 단순 "1일 3회 · 식후 복용"만으로는 처방전 아님(일반약통 정상 통과).

성분 해결·API 조회 실패는 항상 200 + `resolved:false`로 흡수(하드 실패 없음).

### 3.2 UI — OTC 전용 간소 화면 (신규, `box-ocr-scanner.tsx`)

`reading` 이후 결과 단계를 처방전 카드가 아닌 전용 화면으로 교체:

- **인식 카드 1장**: 약 이미지 · **공식 약품명** · **성분**(굵게) · 분류/전문일반 배지.
- 후보 여러 개면 상단에 **칩**으로 전환(누르면 그 후보로 카드 재구성; 미해결 후보는 이름만).
- **"이 약이 맞아요"** 확인 → 기존 `AddForm`에 정식 품목을 **`initialSelected`(이미 선택된 상태)** 로 넘겨 검색을 생략. 성분·`drug_id`/`item_seq`가 붙어 저장되므로 DUR·상호작용 엔진 투입 가능(custom_name 회피).
- **미해결(정식 매칭 실패)**: 읽은 이름을 `initialQuery`로 한 기존 검색 폼으로(현행 유지). 찍은 사진·이름 보존, **재시작 루프 없음**.
- **강한 처방전 신호**일 때만 "처방전으로 정확히 읽기" 핸드오프 카드 노출(현행 로직 유지, 트리거만 강화).

### 3.3 진입점

현재 진입("박스 사진으로 찾기")은 그대로 유지. 통합의 핵심은 **서버 판정 강화**로 OTC가 처방전으로 새지 않게 하는 것 → 추가 진입 라우팅 변경은 범위 밖(YAGNI).

## 4. 컴포넌트/인터페이스 경계

| 단위 | 책임 | 의존 |
|------|------|------|
| `resolveProduct(name)` (route 내부 헬퍼) | 이름 1개 → 정식 품목+성분 해결 | supabase(drugs, drug_ingredients), 허가정보 API |
| `looksLikePrescription(rawText)` (강화) | rawText → 처방전 여부(강한 신호) | 없음(순수 함수) |
| `POST /api/ocr/product` | 이미지 → `{products, candidates, isPrescription}` | CLOVA, GPT, `resolveProduct` |
| `OtcResultScreen` (box-ocr-scanner 내) | products 표시·후보 전환·확인 | AddForm(initialSelected) |

## 5. 데이터 흐름

박스 촬영 → `/api/ocr/product` → `{products, candidates, isPrescription}` →
- isPrescription(강) → 핸드오프 카드
- products[0].resolved → OTC 간소 카드 → 확인 → AddForm(initialSelected=정식품목) → 저장(drug_id/성분)
- 미해결 → AddForm(initialQuery=이름) 검색 → 사용자 선택 → 저장

## 6. 에러 처리

- CLOVA/GPT/API 실패 → 200 + `products:[]` 또는 `resolved:false`. 절대 하드 실패로 재시작 유도하지 않음.
- 이미지 413 → 기존 재압축 재시도 유지.
- 성분 조인 실패 → `ingredient:null`(카드에서 "성분 정보 없음" 표기).

## 7. 테스트 / 검증

- **회귀(처방전 무변경):** `/api/ocr` 및 `ocr-uploader.tsx`는 손대지 않음 → tsc·build로 확인.
- **OTC 인식:** "타이레놀정500밀리그람" 등 대표 OTC 이름이 로컬/허가정보로 해결되고 성분이 채워지는지 라우트 단위로 확인(수동 rawText 주입 스모크 가능).
- **오분류 방지:** "타이레놀정 … 1일 3회 식후 복용" 스타일 rawText가 `looksLikePrescription=false`가 되는지 단위 확인.
- **막다른 길 제거:** products 0건이어도 검색 폼으로 착지(재시작 루프 없음) 수동 확인.
- tsc·lint·next build 통과.

## 8. 리스크 / 트레이드오프

- 허가정보 이름 매칭이 OCR 오탈자에 약함 → 후보 3개 순차 조회 + 로컬 `drugs`(이름) 백업 병행으로 완화.
- 로컬 `drug_ingredients`는 부분 적재(성분 없을 수 있음) → 허가정보 `ITEM_INGR_NAME` 폴백.
- 변경 범위: `/api/ocr/product` route + `box-ocr-scanner.tsx` 결과 화면 + `AddForm` initialSelected 전달. 처방전 경로 무변경.
