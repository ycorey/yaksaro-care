# 약사로 케어 — 할 일 목록

> 기준: 11차 종합 평가 (2026-08-12) + 환자앱 앱스토어 적합성 평가 (2026-08-12)
> 리포트: `_workspace/eval/final-evaluation.md` · `_workspace/eval_appstore/final-appstore-assessment.md`
> 상태: Critical 0(5회 연속) · **High 6 중 2건 해소(PR #66)**. B2C 운영 중.
> 이 문서는 **남은 것**만 적는다 — 끝난 일의 이력은 `CLAUDE.md` 변경 이력에 있다.

---

## 🔴 지금 (규제 노출이 이미 열려 있다)

- [ ] **`/interactions` 페이지·`/api/interactions/check` 차단** — 라우트 삭제 또는 `notFound()`.
      **`NEXT_PUBLIC_SHOW_INTERACTIONS` 는 `src/` 어디서도 읽지 않는다**(실측). 링크만 없을 뿐 가드가 없어 로그인 사용자면 URL 로 열린다.
      화면이 `병용금기`·`안전`·**"검출되지 않았습니다"**(음성 판정)를 면책 없이 표시 → 웰니스(비의료기기) 판정과 Play 건강앱 선언에 동시에 걸린다.
      ※ 플래그 방식을 유지하려면 **실제로 플래그를 읽게** 할 것. 반나절.
- [x] ~~**Sentry `summarize()` 화이트리스트**~~ — **PR #66 (2026-08-16).** `redactDetail()` 이 직렬화
      replacer 로 `details` 만 지운다(중첩 포함). `code`·`message`·`hint` 는 남긴다 —
      `hint` 는 PostgREST 스키마 힌트를 담고, 8/11 의 4일짜리 약사 대시보드 장애(PGRST200)를
      진단해 준 것이 그 문자열이다. 외부 의존성 0 인 모듈 + 단위 테스트 9종.
- [x] ~~**끼니 cron 영수증 공백**~~ — **PR #66 (2026-08-16).** 조회 실패 7곳·400 1곳에 영수증
      추가(리필 '발송 기록' 실패는 푸시가 이미 나간 뒤라 targets·sent·failed 동봉).
      **401 은 일부러 표에 안 남긴다** — 미인증 쓰기 경로를 열면 표가 밖에서 부풀려져
      판독 규칙 자체를 남이 흔들 수 있다 → `logger.warn` → Sentry 경보로 대체.
      ▸ **관측 완료 (2026-08-16)** — 8/13~15 사흘간 **하루 5행이 빠짐없이** 쌓여 있다
        (끼니 4 + 리필 1, 전부 `대상 없음`·`조건 충족 처방 없음`). **구조적 공백이 아니다** —
        cron 은 정상이고 보낼 사람이 없는 것뿐이다. 11차가 의심한 공백은 그 창에서
        실패가 없어 드러나지 않았던 것이고, PR #66 은 그 구멍을 미리 막았다.
        ⚠️ 뒤집어 말하면 **중단 경로는 아직 실측되지 않았다**(실패가 안 났으므로).
        고친 것과 확인한 것은 다르다 — 첫 5xx 때 표에 행이 남는지 볼 것.

---

## ⏸️ 진행 중 (미커밋 — 다른 작업이 이 파일들을 스테이지하지 말 것)

- [ ] **`/ter` 보유기간 파기 워크스트림** — 작업트리에 **미커밋**으로 있다(2026-08-16 확인).
      마이그레이션 `061`(replied_at·파기 기산점)·`062`·`063`(notified_at) ·
      `api/cron/ter-retention` · `vercel.json` cron 등록 · `notification-run` 의 `ter_purge` ·
      `ter-notify` 재작성(NOTIFY_DETAIL 제거·헤더 인젝션 방어·멱등) · 랜딩 개편(ter.html·OG·폰트).
      리뷰 전이므로 **부분 커밋으로 섞이면 안 된다.** `ter-notify` 재배포(위)가 여기에 물려 있다.

---

## 🔒 사용자만 할 수 있는 일 (내가 대신 못 함)

- [ ] `supabase functions deploy ter-notify` — 배포본이 **version 10(8/11)** 이라 `passLen` 노출 코드가 **운영에 라이브**다.
      ⚠️ **기존 보류 사유("16KB 수기 재입력 위험")는 사실이 아님이 확인됐다** — MCP `get_edge_function` 으로 배포본 전문을 읽었고 `deploy_edge_function` 도 파일 내용을 그대로 받는다. **원문 유실 없이 왕복 가능.**
      함께: `index.ts:223` 의 `message: msg` 제거 · `encodeHeader()` CRLF 제거 · CI 에 `deno check supabase/functions/**/*.ts`
      ▸ **2026-08-16 실측 보강**: 누출이 로그가 아니라 **응답 본문**이다 —
        SMTP 실패 시 `creds: { userLen, userHasAt, passLen }` 를 502 바디에 실어 돌려준다.
        `verify_jwt` 는 켜져 있지만 통과에 필요한 것이 **랜딩 HTML 에 공개된 anon 키**뿐이라
        사실상 누구나 호출할 수 있다. 커밋된 HEAD 소스는 이미 서버 로그로만 남기도록 고쳐져 있다.
      ▸ **배포는 사용자 판단으로 보류 중**(2026-08-16) — 아래 `/ter` 워크스트림이 정리된 뒤에 한다.
- [ ] **Play Console 확인 (리드타임 최장 — 다른 작업보다 먼저)** — health 앱에 **Organization 계정 + D-U-N-S** 가 실제로 요구되는지.
      사실이고 사업자등록이 없으면 **기술로 못 넘는다.**
- [ ] GA4 속성의 **Google Signals / Ads 연동 상태** — 연동돼 있으면 Apple Tracking=Yes → ATT 필요 + 5.1.3(헬스 데이터 광고 이용 금지) 충돌
- [ ] 랜딩(`landing-deploy`) 재배포가 필요한 변경이 생기면 수동 — `vercel deploy --prod` (프로젝트 분리돼 있음)

> ~~사업자 정보 확정~~ — **법적 표기의무는 없는 것으로 확인(2026-08-12).**
> 전자상거래법 §10 의 수범자는 "사이버몰 운영자" 이고 사이버몰(§2조4호)·전자상거래(§2조1호)는 재화 **거래**를 전제한다.
> 무료·무판매 앱은 **§10 표시의무·§12 통신판매업 신고의무 모두 비적용**이고, Google Play 도 사업자등록번호는 **유료 앱에만** 요구한다.
> → `terms/page.tsx:8-11` 의 "임의로 채우지 않는다" 는 판단이 옳았다. **공란 유지가 정답이며 지어내 채우는 것이 허위표시 리스크다.**
> 필요해지는 시점: ① Play health 앱 Organization 계정이 요구될 때 ② **B2B 유료화 개시 시**(그때는 유상 거래라 사업자등록+표시의무 검토 필요).
> ※ 공개 법령·지침 1차 검토이며 법률 자문이 아니다.

---

## 📱 앱스토어 트랙 (2026-08-12 평가 기준)

> 결론: **Play 는 가능(코드 2~3일 + 행정 3주), iOS 는 지금 형태로 불가.**
> 다만 **스토어가 지금 이 제품의 병목은 아니다** — 외부 사용자 5명·마지막 복약 체크 7/03. 행정 3주 동안 지인 파일럿 10명으로 완주율을 재는 편이 낫다(병행).

### 공통 앱 코드
- [ ] **환자용 이메일+비번(또는 매직링크) 로그인 복원** — 심사 데모 계정 수단이 앱에 **없다**(`signup/page.tsx` 는 `redirect('/login')` 한 줄).
      구글은 해외 심사자 2FA 에 걸리고 카카오는 사실상 사용 불가 → 흔한 리젝. `pharmacy/login` 이 이미 `signInWithPassword` 를 쓰므로 패턴은 저장소 안에 있다
- [ ] **계정 삭제 요청 웹페이지** 신설(`/account-deletion`, 비로그인 접근) — 앱 내 삭제와 **별개로** Play Data safety **필수 필드**. 없으면 심사가 아니라 **제출이 안 된다**
- [ ] **접근권한 고지 화면**(정보통신망법 §22조의2 — 앱이 되는 순간 생기는 의무). 이 앱은 **필수 권한이 0** 이라 카메라·앨범·알림 전부 "선택" 으로 고지하면 끝
- [ ] manifest 보강 — `id`·`screenshots` 없음, maskable **192** 없음(512 만), `scope: "/"` 라 설치된 환자 앱에서 `/pharmacy/login` 이 열림(**iOS 4.3** 소지) → scope 축소 또는 배포 분리
- [ ] 아이콘 **1024×1024**(iOS, 알파 없음) + maskable-192 — `scripts/gen-pwa-icons.mjs` 의 `TARGETS` 에 2줄 추가
- [ ] 스토어 빌드에서 웹 전용 UI 숨기기 — 설치된 앱 안의 "앱 설치하세요" 는 웹 래퍼임을 자백하는 것. `display-mode` 분기는 있으나 카카오/iOS 분기가 UA 기반이라 샐 수 있음 → `NEXT_PUBLIC_STORE_BUILD` 플래그
- [ ] 앱 내 **"의료기기가 아니므로 질병 유무를 판단할 수 없으며…"** 문구 — `src/` 전체에 "의료기기" 0건(랜딩에만 있다). 식약처 지침 Ⅴ-3 권고, 비용 0
- [ ] 로그인 후 처리방침 링크(Apple 5.1.1(i)) — 현재 `/login` 에만 있다. 10분
- [ ] 만 14세 확인 체크 1개 — 처리방침 제13조 선언과 구현 일치
- [ ] `/medications` 죽은 경로 → `redirect('/medications/add')` 1줄

### Google Play (TWA)
- [ ] `public/.well-known/assetlinks.json` — ⚠️ 지문은 **Play App Signing 인증서 SHA-256**(로컬 업로드 키 아님). 틀리면 크래시 없이 **주소창 남은 Custom Tab 으로 조용히 폴백**. 배포 후 200 실측
- [ ] Bubblewrap(**JDK 17 정확히** — 21/23 도 비호환) → targetSdk **36**(2026-08-31 이후 빌드 요건) → `.aab`
- [ ] `twa-manifest.json` 에 `enableNotifications: true` + **`POST_NOTIFICATIONS` 실기기 검증**
      ⚠️ targetSdk 33+ 는 이 권한 없으면 **알림이 예외 없이 조용히 안 뜬다.** Bubblewrap 자동 주입 여부가 공식 문서에 없음 → `AndroidManifest.xml` 직접 확인 + Android 13+ 실기기로 알림 1건 수신.
      **048·PR#50·PR#51 과 같은 서명("등록은 됐는데 안 온다")**
- [ ] 스토어 자산 — 스크린샷 4장+·특성그래픽 1024×500(현재 **0개**) · 설명문(§ 의료기기 표현 금지 표로 자가 검수)
- [ ] Play 건강앱 선언 · Data safety 폼(복약·처방 텍스트=**Health info**, 처방전 원본 이미지는 즉시 파기라 ephemeral 예외로 "수집" 아님, **단골약국 열람(opt-in)은 "Shared" 로 볼 여지**)
- [ ] 개발자 계정 $25 + 전화번호 검증(2026-09 전면 의무화) · 개인 계정이면 **테스터 12명×14일** 후 프로덕션 신청

### iOS — 별도 의사결정에 부칠 것 (3~6주, 지금은 착수 비권장)
- [ ] Mac + Xcode 26 / Sign in with Apple(4.8 우회로 없음)
- [ ] **APNs 재구현** — `push_subscriptions` 토큰 종류 컬럼 + 마이그레이션 → `lib/push.ts` 2갈래 분기 → **cron 3종이 전부 두 경로**
- [ ] 네이티브 로컬 알림 + Face ID(4.2 방어 근거) · `PrivacyInfo.xcprivacy`(없으면 업로드 자체 거부)
- [ ] WKWebView 에서 죽는 3종 — `window.print()` 복약 리포트 무동작 / `<input capture>` 는 `WKUIDelegate` 없으면 무반응 / `getUserMedia` 는 `NSCameraUsageDescription` + 셸 권한
> **그 전까지 iOS 사용자에겐 Safari → 홈 화면 추가를 안내한다 — 역설적으로 그 경로에선 Web Push 가 살아 있고, 래핑하면 죽는다.**
> ⚠️ manifest 에 `prefer_related_applications: true` 를 넣으면 웹 설치 프롬프트가 억제된다. TWA 를 내더라도 **웹 설치 경로를 죽이지 말 것.**

---

## 🟠 11차 High 잔여

- [ ] **`db-gate` 를 실제로 돌게** — 13종(약사 RLS 누수 **27단언** 포함)이 CI 실행 **0회**. `workflow_dispatch` 전용인데 dispatch 0건 + 시크릿 부재로 **수동 실행조차 불가**.
      → `schema-gate` 가 증명한 해법 복제: **쓰기 불가능한 자격증명만 주고 "무엇이 0건인가" 만 단언하는 읽기 전용 잡**을 운영 대상 상시로 분리. 시드가 필요한 단언만 test DB
- [ ] **약사 회신 화면 진입점** — `/medications/pharmacy-request` 로 가는 앱 내 링크가 `home-client.tsx:179` 하나뿐이고 `isB2B` 일 때만 렌더된다.
      연결 해제는 확인 없이 한 탭(`pharmacy-link.tsx:77-85`) → **되살린 화면에 도달할 방법이 사라진다.** 설정에 "지난 요청·회신 보기" 상시 링크(5줄) + 해제 확인
- [ ] **약국 캘린더 월 이동** — 이전/다음 버튼 0개, `monthGridDays(today)` 가 당월만 생성. 저장(056 `due_date`)·API 는 임의 날짜를 이미 지원 → **막힌 건 화면 20줄**.
      약사가 요청한 맥락("저녁에 다음날 발주 메모")이 월말에 그대로 막힌다

---

## 💰 B2B 유료화 (사용자 판단으로 보류 — "아직 이르다", 2026-08-11)

- [ ] 요금제·과금 수단 · 약국 셀프 가입 플로우 · 유료 조항·환불 규정
- [ ] **약사 비밀번호 재설정 경로 0건**(`resetPasswordForEmail`·`updateUser(` grep 0) — 약국 2곳만 넘어도 선형 부하가 되는 유일한 하드 블로커
- [ ] 착수 전 **`pharmacist-rls-qa` 를 자동 경로에** 올릴 것 — 타인 건강정보를 읽는 유일한 화면인데 그 게이트만 수동이다

---

## 🗓️ 중기 (제품 가치)

- [ ] **유입 실험 10명** — 40일간 복약 체크 0 · 39일간 신규 가입 0 · 활성 복약 1종. **감시 장치는 훌륭한데 볼 것이 없다.** 여정 A→B→H 완주율을 한 번 측정할 것
- [ ] 신규 **환자** 카나리 스모크(`/home` 200 + 탭 5종) — 인증 스모크는 약사 전용이라 10차 최대 발견의 재발 방지가 절반이다
- [ ] `database.ts` 재생성 + 컬럼 드리프트 CI 게이트 — **059 가 누락**돼 있고 재생성 규약이 수기 패치로 퇴행했다(9차 근본 조력자의 재발 경로)
- [ ] `/ter` 운영 동선 — 059 로 상태 컬럼은 생겼는데 **담는 사람도 기한도 없다**(첫 신청이 이틀째 `new`, 랜딩은 "분석을 마치는 대로")
- [ ] 약사 대시보드 처방 변경 이력 · OCR 이름 폴백 유사도 · 프록시 role → JWT claim

---

## 🧹 낮음 / 정리

- [ ] 약사 대시보드 **자식 조회 3곳** error 폐기(부모만 고쳐짐) · `end_expired_medications` 죽은 catch · `pharmacy/request` count fail-open
- [ ] Sentry 소스맵 — `withSentryConfig` 0건 · `SENTRY_AUTH_TOKEN` 없음. **DSN 이 켜진 지금 스택트레이스가 난독화된 채 온다**
- [ ] `@calendar` 오류를 빈 상태("기록 없음")로 표시 — **4회 연속 이월**(약사 화면은 이번에 고쳐졌다)
- [ ] `api/medications/bulk` `maxDuration` + 타임아웃 8s/5s 통일 — **4회 연속 이월**
- [ ] 앱 문의처 `mailto:` 아님 · `store_id` 문자셋(운영 코드 `yc-jl2zm4` 에 `l`) — **인쇄물에 남는 값이라 다음 약국 발급 전이 가장 싸다**
- [ ] `.gitattributes` `* text=auto eol=lf` — 10차 H1(CRLF 로 e2e 16종 침묵)의 근본 조건이 그대로
- [ ] 레거시 테이블 `prescriptions`·`pharmacy_patients` DROP(0행·참조 0, 비가역이라 보류) · `_workspace/eval_*` 누적 정리

---

## ✅ 상시 게이트 (자동화됨 — 깨졌을 때만 본다)

| 무엇 | 언제 | 실패 시 신호 |
|------|------|--------------|
| `.github/workflows/ci.yml` (tsc·lint·unit·schema-gate) | PR·push·하루 2회 | GitHub Actions |
| `.github/workflows/smoke.yml` (익명 11 + 인증 6) | 프로덕션 배포 직후·하루 2회 | GitHub Actions |
| Sentry (`yaksaro` / `javascript-nextjs`) | 런타임 예외 | 이메일 |
| `notification_runs` (058) | cron 실행마다 | **행이 없으면 안 돈 것** — PR #66 으로 성립(조회 실패·400 도 영수증을 남긴다). 401 만 예외이며 그건 Sentry 경보로 온다 |
| `db-gate` (RLS 누수 27단언 등 13종) | ❌ **실행 0회** | 없음 — 위 🟠 참조 |

로컬 전체 검증: `npm run test:e2e:db` (13 스위트, 서버 불필요) · `npm run test:unit` (69) · `npm run build`
