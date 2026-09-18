// 용법 문자열 조립 — 약 지갑 카드 · 약사 대시보드 · 의사 제시 화면이 함께 쓴다.
//
// 왜 lib 인가: 같은 함수가 `@wallet/med-card-item.tsx` 와 `pharmacy/patients/[id]/page.tsx` 에
// **글자 단위로 복제**돼 있었고, 아래 "1회 N" 단위 누락도 양쪽에 똑같이 있었다.
// 한 곳에서 고치면 다른 쪽이 남는 구조라 합친다.
//
// 단위는 **"정"** 이다(제품 결정, 2026-09-05). 실제로 쓰이는 말이 그것이고, 복약 안내에서
// "1회 1개" 는 어색하게 읽힌다.
//
// ⚠️ 다만 이건 **기본값이지 사실이 아니다.** `dose_amount` 는 숫자 하나뿐이고 제형 컬럼이 없다
//    (입력 화면도 "1회 투약량 (정·캡슐·포 수)" 로 개수만 받는다 — medications/add/add-form.tsx).
//    따라서 시럽·산제·연고에도 "정" 이 붙는다. 제형을 알 수 있는 경로에서는 그쪽을 우선하라 —
//    OCR 확인 화면은 `med.unit` 이 있으면 그것을 쓰고 없을 때만 이 기본값으로 떨어진다.
//    제형 컬럼이 생기면 여기부터 고칠 것.
//    0.5 단위 입력(스테퍼 step 0.5)이 있으므로 "0.5정" 도 성립해야 한다.

import type { ScheduleType } from './med-schedule'

// ⚠️ 복용 방식(schedule_type)을 반드시 넘겨라. 필요시(PRN) 약에도 doses_per_day 가 남아 있는
//    경우가 흔한데(OCR·빈도 프리셋 잔여값) 그걸 "1일 1회" 로 찍으면 **필요시 약이 정기 복용약으로
//    읽힌다.** 2026-09-05 문구 QA 에서 약 지갑·약사 환자 상세·의사 제시 화면 세 곳이 그렇게 나갔다.
//    med-schedule.doseSummary 가 같은 이유로 PRN 에 doses_per_day 를 쓰지 않는다 — 여기도 같은 규칙.
export type DosageSchedule = { scheduleType?: ScheduleType | null; scheduleLabel?: string | null }

/** 약 지갑·약사 대시보드 카드용 — "1회 1정 · 1일 2회 · 30일분". 방식 배지(필요시·매주)는 호출부가 따로 그린다 */
export function buildDosage(
  amount: number | null,
  perDay: number | null,
  days: number | null,
  schedule?: DosageSchedule,
): string {
  const prn = (schedule?.scheduleType ?? 'daily') === 'prn'
  return [
    amount           ? `1회 ${amount}정` : null,
    perDay && !prn   ? `1일 ${perDay}회` : null,
    days             ? `${days}일분` : null,
  ].filter(Boolean).join(' · ')
}

/** 의사·약사 제시 모드용 — 일수를 빼고 "하루" 어법, 방식은 배지가 없으므로 문장 안에 넣는다(doseSummary 와 같은 순서) */
export function buildDoctorDosage(
  amount: number | null,
  perDay: number | null,
  schedule?: DosageSchedule,
): string {
  const type = schedule?.scheduleType ?? 'daily'
  return [
    amount                                       ? `1회 ${amount}정` : null,
    type === 'prn'                               ? '필요시' : null,
    type === 'weekly' && schedule?.scheduleLabel ? schedule.scheduleLabel : null,
    perDay && type !== 'prn'                     ? `하루 ${perDay}회` : null,
  ].filter(Boolean).join(' · ')
}
