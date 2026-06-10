'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Flask, SunHorizon, Sun, Moon, MoonStars, Check } from '@phosphor-icons/react'
import MedCardItem from './med-card-item'
import { type MedCard } from './prescription-section'

const MEALS = [
  { key: 'morning',   label: '아침 영양제 한번에 먹기',    done: '아침 복용 완료',    icon: <SunHorizon weight="fill" size={18} /> },
  { key: 'afternoon', label: '점심 영양제 한번에 먹기',    done: '점심 복용 완료',    icon: <Sun        weight="fill" size={18} /> },
  { key: 'evening',   label: '저녁 영양제 한번에 먹기',    done: '저녁 복용 완료',    icon: <Moon       weight="fill" size={18} /> },
  { key: 'bedtime',   label: '자기 전 영양제 한번에 먹기',  done: '취침 전 복용 완료', icon: <MoonStars  weight="fill" size={18} /> },
]

function haptic() { try { navigator.vibrate?.([50]) } catch {} }

function mealsFor(mealTimes: string[]) {
  return MEALS.filter(m => mealTimes.includes(m.key))
}

export default function SupplementSection({ meds, serverChecks }: { meds: MedCard[], serverChecks: Record<string, boolean> }) {
  const mealTimesUnion = [...new Set(meds.flatMap(m => m.mealTimes ?? []))]
  const maxDoses = Math.max(0, ...meds.map(m => m.dosesPerDay ?? 0)) || 3
  const activeMeals = mealTimesUnion.length > 0
    ? mealsFor(mealTimesUnion)
    : mealsFor(maxDoses === 1 ? ['morning'] : maxDoses === 2 ? ['morning', 'evening'] : ['morning', 'afternoon', 'evening'])

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    activeMeals.forEach(m => { init[m.key] = !!serverChecks[m.key] })
    return init
  })
  const [anyChecked, setAnyChecked] = useState(() => activeMeals.some(m => !!serverChecks[m.key]))

  const toggle = useCallback((meal: string) => {
    setChecks(prev => {
      const next = { ...prev, [meal]: !prev[meal] }
      haptic()
      setAnyChecked(Object.values(next).some(Boolean))
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
                  ? <img loading="lazy" decoding="async" src={med.imageUrl} alt={med.name} className="w-full h-full object-cover" />
                  : <Flask weight="fill" size={18} className="text-yc-green700 opacity-70" />}
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
            <Flask size={15} /> 영양제 등록하기
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
              {activeMeals.map(({ key, label, done, icon }) => (
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
                  <span>{checks[key] ? <><Check weight="bold" size={14} className="inline mr-1" />{done}</> : label}</span>
                </button>
              ))}
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
