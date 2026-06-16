# 약사로 케어 — 할 일 목록

> 기준: 4차 종합 평가 91/100 (2026-06-10, 3개 영역 독립 에이전트 검증 — `_workspace/eval/final-evaluation.md`)
> 현재 상태: Critical 0 · High 0 · B2C 출시 가능 판정. 코드 작업 완료, 아래는 잔여 항목.

## 🚀 출시 게이트 (코드 아님 — 운영 절차, 배포 전 필수)

- [ ] Vercel 환경변수 설정: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`(웹푸시), `CRON_SECRET`(cron 인증 — 미설정 시 모든 cron이 401로 동작 안 함)
- [ ] 약사 계정 토큰으로 RLS 누수 실측 1회 — 미동의/타약국/철회 환자 SELECT가 0건인지 확인
- [ ] 실기기 스모크 테스트 — 글자크기 '아주 크게'(20px) 레이아웃, /pharmacy/qr A4 인쇄 여백, OCR 칩 터치
- [ ] 첫 약국 파트너 계정 발급 (pharmacies row + role=pharmacist는 운영자 수동 — 셀프 가입은 중기 과제)

## 📈 점수 상승 (91 → 93~94권, 평가 에이전트가 짚은 감점 요인 순)

- [x] **하단 탭바 비활성 라벨 대비** — `nav.tsx` 이미 neutral500·text-xs(12px) 적용돼 있었음 (6/10 작업에서 반영, 재확인 완료)
- [x] **끼니 표시 상수 완전 단일화** (2026-06-15) — 라벨·시각은 `lib/meal-slots.ts`(MEAL_LABELS/MEAL_TIMES/isMeal 추가), 아이콘은 신규 `lib/meal-icons.tsx`(서버 번들 분리)로 SSOT화. home-client·today-timeline·cron·ocr-uploader·meal-checks·calendar·settings-client·supplement-section·prescription-section·add-form 10개 파일의 중복 배열/아이콘/폴백 제거. 부수효과: 알림 라벨 '취침 알림'→'자기 전 알림' 통일 (기술 +2~3)
- [x] **경량 로거 도입** (2026-06-15) — 신규 `lib/logger.ts`(외부 의존성 0, 서버·클라 공용)로 흩어진 console.* 11곳 통일(DUR shadow·OTC·푸시 SW·OCR·bulk·meal-checks·wallet). Sentry 확장 지점(emit()/DSN 분기)만 주석으로 남김. ※ Sentry 풀 도입은 추후 운영 배포 시 (기술 +2)
- [x] OCR 복용시간 칩 터치 타겟 — `ocr-uploader.tsx` 이미 min-h-[48px] 적용돼 있었음 (재확인 완료)

> 검증(2026-06-15): `tsc --noEmit` 통과 + `eslint` 0건. ⚠️ `next build`는 미실행(PC 부하) — 배포 전 1회 확정 필요.

## 🗓️ 중기 (1개월)

- [ ] 약사 대시보드 환자 요약 강화 — 활성 종수 외 순응도/최근 체크 추세 (B2B 유료 전환 가치, 제품 +2)
- [ ] OCR 이름 폴백 정확도 — 부분일치 임의 1건 → 정확도순 정렬/유사도 필터
- [ ] 핵심 로직 단위 테스트 — meal-slots 폴백·EDI 콤마 경계 매칭·cron 토글 필터
- [ ] 약국 계정 셀프 가입 플로우 (신청 → 운영 승인)

## 🧹 장기 / 리팩토링 (Low)

- [ ] 잔여 neutral400 캡션(약지갑 서브타이틀·제조사명)·홈 그리드 15px·설정 "미연결" neutral300
- [ ] 레거시 `dose`/`frequency` select 잔존 정리
- [ ] proxy 매 요청 role 조회 캐시화, bulk 약품당 순차 쿼리 배치화
- [ ] store-id 생성 crypto 모듈로 편향 보정(비보안성), sync-supplements 페이징 체크포인트
- [ ] 글자크기 루트 레이아웃 서버 반영(기기 변경 시 첫 화면부터 적용)

---

## 완료 기록 (2026-06-10, 16커밋)

3차 평가 H1~H7 전체 해소 + 설정 서버 영속(024)·cron 토글 반영·bedtime cron + DB 타입 전면 적용(캐스팅 18곳 제거) +
React19 lint 에러 16→0(워닝 0) + admin→user 토큰 전환 + B2B 약국 QR 온보딩(store_id 셀프 발급+A4 인쇄) +
핵심 px→rem + 접근성 대비 상향 + 001 베이스 스키마 역덤프(+023 중복 인덱스) + 무시간대 약 defaultMealKeys 폴백 +
cron 인증 통일 + EDI 콤마 경계 매칭. 마이그레이션 001~024 운영 DB 적용 확인. 상세는 CLAUDE.md 변경 이력 참조.
