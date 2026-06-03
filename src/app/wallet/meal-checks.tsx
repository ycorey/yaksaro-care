'use client'

import { useState, useEffect } from 'react'

type Meals = { morning: boolean; afternoon: boolean; evening: boolean }

const ALL_MEALS = [
  { key: 'morning',   label: '아침', icon: '🌅' },
  { key: 'afternoon', label: '점심', icon: '☀️' },
  { key: 'evening',   label: '저녁', icon: '🌙' },
] as const

type MealKey = typeof ALL_MEALS[number]['key']

// 서버 영속화 실패(오프라인 등) 대비 localStorage 캐시 키
function cacheKey(userId: string) {
  return `meal_checks_${userId}_${new Date().toISOString().split('T')[0]}`
}

function haptic() {
  try { navigator.vibrate?.([50]) } catch {}
}

export default function MealChecks({
  userId,
  activeSlots = ['morning', 'afternoon', 'evening'],
}: {
  userId: string
  activeSlots?: string[]
}) {
  const MEALS = ALL_MEALS.filter(m => activeSlots.includes(m.key))

  const [checks, setChecks] = useState<Meals>({ morning: false, afternoon: false, evening: false })
  const [loaded, setLoaded] = useState(false)  // 마운트/로딩 완료 전엔 스켈레톤 (Hydration 안정화)

  // 서버에서 오늘 상태 로드 (실패 시 localStorage 폴백)
  useEffect(() => {
    let alive = true
    fetch('/api/meal-checks')
      .then(r => r.json())
      .then(d => { if (alive && d.checks) setChecks(d.checks) })
      .catch(() => {
        try {
          const saved = localStorage.getItem(cacheKey(userId))
          if (saved && alive) setChecks(JSON.parse(saved))
        } catch {}
      })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [userId])

  function toggle(meal: MealKey) {
    const next = { ...checks, [meal]: !checks[meal] }
    setChecks(next)
    haptic()
    try { localStorage.setItem(cacheKey(userId), JSON.stringify(next)) } catch {}
    // 서버 영속화 (fire-and-forget)
    fetch('/api/meal-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_time: meal, is_checked: next[meal as keyof Meals] }),
    }).catch(() => {})
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
      <p className="text-base font-semibold text-gray-700 mb-3">오늘 복약 체크</p>
      <div className="grid grid-cols-3 gap-3">
        {MEALS.map(({ key, label, icon }) => {
          // 로딩 전: 동일 레이아웃의 스켈레톤 (CLS/하이드레이션 깜빡임 방지)
          if (!loaded) {
            return (
              <div key={key} className="flex flex-col items-center justify-center min-h-[56px] rounded-2xl bg-gray-100 animate-pulse">
                <span className="text-2xl leading-none opacity-30">{icon}</span>
                <span className="text-sm font-semibold mt-1 text-transparent">{label}</span>
              </div>
            )
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={checks[key]}
              className={`flex flex-col items-center justify-center min-h-[56px] rounded-2xl transition-colors ${
                checks[key] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 active:bg-gray-200'
              }`}
            >
              <span className="text-2xl leading-none">{icon}</span>
              <span className="text-sm font-semibold mt-1">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
