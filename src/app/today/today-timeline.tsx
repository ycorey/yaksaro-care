'use client'

import { useState, useEffect, useMemo } from 'react'

export type Meal = 'morning' | 'afternoon' | 'evening'

export interface SlotState {
  meal: Meal
  label: string
  time: string        // 'HH:MM'
  medCount: number
  checked: boolean
  checkedAt: string | null  // ISO timestamp of last check, or null
}

function haptic() {
  try { navigator.vibrate?.([50]) } catch {}
}

// 'HH:MM' → 오늘 날짜 기준 분 단위 (0~1439)
function slotMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// 현재 시각(분)
function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

function fmtCheckedTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? '오전' : '오후'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${ampm} ${h}:${m.toString().padStart(2, '0')}`
}

function fmtElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}분 전`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}시간 ${m}분 전` : `${h}시간 전`
}

export default function TodayTimeline({
  initialSlots,
  hasMeds,
}: {
  initialSlots: SlotState[]
  hasMeds: boolean
}) {
  const [slots, setSlots] = useState<SlotState[]>(initialSlots)
  const [now, setNow] = useState<Date>(() => new Date())

  // 1분마다 현재 시각 갱신 → 배너/다음 슬롯 재계산
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const cur = nowMinutes(now)

  // 다음 미완료 슬롯 (현재 시각 이후 가장 가까운 미체크 슬롯; 없으면 가장 이른 미체크)
  const nextMeal: Meal | null = useMemo(() => {
    const unchecked = slots.filter(s => !s.checked)
    if (unchecked.length === 0) return null
    const upcoming = unchecked.find(s => slotMinutes(s.time) >= cur)
    return (upcoming ?? unchecked[0]).meal
  }, [slots, cur])

  // 지연 알림: 슬롯 시간 + 30분 지났고 아직 미체크인 슬롯 (가장 오래 지연된 것 우선)
  const overdue = useMemo(() => {
    const late = slots
      .filter(s => !s.checked && cur >= slotMinutes(s.time) + 30)
      .sort((a, b) => slotMinutes(a.time) - slotMinutes(b.time))
    return late[0] ?? null
  }, [slots, cur])

  const doneCount = slots.filter(s => s.checked).length

  function persist(meal: Meal, isChecked: boolean) {
    fetch('/api/meal-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_time: meal, is_checked: isChecked }),
    }).catch(() => {})
  }

  function check(meal: Meal) {
    haptic()
    setSlots(prev => prev.map(s =>
      s.meal === meal ? { ...s, checked: true, checkedAt: new Date().toISOString() } : s
    ))
    persist(meal, true)
  }

  function uncheck(meal: Meal) {
    haptic()
    setSlots(prev => prev.map(s =>
      s.meal === meal ? { ...s, checked: false, checkedAt: null } : s
    ))
    persist(meal, false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <span className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase">약사로 케어</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-950">오늘 복약 ☀️</h1>

      {/* 지연 알림 배너 */}
      {hasMeds && overdue && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-amber-900">
              {overdue.label} 약 드실 시간이 지났어요
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {overdue.time} · {fmtElapsed(cur - slotMinutes(overdue.time))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => check(overdue.meal)}
            className="shrink-0 text-sm font-bold px-4 py-3 rounded-xl bg-amber-500 text-white active:bg-amber-600 min-h-[52px]"
          >
            지금 먹기
          </button>
        </div>
      )}

      {/* 상단 요약 */}
      {hasMeds && (
        <p className="text-sm text-gray-500">
          오늘 {doneCount}/{slots.length} 챙김
        </p>
      )}

      {!hasMeds ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center px-6">
          <div className="text-4xl mb-3">💊</div>
          <p className="text-lg font-semibold text-gray-900 mb-1">복용 중인 약이 없어요</p>
          <p className="text-sm text-gray-400">처방전을 등록하면 오늘 복약을 챙겨드려요</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {slots.map((s) => {
            const isNext = nextMeal === s.meal && !s.checked
            return (
              <div
                key={s.meal}
                className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                  s.checked ? 'opacity-60' : ''
                } ${isNext ? 'border-l-4 border-blue-400 bg-blue-50/30' : ''}`}
              >
                {/* 시간 라벨 */}
                <div className="w-12 shrink-0 pt-0.5">
                  <p className="text-xs text-gray-400 leading-tight">{s.time}</p>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">{s.label}</p>
                </div>

                {/* 타임라인 노드 */}
                <div className="flex flex-col items-center pt-1.5 self-stretch">
                  {s.checked ? (
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                  ) : isNext ? (
                    <span className="w-3 h-3 rounded-full border-2 border-blue-500 ring-2 ring-blue-100 bg-white" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-gray-200" />
                  )}
                </div>

                {/* 오른쪽 본문 */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900">약 {s.medCount}개</p>

                  {s.checked ? (
                    <button
                      type="button"
                      onClick={() => uncheck(s.meal)}
                      className="mt-1 text-sm text-green-600 font-medium active:text-gray-500"
                    >
                      ✓ {fmtCheckedTime(s.checkedAt) || '복용'} 복용
                      <span className="text-gray-400 font-normal ml-1">· 되돌리기</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => check(s.meal)}
                      className={`mt-2 text-sm font-bold px-4 rounded-xl min-h-[52px] w-full sm:w-auto sm:px-6 transition-colors ${
                        isNext
                          ? 'bg-blue-600 text-white active:bg-blue-800'
                          : 'border border-gray-200 text-gray-600 active:bg-gray-50'
                      }`}
                    >
                      지금 먹기
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasMeds && doneCount === slots.length && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-center">
          <p className="text-base font-bold text-green-800">오늘 복약 완료 ✅</p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-36 leading-relaxed">
        이 앱은 복약 정보 기록·참고 서비스입니다.<br />의학적 진단·처방을 대체하지 않습니다.
      </p>
    </div>
  )
}
