'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import MedCardItem from './med-card-item'
import { type MedCard } from './prescription-section'

const MEALS = [
  { key: 'morning',   label: '아침 영양제 한번에 먹기', done: '아침 복용 완료 ✓', icon: '🌅' },
  { key: 'afternoon', label: '점심 영양제 한번에 먹기', done: '점심 복용 완료 ✓', icon: '☀️' },
  { key: 'evening',   label: '저녁 영양제 한번에 먹기', done: '저녁 복용 완료 ✓', icon: '🌙' },
] as const

function haptic() { try { navigator.vibrate?.([50]) } catch {} }
function mealKey(meal: string) {
  return `supp_${new Date().toISOString().split('T')[0]}_${meal}`
}

export default function SupplementSection({ meds }: { meds: MedCard[] }) {
  const [checks, setChecks]   = useState<Record<string, boolean>>({})
  const [loaded, setLoaded]   = useState(false)
  const [anyChecked, setAnyChecked] = useState(false)

  useEffect(() => {
    const init: Record<string, boolean> = {}
    MEALS.forEach(m => {
      try { init[m.key] = localStorage.getItem(mealKey(m.key)) === '1' } catch {}
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecks(init)
    setLoaded(true)
    setAnyChecked(Object.values(init).some(Boolean))
  }, [])

  const toggle = useCallback((meal: string) => {
    setChecks(prev => {
      const next = { ...prev, [meal]: !prev[meal] }
      haptic()
      try { localStorage.setItem(mealKey(meal), next[meal] ? '1' : '0') } catch {}
      setAnyChecked(Object.values(next).some(Boolean))

      // DB 동기화 (fire-and-forget — UI를 차단하지 않음). 오늘복약 탭과 단일 진실 소스 통일
      void fetch('/api/meal-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_time: meal, is_checked: next[meal] }),
      }).catch(e => console.warn('[wallet] meal-checks 동기화 실패:', e))

      return next
    })
  }, [])

  return (
    <div className={`rounded-yc-lg border shadow-[var(--yc-shadow-sm)] overflow-hidden transition-all duration-200 ${
      anyChecked ? 'bg-yc-green100 border-yc-green600/40' : 'bg-yc-green50 border-[#89CCB3]'
    }`}>
      {/* 카드 헤더 */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {meds.slice(0, 3).map((med, i) => (
              <div key={med.id}
                className="w-10 h-10 rounded-full border-2 border-white bg-yc-green100 overflow-hidden flex items-center justify-center text-base flex-shrink-0"
                style={{ zIndex: 3 - i }}>
                {med.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                  : '🌿'}
              </div>
            ))}
          </div>
          <div className="ml-1">
            <p className="font-display text-base text-yc-green700">내가 챙기는 영양제</p>
            <p className="text-xs text-yc-green600 mt-0.5">
              {meds.length > 0 ? `약 ${meds.length}종` : '등록된 영양제가 없어요'}
            </p>
          </div>
        </div>
        <Link href="/medications/add?tab=supplement"
          className="text-xs font-semibold text-yc-green700 bg-yc-green100 active:opacity-90 px-3 py-1.5 rounded-yc-md flex-shrink-0">
          직접 등록
        </Link>
      </div>

      <div className="px-4 pb-4">
        {meds.length === 0 ? (
          <Link href="/medications/add?tab=supplement"
            className="flex items-center justify-center gap-2 py-5 text-sm text-yc-green600 font-medium border-2 border-dashed border-yc-green100 rounded-yc-md active:bg-yc-green50">
            🌿 영양제 등록하기
          </Link>
        ) : (
          <>
            <ul className="pt-2 space-y-5">
              {meds.map(med => (
                <li key={med.id}>
                  <MedCardItem
                    id={med.id}
                    name={med.name}
                    sub={med.sub}
                    ingredient={med.ingredient}
                    isSupplement={med.isSupplement}
                    isCustom={med.isCustom}
                    initialImage={med.imageUrl}
                    itemSeq={med.itemSeq}
                    doseAmount={med.doseAmount}
                    dosesPerDay={med.dosesPerDay}
                    totalDays={med.totalDays}
                  />
                </li>
              ))}
            </ul>
            {/* 영양제 일괄 복약 버튼 */}
            <div className="space-y-2 pt-4 border-t border-yc-green600/20 mt-4">
              {!loaded ? (
                MEALS.map(m => (
                  <div key={m.key} className="h-[58px] rounded-yc-lg bg-yc-green100 animate-pulse" />
                ))
              ) : (
                MEALS.map(({ key, label, done, icon }) => (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    aria-pressed={checks[key]}
                    className={`w-full flex items-center justify-center gap-2 py-[18px] rounded-yc-lg text-base font-display transition-colors ${
                      checks[key]
                        ? 'bg-yc-green600 text-white'
                        : 'bg-yc-green100 text-yc-green700 active:opacity-90'
                    }`}
                  >
                    <span>{icon}</span>
                    <span>{checks[key] ? done : label}</span>
                  </button>
                ))
              )}
            </div>
            <Link href="/medications/add?tab=supplement"
              className="mt-3 flex items-center justify-center gap-2 py-3 text-sm text-yc-green600 font-medium border border-dashed border-yc-green100 rounded-yc-lg active:bg-yc-green50">
              + 영양제 추가
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
