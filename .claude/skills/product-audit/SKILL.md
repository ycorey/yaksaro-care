---
name: product-audit
description: 약사로 케어 앱의 제품 완성도·사용자 여정·비즈니스 로직을 평가하는 스킬. MVP 기능 구현 현황, 누락 기능, B2C/B2B 준비도, 데이터 흐름 무결성을 진단한다. "기능 평가", "MVP 점검", "제품 리뷰", "출시 준비도", "B2B 준비", "기능 완성도", "사용자 플로우" 요청 시 반드시 이 스킬을 사용하라.
---

# 제품 완성도 감사 스킬

## 감사 순서

### 1. 기준 문서 읽기
- `CLAUDE.md` — MVP 목표, 스택, 변경 이력
- `supabase/migrations/` — DB 스키마 전체
- `src/app/` 폴더 구조 파악

### 2. 핵심 기능 체크리스트

| 기능 | 확인 파일 | 판정 기준 |
|------|---------|---------|
| 처방전 OCR | `api/ocr/route.ts` | CLOVA → GPT → DB 저장 완결 |
| 약지갑 3카테고리 | `wallet/page.tsx` | 처방약/영양제/일반약 분리 표시 |
| 복약 타임라인 | `today/today-timeline.tsx` | 체크/해제 + 시간 기록 |
| 복약 캘린더 | `calendar/page.tsx` | 월별 조회 + 상태 마크 |
| DUR 엔진 | `lib/dur.ts`, `lib/dur-shadow.ts` | shadow mode 작동 여부 |
| QR 약국매핑 | `store/[store_id]/page.tsx` | 쿠키 → 매핑 → 토스트 |
| 의사 보여주기 | `wallet/doctor-view.tsx`, `share/` | 풀스크린 모달 |
| 약 추가 | `medications/add/` | 수동 + OCR 두 경로 |

### 3. 사용자 여정 추적

**여정 A: 신규 사용자 첫 처방전 등록**
```
/ (랜딩) → /login → OAuth → /home → /medications/ocr → /wallet
```
각 단계별 막힘 여부와 이탈 위험 포인트 식별.

**여정 B: 단골약국 QR 연결**
```
QR 스캔 → /store/[store_id] → 로그인 → /wallet?pharmacy_linked=1
```
쿠키 세션 유실 방지 이중잠금이 실제로 작동하는지 코드로 확인.

**여정 C: 의사 방문 전 약 목록 공유**
```
/home → /share → 의사·약사 보여주기 버튼 → 풀스크린 모달
```

### 4. 데이터 흐름 무결성

OCR → DB 경로 추적:
```
api/ocr (CLOVA→GPT) 
  → user_prescriptions INSERT
  → [사용자 확인]
  → api/medications/bulk POST
  → user_medications INSERT (drug_id 매칭)
  → DUR shadow (fire-and-forget)
```
각 단계에서 데이터 손실 또는 잘못된 매핑 위험 식별.

### 5. B2B 준비도 평가 항목

- `pharmacies` 테이블에 실제 데이터 삽입 경로 존재 여부
- 약사 계정과 환자 계정 구분 로직
- QR 코드 생성 UI (없으면 Critical)
- 약사 대시보드 (단골 환자 복약 현황)

### 6. 출시 준비도 점수 (100점)

| 카테고리 | 배점 | 기준 |
|---------|-----|------|
| 핵심 B2C 기능 | 40점 | OCR/약지갑/복약체크 완성도 |
| 사용자 여정 완결 | 20점 | 주요 플로우 막힘 없음 |
| 데이터 무결성 | 15점 | 저장/조회 정확성 |
| B2B 준비도 | 15점 | 약사 모드 착수 여부 |
| 안정성/에러처리 | 10점 | 실패 시 복구 가능 |

### 7. 출력
`_workspace/eval/03_product-audit.md`에 저장.
출시 준비도 점수 → 기능 현황표 → 여정 완결성 → B2B 준비도 → 우선순위 TOP 5 순서.
