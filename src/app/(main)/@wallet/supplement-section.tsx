'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Flask, Check } from '@phosphor-icons/react'
import MedCardItem from './med-card-item'
import { type MedCard } from './prescription-section'
import { defaultMealKeys, type Meal } from '@/lib/meal-slots'
import { MEAL_ICONS } from '@/lib/meal-icons'
import { logger } from '@/lib/logger'

// 끼니 순서·아이콘은 SSOT(meal-slots/meal-icons), 라벨은 영양제 도메인 카피
const MEALS: { key: Meal; label: string; done: string }[] = [
  { key: 'morning',   label: '아침 영양제 한번에 먹기',    done: '아침 복용 완료' },
  { key: 'afternoon', label: '점심 영양제 한번에 먹기',    done: '점심 복용 완료' },
  { key: 'evening',   label: '저녁 영양제 한번에 먹기',    done: '저녁 복용 완료' },
  { key: 'bedtime',   label: '자기 전 영양제 한번에 먹기',  done: '취침 전 복용 완료' },
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
    : mealsFor(defaultMealKeys(maxDoses))

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    activeMeals.forEach(m => { init[m.key] = !!serverChecks[m.key] })
    return init
  })
  const toggle = useCallback((meal: string) => {
    setChecks(prev => {
      const next = { ...prev, [meal]: !prev[meal] }
      haptic()
      void fetch('/api/meal-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_time: meal, is_checked: next[meal] }),
      }).catch(e => logger.warn('wallet', 'meal-checks 동기화 실패', e))
      return next
    })
  }, [])

  return (
    <div className="bg-white rounded-yc-xl border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] overflow-hidden transition-all duration-200">
      {/* 카드 헤더 */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
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
            <p className="font-semibold text-base text-yc-green700">내가 챙기는 영양제</p>
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

      <div className="px-5 pb-4">
        {meds.length === 0 ? (
          <Link href="/medications/add?tab=supplement"
            className="flex items-center justify-center gap-2 py-5 text-sm text-yc-green600 font-medium bg-yc-green50 rounded-yc-md active:opacity-90">
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
                    scheduleLabel={med.scheduleLabel}
                  />
                </li>
              ))}
            </ul>
            {/* 영양제 일괄 복약 버튼 */}
            <div className="space-y-2 pt-4 border-t border-yc-green600/20 mt-4">
              {activeMeals.map(({ key, label, done }) => {
                const Icon = MEAL_ICONS[key]
                return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  aria-pressed={checks[key]}
                  className={`w-full flex items-center justify-center gap-2 py-[18px] rounded-yc-lg text-base font-semibold transition-colors ${
                    checks[key]
                      ? 'bg-yc-green600 text-white'
                      : 'bg-yc-green100 text-yc-green700 active:opacity-90'
                  }`}
                >
                  <span><Icon weight="fill" size={18} /></span>
                  <span>{checks[key] ? <><Check weight="bold" size={14} className="inline mr-1" />{done}</> : label}</span>
                </button>
                )
              })}
            </div>
            <Link href="/medications/add?tab=supplement"
              className="mt-3 flex items-center justify-center gap-2 py-3 text-sm text-yc-green600 font-medium bg-yc-green50 rounded-yc-lg active:opacity-90">
              + 영양제 추가
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
