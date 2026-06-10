export type Meal = 'morning' | 'afternoon' | 'evening' | 'bedtime'

export const MEAL_SLOTS = [
  { meal: 'morning'   as Meal, label: '아침',    time: '08:00', h: 8,  m: 0  },
  { meal: 'afternoon' as Meal, label: '점심',    time: '12:30', h: 12, m: 30 },
  { meal: 'evening'   as Meal, label: '저녁',    time: '19:00', h: 19, m: 0  },
  { meal: 'bedtime'   as Meal, label: '자기 전', time: '22:00', h: 22, m: 0  },
] as const

export const ALL_MEALS = MEAL_SLOTS.map(s => s.meal)

// 복용횟수 기반 기본 슬롯 (meal_times 미지정 약 폴백 — 화면 간 동일 규칙 유지)
export function defaultMealKeys(dosesPerDay: number): Meal[] {
  if (dosesPerDay === 1) return ['morning']
  if (dosesPerDay === 2) return ['morning', 'evening']
  return ['morning', 'afternoon', 'evening']
}
