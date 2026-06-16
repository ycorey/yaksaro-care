import { SunHorizon, Sun, Moon, MoonStars, type Icon } from '@phosphor-icons/react'
import type { Meal } from './meal-slots'

// 끼니 → 아이콘 매핑 (클라이언트 전용 — phosphor를 서버 번들에 끌어들이지 않도록
// 순수 데이터인 meal-slots.ts와 분리한다)
export const MEAL_ICONS: Record<Meal, Icon> = {
  morning:   SunHorizon,
  afternoon: Sun,
  evening:   Moon,
  bedtime:   MoonStars,
}
