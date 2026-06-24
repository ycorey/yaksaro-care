# 단골약국 비임상 소통 — 약사 구조화 회신 + 환자 1탭 응답

- 작성일: 2026-06-24
- 상태: 설계 승인됨(구현 대기)
- 관련: `034_pharmacy_requests`, `037_pharmacy_requests_immutable`, 단골약국 비임상 소통(PR #1)

## 배경 / 문제

현재 단골약국(B2B) 비임상 소통은 환자→약국 **구조화 요청**(콜백·조제준비·픽업·상담예약·재고문의)만 있고,
약사→환자 회신 수단은 **전화(tel:)** 와 **상태 변경 푸시**(open→acknowledged/done) 뿐이다.
약사가 "준비됐어요 / 재고 있어요 / 3시 이후 픽업" 같은 **짧은 비임상 안내**를 전화 없이 보낼 경로가 없다.

## 제약 (규제 — 가장 중요)

이 프로젝트는 **인앱 임상 상담·자유 채팅을 의도적으로 배제**한다(약사법/비대면 복약상담 회색지대).
따라서 추가 소통은 반드시:
- 임상(진단·복약지시·처방변경) 아님, **물류·예약 안내만**
- 환자측은 **자유 텍스트 입력 없음**(1탭 응답만) → 채팅으로 변질 방지
- 약사 메모는 짧고 비임상 + **금칙어 게이트**로 임상 표현 차단

## 목표 / 비목표

**목표**
- 약사가 요청 1건에 **퀵리플라이(프리셋) + 짧은 비임상 메모**로 단방향 회신
- 환자가 그 회신에 **"확인했어요" 1탭** 응답(+기존 취소)
- 양측 푸시/표시로 "주고받는" 체감 제공, 규제선 유지

**비목표**
- 자유 양방향 채팅 / 스레드 / 임상 상담
- 외부 채널(카카오 알림톡·SMS) 연동 — 추후 별도 과제

## 데이터 모델 (마이그레이션 038)

`pharmacy_requests`에 컬럼 추가:

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `reply_template` | text | 약사 퀵리플라이 코드. CHECK in (`ready`,`in_stock`,`out_of_stock`,`pickup_time`,`visit`,`done`) |
| `reply_note` | text | 약사 짧은 비임상 메모(≤200, 선택) |
| `replied_at` | timestamptz | 회신 시각 |
| `patient_ack_at` | timestamptz | 환자 "확인했어요" 1탭 시각 |

퀵리플라이 라벨(코드→표시):
- `ready` 준비 완료 · `in_stock` 재고 있음 · `out_of_stock` 재고 없음
- `pickup_time` 픽업 가능 시간(메모와 함께) · `visit` 방문 요망 · `done` 처리 완료

## 무결성 — 037 트리거를 역할 분기로 교체

기존 037은 status/responded_at 외 전 컬럼을 OLD로 고정한다. 회신 컬럼이 생기므로
`pharmacy_requests_pin_immutable()`를 **역할 분기**로 교체(같은 트리거명 재정의):

- 분기 기준: `auth.uid() = OLD.patient_id` → 환자, 아니면 약사(RLS가 이미 자기 약국으로 제한)
- **약사 경로**: `reply_template`·`reply_note`·`replied_at`·`status`·`responded_at`만 변경 허용,
  `patient_ack_at`·식별/원본 컬럼은 OLD 고정
- **환자 경로**: `status`(취소)·`patient_ack_at`만 변경 허용, `reply_*`·식별/원본 컬럼은 OLD 고정
- 공통 고정: `id`·`patient_id`·`pharmacy_id`·`member_id`·`type`·`note`·`contact_phone`·`created_at`

(트리거는 security definer; RLS 컨텍스트의 `auth.uid()` 사용 가능. 위반 시 에러 대신 조용히 OLD로 되돌림 — 037 정책 유지.)

## API

### 약사 회신 — `POST /api/pharmacy/request/reply` (신규)
- 인증: 약사 사용자 토큰 + RLS(자기 약국 요청만 — preq_pharmacist_update)
- 입력: `{ id, template, note? }`
- 검증: `template`은 프리셋 6종 중 하나 / `note`는 트림·≤200 · **금칙어 게이트**(`lib/lifestyle-info/safety-frame`의 `FORBIDDEN_PATTERNS` 재사용 또는 경량 동등 체크) 통과 실패 시 400
- 처리: `reply_template`·`reply_note`·`replied_at=now`, status가 `open`이면 `acknowledged`로
- 후처리: 환자에게 **푸시**(fire-and-forget) "약국에서 답이 왔어요: 〈라벨〉", url `/settings` 또는 요청 화면

### 환자 응답 — `PATCH /api/pharmacy/request` (기존 확장)
- 입력에 `action` 추가: `{ id, action: 'ack' | 'cancel' }` (기존 무 action=cancel 호환 유지)
- `ack`: 본인·`replied_at` 존재 요청에 `patient_ack_at=now`
- `cancel`: 기존 동작(status='canceled', status in open·acknowledged 본인 요청)
- 약사 푸시는 생략(노이즈 방지) — 요청함 재조회 시 "환자 확인함" 표시

## UI

### 약사 요청함 — `pharmacy-request-inbox.tsx`
- 활성 요청 카드에 **퀵리플라이 칩 6종** + **짧은 메모 입력**(≤200, placeholder "예: 오후 3시 이후 가능") + 보내기 버튼
- 회신 후: 보낸 라벨·메모·시각 표시, `patient_ack_at` 있으면 "환자 확인함" 배지
- 면책 한 줄: "예약·물류 안내용 — 복약 상담은 전화·대면"
- 터치 타깃 실버 기준(≥48px) 유지

### 환자 보낸요청 — `pharmacy-request.tsx`
- 약사 답(라벨 + 메모) 표시, `replied_at` 상대시각
- **"확인했어요" 1탭** 버튼(자유 입력 없음) + 기존 취소
- 면책 동일 문구

## 규제 안전 요약
- 퀵리플라이 전부 물류·예약(준비/재고/픽업/방문/완료) — 임상 아님
- `reply_note` 금칙어 게이트로 "복용 중단/처방 변경" 등 임상 지시 차단
- 환자 자유 입력 0(1탭) → 비대면 상담 회색지대 회피
- 양측 면책 문구 노출

## 테스트 / 검증
- 트리거 역할 분기: 약사 토큰으로 `note`/`type` 재작성 시도 → OLD 고정 확인. 환자 토큰으로 `reply_*` 변경 시도 → OLD 고정 확인. (scripts/ 또는 임시 스크립트로 실 토큰 검증, service_role 아님)
- 금칙어 게이트: 임상 표현 포함 메모 → 400
- 푸시: 회신 시 환자 1푸시(fire-and-forget, 실패 무시)
- tsc·lint·build 통과 + 실제 토큰 라운드트립(약사 회신→환자 ack) 1회

## 영향 범위 (파일)
- `supabase/migrations/038_pharmacy_request_reply.sql` (신규 — 컬럼 + 트리거 v2)
- `src/app/api/pharmacy/request/reply/route.ts` (신규)
- `src/app/api/pharmacy/request/route.ts` (PATCH action 확장)
- `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx` (회신 UI + InboxRow 확장)
- `src/app/pharmacy/(app)/page.tsx` (inbox 쿼리에 reply_*·patient_ack_at 추가)
- `src/components/pharmacy-request.tsx` (환자측 답 표시 + 1탭)
- `src/lib/lifestyle-info/safety-frame.ts` (금칙어 체크 재사용 — export 활용)
- `src/types/database.ts` (컬럼 추가 반영)
