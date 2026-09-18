# Google Play — 스토어 등록정보 원고

> 2026-09-18 작성. Play Console → **기본 스토어 등록정보**에 그대로 붙여 넣는 원고다.
> 폼 답안(App content·Data safety)은 `docs/play-submission.md`. 여기 쓴 기능은 전부 운영에서 실제로 보이는 것만이다.
> 금칙 자가검수: `play-submission.md` §2 표 + `store-readiness-qa` 의 `BANNED` 정규식을 이 파일에 돌려 0건 확인(2026-09-18).

---

## 기본 정보

| 항목 | 값 | 제한 |
|---|---|---|
| 앱 이름 | `약사로케어 - 약 지갑·복약 관리` | 30자 이내 (현재 18자) |
| 기본 언어 | 한국어 – ko-KR | |
| 앱/게임 | 앱 | |
| 무료/유료 | 무료 | ⚠️ 한 번 무료로 게시하면 유료로 바꿀 수 없다 |
| 카테고리 | **의료** (Medical) | 건강/운동은 피트니스용이다. 건강앱 선언의 Medication management 와 맞춘다 |
| 태그 | 복약 관리 · 건강 기록 (Console 이 제시하는 목록에서 고른다) | 최대 5개 |
| 이메일 | `admin@yaksaro.co.kr` | 처리방침 제12조 문의처와 동일 |
| 웹사이트 | `https://care.yaksaro.co.kr` | |
| 전화 | (선택 — 비워 둔다) | |
| 개인정보처리방침 | `https://care.yaksaro.co.kr/privacy` | |

## 짧은 설명 (80자 이내)

```
처방약·일반약·영양제를 한 지갑에. 처방전을 찍으면 약 목록이 자동으로 정리돼요.
```
(44자)

## 전체 설명 (4,000자 이내)

> ⚠️ **첫 문단은 비의료기기 고지다 — 순서를 바꾸지 말 것.** Play 건강앱 정책이 규제 승인 없는 앱에
> 설명 첫 문단 고지를 요구한다. 문구는 앱 안(설정·약 지갑 하단)과 동일하다.

```
약사로케어는 의료기기가 아닙니다. 질병의 진단·치료·예방에 사용할 수 없고, 등록된 정보로 질병 유무를 판단하지 않습니다. 판단이 필요하면 약사·의사와 상담해 주세요.

약사로케어는 병원에서 받은 처방약, 약국에서 산 일반의약품, 챙겨 먹는 영양제를 한곳에 모아 보는 디지털 약 지갑입니다. 약 봉투와 영수증을 뒤지지 않아도, 지금 먹고 있는 약이 무엇인지 한 화면에서 확인할 수 있어요.

■ 한 지갑에 모아 보기
· 처방의약품 · 일반의약품 · 영양보조제를 나눠서 정리해요
· 처방받은 병원·진료과·처방일과 처방 일수를 함께 기록해요
· 식약처 의약품 정보를 바탕으로 약 이름과 제조사를 보여 드려요

■ 처방전을 찍으면 자동으로
· 처방전이나 약 봉투를 촬영하면 약 이름과 복용 기간을 읽어 목록으로 만들어요
· 인식이 끝난 사진은 바로 파기하고 저장하지 않아요
· 직접 입력으로도 추가할 수 있어요

■ 오늘 챙길 약을 시간대별로
· 아침·점심·저녁·자기 전으로 나눠 오늘 먹을 약을 보여 드려요
· 먹은 약은 한 번 눌러 체크해요
· 다음 복약 시간까지 남은 시간을 홈에서 바로 확인해요

■ 복약 캘린더
· 날짜별로 체크한 기록을 달력으로 돌아볼 수 있어요

■ 진료실·약국에서 그대로 보여주기
· 의사·약사에게 지금 먹는 약 목록을 화면 하나로 보여줄 수 있어요
· "무슨 약 드세요?" 라는 질문에 약 봉투 없이 답할 수 있어요

■ 가족 약도 함께
· 부모님, 아이 등 가족 구성원을 추가해 각자의 약을 따로 관리해요

■ 단골약국 연결 (선택)
· 약국에 있는 QR 코드로 단골약국을 등록할 수 있어요
· 약국이 내 복약 정보를 볼 수 있는 것은 내가 따로 동의한 경우뿐이며, 동의는 언제든 철회할 수 있어요

■ 크게, 쉽게
· 글자 크기를 보통·크게·아주 크게 중에서 고를 수 있어요
· 큰 버튼과 큰 글씨로 누구나 쉽게 쓸 수 있게 만들었어요

■ 개인정보는 이렇게 다룹니다
· 복약 정보는 건강정보로 분류해 별도 동의를 받은 뒤에만 처리해요
· 처방전 사진은 글자를 읽은 직후 파기하고, 주민등록번호 등 식별정보는 외부로 보내기 전에 지워요
· 앱 안의 [설정] → [회원 탈퇴]에서 계정과 모든 기록을 직접 삭제할 수 있어요
· 필수 권한은 없습니다. 카메라·사진·알림은 쓰는 기능에서만 선택적으로 요청해요

약사로케어는 약사가 만든 서비스입니다. 복용 여부나 용량을 바꾸는 판단은 반드시 담당 의사·약사와 상의해 주세요.

문의: admin@yaksaro.co.kr
개인정보처리방침: https://care.yaksaro.co.kr/privacy
```

