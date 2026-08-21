export type Meal = 'morning' | 'afternoon' | 'evening' | 'bedtime'

export const MEAL_SLOTS = [
  { meal: 'morning'   as Meal, label: '아침',    time: '08:00', h: 8,  m: 0  },
  { meal: 'afternoon' as Meal, label: '점심',    time: '12:30', h: 12, m: 30 },
  { meal: 'evening'   as Meal, label: '저녁',    time: '19:00', h: 19, m: 0  },
  { meal: 'bedtime'   as Meal, label: '자기 전', time: '22:00', h: 22, m: 0  },
] as const

export const ALL_MEALS = MEAL_SLOTS.map(s => s.meal)

// meal → 라벨/시각 빠른 조회 (SSOT인 MEAL_SLOTS에서 파생)
export const MEAL_LABELS = Object.fromEntries(
  MEAL_SLOTS.map(s => [s.meal, s.label]),
) as Record<Meal, string>

export const MEAL_TIMES = Object.fromEntries(
  MEAL_SLOTS.map(s => [s.meal, s.time]),
) as Record<Meal, string>

// 런타임 검증용 타입 가드 (route의 meal_time 파라미터 검증 단일화)
export function isMeal(x: unknown): x is Meal {
  return typeof x === 'string' && (ALL_MEALS as string[]).includes(x)
}

// 복용횟수 기반 기본 슬롯 (meal_times 미지정 약 폴백 — 화면 간 동일 규칙 유지)
export function defaultMealKeys(dosesPerDay: number): Meal[] {
  if (dosesPerDay === 1) return ['morning']
  if (dosesPerDay === 2) return ['morning', 'evening']
  return ['morning', 'afternoon', 'evening']
}

// 이 약이 실제 배정되는 끼니(홈/오늘/알림 공용 SSOT).
// meal_times가 있으면 유효한 Meal만, 없으면 복용횟수 기반 기본 슬롯으로 폴백.
export function effectiveMealSlots(
  med: { meal_times?: string[] | null; doses_per_day?: number | null },
): Meal[] {
  const explicit = (med.meal_times ?? []).filter(isMeal)
  return explicit.length > 0 ? explicit : defaultMealKeys(med.doses_per_day ?? 0)
}

// ── 등록 당일 복용 시작 규칙 ──────────────────────────────────────────
// 약국에서 약을 받아 등록한 "그날"은, 등록 시각에 이미 지나간 끼니를 오늘 일정에서
// 제외한다 — 1일 3회 처방을 저녁에 등록하면 오늘은 저녁부터 시작한다(실사용 요청).
// 내일부터는 전 슬롯이 그대로 적용되고, 약지갑의 복용법 표기(아침·점심·저녁)는 불변.
//
// "지나갔다"의 기준: 슬롯 시각 + 3시간(단, 다음 슬롯 시각을 넘지 않게 절삭),
// 자기 전은 자정까지. 약을 받자마자 먹는 늦은 복용(20시에 받은 저녁약)은 오늘로
// 인정하되, 슬롯 두 개가 붙어버리는 이중 복용(18:30 등록에 점심+저녁)은 막는 값이다.
//   morning(08:00)→11:00 / afternoon(12:30)→15:30 / evening(19:00)→22:00 / bedtime(22:00)→24:00
//
// 알림 cron 은 이 규칙이 필요 없다 — cron 은 슬롯 시각에 발화하므로, 그 뒤에 등록된
// 약은 발화 시점에 존재하지 않았고, 그 전에 등록된 약은 슬롯이 미래였으므로 제외
// 대상이 아니다. 제외되는 슬롯에 알림이 나가는 경우의 수가 구조적으로 없다.
//
// ⚠️ "당일" 의 날짜 키는 화면·check_date 와 같은 규약(UTC 날짜 문자열)을 쓴다.
// 이 앱의 하루는 UTC 자정(=KST 09:00)에 넘어간다 — 화면 3곳과 /api/meal-checks 전부.
// 여기만 KST 자정으로 키잉하면 KST 00~09시 사이에 필터가 먼저 풀려, 같은 화면-하루
// 안에서 제외됐던 끼니가 미체크로 부활하고(완료→미완료 후퇴) 그걸 누르면 그날 배정된
// 적 없는 check_date 로 유령 체크가 남는다(리뷰 실측). 끼니 마감 판정만 KST 벽시계다.

const REG_GRACE_MIN = 180

// meal → 등록 당일 적용 마감(자정 기준 분). MEAL_SLOTS 순서에서 파생.
const REG_CUTOFF_MIN = Object.fromEntries(
  MEAL_SLOTS.map((s, i) => {
    const start = s.h * 60 + s.m
    const next  = MEAL_SLOTS[i + 1]
    const nextStart = next ? next.h * 60 + next.m : 1440   // 마지막(자기 전)은 자정까지
    return [s.meal, Math.min(nextStart, start + REG_GRACE_MIN)]
  }),
) as Record<Meal, number>
// 자기 전(22:00)만은 +3h 절삭 대신 자정까지 — 자기 직전 등록도 오늘 복용이다.
REG_CUTOFF_MIN.bedtime = 1440

// timestamptz → KST 자정 기준 분(0~1439). 끼니 마감은 한국 벽시계로 판정한다.
function kstMinutesOf(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/**
 * 이 약이 오늘 실제로 배정되는 끼니 — 등록 당일이면 지나간 끼니를 뺀다.
 * createdAt 이 없거나(과거 데이터 방어) 등록일이 오늘이 아니면 그대로 돌려준다.
 * 홈/오늘복약/약지갑 끼니버튼 공용. (알림 cron 은 위 주석대로 불필요)
 *
 * @param todayUtc 호출 화면이 쓰는 "오늘"(UTC 날짜 문자열) — check_date 와 같은 값을
 *                 넘겨야 한다. 다른 키(KST 자정)를 쓰면 화면-하루와 어긋난다(위 ⚠️).
 */
export function slotsApplicableToday(
  meals: Meal[],
  createdAt: string | null | undefined,
  todayUtc: string,
): Meal[] {
  if (!createdAt) return meals
  if (new Date(createdAt).toISOString().split('T')[0] !== todayUtc) return meals
  const reg = kstMinutesOf(createdAt)
  return meals.filter(m => reg < REG_CUTOFF_MIN[m])
}
