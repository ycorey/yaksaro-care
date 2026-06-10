import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Meal = 'morning' | 'afternoon' | 'evening' | 'bedtime'
const MEALS: Meal[] = ['morning', 'afternoon', 'evening', 'bedtime']
const TOTAL = MEALS.length // 4 (아침/점심/저녁/자기 전)

type DayStatus = 'full' | 'partial' | 'miss'
type DaySummary = { done: number; status: DayStatus }

type CheckLogRow = {
  check_date: string
  meal_time: string
  is_checked: boolean
  logged_at: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// 해당 연·월의 마지막 일 (1~31)
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// GET /api/calendar?year=2026&month=6
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const now = new Date()
  const year = Number(searchParams.get('year') ?? now.getFullYear())
  const month = Number(searchParams.get('month') ?? now.getMonth() + 1)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json({ error: '잘못된 year/month' }, { status: 400 })
  }

  const startDate = `${year}-${pad2(month)}-01`
  const endDate = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`

  const { data, error } = await supabase
    .from('medication_check_logs')
    .select('check_date, meal_time, is_checked, logged_at')
    .eq('user_id', user.id)
    .gte('check_date', startDate)
    .lte('check_date', endDate)
    .order('logged_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 미래 날짜 제외 (오늘까지만)
  const today = todayStr()

  // 로그는 append-only이므로 (날짜, meal)별 최신 상태로 압축한다.
  // logged_at 오름차순 정렬 → 같은 (날짜,meal)에 대해 나중 행이 최신 상태로 덮어쓴다.
  const latestByDayMeal = new Map<string, Map<Meal, boolean>>()

  for (const row of (data ?? []) as CheckLogRow[]) {
    const meal = row.meal_time as Meal
    if (!MEALS.includes(meal)) continue
    if (row.check_date > today) continue // 미래 날짜 제외

    let mealMap = latestByDayMeal.get(row.check_date)
    if (!mealMap) {
      mealMap = new Map<Meal, boolean>()
      latestByDayMeal.set(row.check_date, mealMap)
    }
    mealMap.set(meal, row.is_checked)
  }

  // 날짜별 체크된 meal 수 집계 → status 판정
  const days: Record<string, DaySummary> = {}

  for (const [date, mealMap] of latestByDayMeal) {
    let done = 0
    for (const meal of MEALS) {
      if (mealMap.get(meal) === true) done++
    }

    // 데이터(로그)가 있어도 최종 상태가 모두 해제(false)면 done=0 → "miss"
    const status: DayStatus = done >= TOTAL ? 'full' : done >= 1 ? 'partial' : 'miss'
    days[date] = { done, status }
  }

  return NextResponse.json({ days })
}
