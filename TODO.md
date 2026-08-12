# 약사로 케어 — 할 일 목록

> 기준: 10차 종합 평가 (2026-08-11) + 8/11~12 후속 작업 — `_workspace/eval/final-evaluation.md`
> 상태: Critical 0 · High 0. B2C 운영 중. 이 문서는 **남은 것**만 적는다 — 끝난 일의 이력은 `CLAUDE.md` 변경 이력에 있다.

---

## 🔒 사용자만 할 수 있는 일 (내가 대신 못 함)

- [ ] **사업자 정보 확정** — 상호·대표자·사업자등록번호·주소. 이용약관 §부칙과 처리방침 보호책임자 항목이 비어 있다.
      **유료 전환(B2B 과금) 전 필수**이고, 무료 서비스인 지금도 표기 의무는 있다. 값을 지어내지 않았다.
- [ ] `supabase functions deploy ter-notify` — `passLen` 로그 누출 수정이 소스에는 반영됐으나 배포는 보류.
      (16KB 수기 재입력 위험 > 누출 실익. 배포하려면 Supabase CLI 로그인 필요)
- [ ] 랜딩(`landing-deploy`) 재배포가 필요한 변경이 생기면 수동 — Vercel CLI `vercel deploy --prod` (프로젝트 분리돼 있음)

---

## 💰 B2B 유료화 (사용자 판단으로 보류 — "아직 이르다", 2026-08-11)

착수 시점에 함께 필요한 것들. 지금은 건드리지 않는다.

- [ ] 요금제·과금 수단 (약국당 월정액 / 결제 대행)
- [ ] 약국 셀프 가입 플로우 (신청 → 운영 승인 → `role=pharmacist` 부여). 지금은 운영자 수동 발급
- [ ] 유료 전환 시 이용약관에 유료 조항·환불 규정 추가 (현재 약관은 무료 서비스 전제)

---

## 🗓️ 중기 (제품 가치)

- [ ] 약사 대시보드 환자 요약 강화 — 순응도 추세는 붙었고, 다음은 **처방 변경 이력**(같은 약 재처방/중단)
- [ ] OCR 이름 폴백 정확도 — 현재 "정확 일치 + 부분일치 유일후보만" 채택. 유사도 정렬로 회수율 개선 여지
- [ ] 리필 리마인더 실효성 — 10차에서 "발송 0건은 대상 없음" 으로 확인됐고 058 영수증이 붙었다.
      실제 발송이 시작되면 도달률·해제율을 보고 문구·시각을 조정
- [ ] 프록시(`src/proxy.ts`) role 조회를 JWT claim 으로 이관 — 요청마다 DB 왕복 1회 절약.
      (현재 `/pharmacy`·`/login` 경로에만 스코프돼 있어 급하지 않음)

---

## 🧹 낮음 / 정리

- [ ] `interactions` 페이지(`NEXT_PUBLIC_SHOW_INTERACTIONS=false`) — 살릴지 지울지 결정. 코드만 남아 있다
- [ ] 레거시 테이블 `prescriptions`·`pharmacy_patients` DROP — 052 에서 권한·정책은 무력화했고 0행·참조 0.
      DROP 은 비가역이라 남겨둔 상태
- [ ] `_workspace/eval_prev` 누적 정리 (평가 회차마다 쌓임)

---

## ✅ 상시 게이트 (자동화됨 — 손댈 것 없음, 깨졌을 때만 본다)

| 무엇 | 언제 | 실패 시 신호 |
|------|------|--------------|
| `.github/workflows/ci.yml` (tsc·lint·unit·schema-gate) | PR·push·매일 | GitHub Actions |
| `.github/workflows/smoke.yml` (익명 11 + 인증 6) | 프로덕션 배포 직후·하루 2회 | GitHub Actions |
| Sentry (`yaksaro-care`) | 런타임 예외 | 이메일 |
| `notification_runs` (058) | cron 실행마다 | 행이 없으면 안 돈 것 |

로컬 전체 검증: `npm run test:e2e:db` (서버 불필요) · `npm run test:unit` · `npm run build`
