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

/** 약 지갑·약사 대시보드 카드용 — "1회 1정 · 1일 2회 · 30일분" */
export function buildDosage(
  amount: number | null,
  perDay: number | null,
  days: number | null,
): string {
  return [
    amount ? `1회 ${amount}정` : null,
    perDay ? `1일 ${perDay}회` : null,
    days   ? `${days}일분` : null,
  ].filter(Boolean).join(' · ')
}

/** 의사·약사 제시 모드용 — 일수를 빼고 "하루" 어법을 쓴다(제시 화면 관례) */
export function buildDoctorDosage(
  amount: number | null,
  perDay: number | null,
): string {
  return [
    amount  ? `1회 ${amount}정` : null,
    perDay  ? `하루 ${perDay}회` : null,
  ].filter(Boolean).join(' · ')
}