> 사실 확인 메모(원고를 고칠 때 같이 확인할 것)
> - "사진 즉시 파기" — 처리방침 제2·6조, `POST /api/ocr` 파이프라인
> - "식별정보를 외부로 보내기 전에 지워요" — 처리방침 제6조(파싱 전 자동 제거, 남으면 외부 전송 안 함)
> - "필수 권한 없음" — `/permissions` · `store-readiness-qa`
> - "약사가 만든" — 운영자 사실. 사실이 아니게 되면 문장째 뺄 것
> - **넣지 않은 것:** 복약 알림 수신(실기기 미확인 — `play-submission.md` §4), 약물 상호작용(환자 대면 판정 화면 없음 — CLAUDE.md DUR 절)

## 그래픽 자산

| 슬롯 | 파일 | 규격 |
|---|---|---|
| 앱 아이콘 | `public/icons/icon-512.png` | 512×512 PNG |
| 특성 그래픽 | `scripts/store-assets/out/play/feature-graphic.png` | 1024×500 |
| 휴대전화 스크린샷 (최소 2, 최대 8) | `scripts/store-assets/out/play/01_wallet.png` ~ `05_share.png` | 1080×1920 × 5 |
| 태블릿 스크린샷 | 올리지 않는다(선택) | |

## 앱 액세스 — 심사 안내 (App access → 사용 안내)

계정: `node scripts/play-reviewer-account.mjs` 가 발급 → `_workspace/play/reviewer-account.txt` (gitignore).
Play 심사자는 영어로 읽으므로 영문으로 적는다.

```
The app requires login. Please use the email login, not Google/Kakao
(social logins cannot be used with a reviewer account).

1. Open the app. On the login screen tap "이메일로 로그인" (Log in with email).
2. Enter the username and password above.
3. Tick the two required checkboxes:
   - "[필수] 민감정보 수집·이용 동의" (consent to process health information — required by Korean Personal Information Protection Act Art. 23)
   - "[필수] 만 14세 이상" (age 14+ confirmation)
4. Tap "로그인". The account already contains sample medications (no real patient data).

Main screens: 홈 (Home) · 약지갑 (Medication wallet) · 오늘복약 (Today's doses) · 캘린더 (Calendar) · 전달 (Show to doctor/pharmacist).

Note on the pharmacy screens (/pharmacy): the same web app also serves a read-only dashboard
for pharmacists. A pharmacist can see a patient's medication list ONLY if that patient has
explicitly opted in; this reviewer account is a patient account and is not linked to any pharmacy.

This app is not a medical device. It records and displays medications the user enters; it does
not diagnose, treat, or give dosing recommendations.
```
