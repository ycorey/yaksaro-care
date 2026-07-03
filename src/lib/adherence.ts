// 유효 끼니 키 (meal-slots.ts의 Meal과 동일 — 무의존 로딩 위해 로컬 정의)
const VALID_MEALS = new Set(['morning', 'afternoon', 'evening', 'bedtime'])

export type AdherenceSummary = {
  periodDays:   number
  recordedDays: number                            // 기간 중 1회+ 체크한 날 수
  checkedSlots: number                            // 체크된 끼니 총합
  perDay:       { date: string; done: number }[]  // 각 날짜별 체크된 끼니 수(0~4)
}

const DAY = 86_400_000
const utcDate = (ms: number) => new Date(ms).toISOString().split('T')[0]

// append-only 로그 → (날짜,끼니)별 최신 상태 압축 → 일별 done 집계.
// logs는 logged_at 오름차순 전제(나중 행이 최신). check_date는 UTC 규약.
export function summarizeAdherence(
  logs: { check_date: string; meal_time: string; is_checked: boolean }[],
  periodDays: number,
  nowMs: number,
): AdherenceSummary {
  const startMs = nowMs - (periodDays - 1) * DAY

  const latestByDayMeal = new Map<string, Map<string, boolean>>()
  for (const row of logs) {
    if (!VALID_MEALS.has(row.meal_time)) continue
    let mm = latestByDayMeal.get(row.check_date)
    if (!mm) { mm = new Map(); latestByDayMeal.set(row.check_date, mm) }
    mm.set(row.meal_time, row.is_checked)
  }

  const perDay: { date: string; done: number }[] = []
  let recordedDays = 0
  let checkedSlots = 0
  for (let i = 0; i < periodDays; i++) {
    const d = utcDate(startMs + i * DAY)
    const mm = latestByDayMeal.get(d)
    let done = 0
    if (mm) for (const v of mm.values()) if (v) done++
    if (done > 0) { recordedDays++; checkedSlots += done }
    perDay.push({ date: d, done })
  }
  return { periodDays, recordedDays, checkedSlots, perDay }
}
