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
