'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/app-header'
import { getDailyTip } from './health-tips'
import { celebrateAllDone } from '@/lib/confetti'
import { Pill, Flask, Sun, SunHorizon, Moon, MoonStars, HandsClapping, Check } from '@phosphor-icons/react'
import { toast } from 'sonner'

export type { Meal } from '@/lib/meal-slots'
import type { Meal } from '@/lib/meal-slots'

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
  const router = useRouter()
  const [slots, setSlots] = useState<SlotState[]>(initialSlots)
  const [now, setNow] = useState<Date>(() => new Date())
  const [justChecked, setJustChecked] = useState<Meal | null>(null)  // 방금 체크 — pop/flash용
  const [celebrate, setCelebrate] = useState(false)                  // 전체완료 축하 오버레이

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

  // 오늘의 건강 한 줄 (날짜 기준 고정 — 분 단위 갱신에 영향받지 않음)
  const tipDateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const tip = useMemo(
    () => getDailyTip(now),
    [tipDateKey] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function persist(meal: Meal, isChecked: boolean) {
    fetch('/api/meal-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_time: meal, is_checked: isChecked }),
    })
      // 페이저에선 다른 탭(홈 요약·캘린더)이 유지(persist)되므로, 서버 슬롯을 새로고침해 동기화.
      // today 자신은 낙관적 로컬 state라 영향 없음(깜빡임 X).
      .then(async (res) => {
        if (!res.ok) toast.error('복약 저장에 실패했어요. 다시 시도해 주세요.')
        else router.refresh()
      })
      .catch(() => toast.error('복약 저장에 실패했어요. 다시 시도해 주세요.'))
  }

  function check(meal: Meal) {
    haptic()
    const next = slots.map(s =>
      s.meal === meal ? { ...s, checked: true, checkedAt: new Date().toISOString() } : s
    )
    setSlots(next)
    setJustChecked(meal)
    window.setTimeout(() => setJustChecked(null), 650)

    // 전체 완료 → 색종이 축하 (canvas-confetti, 토큰 색)
    if (next.every(s => s.checked)) {
      setCelebrate(true)
      celebrateAllDone()
      window.setTimeout(() => setCelebrate(false), 2800)
    }
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
      <AppHeader />
      <h1 className="font-display text-2xl text-yc-neutral900 flex items-center gap-2">오늘 복약 <Sun weight="fill" size={22} className="text-yc-warning" /></h1>

      {/* 지연 알림 배너 */}
      {hasMeds && overdue && (
        <div className="bg-yc-warningBg border border-yc-warning/40 rounded-yc-lg px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-yc-warningText">
              {overdue.label} 약 드실 시간이 지났어요
            </p>
            <p className="text-sm text-yc-warningTextSoft mt-0.5">
              {overdue.time} · {fmtElapsed(cur - slotMinutes(overdue.time))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => check(overdue.meal)}
            className="shrink-0 font-display text-sm px-4 py-3 rounded-yc-md bg-yc-warning text-white active:opacity-90 min-h-[52px]"
          >
            지금 먹기
          </button>
        </div>
      )}

      {/* 상단 요약 */}
      {hasMeds && (
        <p className="text-sm text-yc-neutral500">
          오늘 {doneCount}/{slots.length} 챙김
        </p>
      )}

      {!hasMeds ? (
        <div className="bg-white rounded-yc-lg border border-yc-neutral200 shadow-[var(--yc-shadow-sm)] py-12 text-center px-6">
          <div className="mb-3 flex justify-center"><Pill weight="light" size={48} className="text-yc-neutral300" /></div>
          <p className="text-lg font-semibold text-yc-neutral900 mb-1">복용 중인 약이 없어요</p>
          <p className="text-sm text-yc-neutral500">처방전을 등록하면 오늘 복약을 챙겨드려요</p>
        </div>
      ) : (
        <div className="bg-white rounded-yc-lg border border-yc-neutral200 shadow-[var(--yc-shadow-sm)] divide-y divide-yc-neutral100 overflow-hidden">
          {slots.map((s, i) => {
            const isNext = nextMeal === s.meal && !s.checked
            return (
              <div
                key={s.meal}
                className={`flex items-start gap-4 px-5 py-4 transition-colors anim-page ${
                  s.checked ? 'opacity-60' : ''
                } ${isNext ? 'border-l-4 border-yc-green600 bg-yc-green50/40' : ''}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* 시간 라벨 */}
                <div className="w-12 shrink-0 pt-0.5">
                  <p className="text-xs text-yc-neutral500 leading-tight">{s.time}</p>
                  <p className="text-sm font-bold text-yc-neutral700 mt-0.5 flex items-center gap-1">
                    {s.meal === 'morning' ? <SunHorizon weight="fill" size={14} className="text-yc-warning" />
                      : s.meal === 'afternoon' ? <Sun weight="fill" size={14} className="text-yc-warning" />
                      : s.meal === 'evening' ? <Moon weight="fill" size={14} className="text-yc-blue500" />
                      : <MoonStars weight="fill" size={14} className="text-yc-neutral500" />}
                    {s.label}
                  </p>
                </div>

                {/* 타임라인 노드 — 완료=green 채움, 다음=흰+green 보더+글로우, 대기=neutral200 */}
                <div className="flex flex-col items-center pt-1.5 self-stretch">
                  {s.checked ? (
                    <span className={`w-3 h-3 rounded-full bg-yc-green600 ${justChecked === s.meal ? 'anim-check-pop' : ''}`} />
                  ) : isNext ? (
                    <span className="w-3 h-3 rounded-full border-2 border-yc-green600 ring-2 ring-yc-green100 bg-white" />
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-yc-neutral200" />
                  )}
                </div>

                {/* 오른쪽 본문 */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-yc-neutral900">약 {s.medCount}개</p>

                  {s.checked ? (
                    <button
                      type="button"
                      onClick={() => uncheck(s.meal)}
                      className={`mt-1 text-sm text-yc-green600 font-medium active:text-yc-neutral500 ${justChecked === s.meal ? 'anim-checked-flash' : ''}`}
                    >
                      <span className="flex items-center gap-1"><Check weight="bold" size={13} /> {fmtCheckedTime(s.checkedAt) || '복용'} 복용</span>
                      <span className="text-yc-neutral500 font-normal ml-1">· 되돌리기</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => check(s.meal)}
                      className={`mt-2 font-display text-sm px-4 rounded-yc-md min-h-[52px] w-full sm:w-auto sm:px-6 transition-colors ${
                        isNext
                          ? 'bg-yc-green600 text-white active:bg-yc-green700'
                          : 'border border-yc-neutral200 text-yc-neutral600 active:bg-yc-neutral50'
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
        <div className="bg-yc-green50 border border-yc-green100 rounded-yc-lg px-5 py-4 text-center">
          <p className="text-base font-bold text-yc-green700 flex items-center justify-center gap-1.5">오늘 복약 완료 <Check weight="bold" size={16} /></p>
        </div>
      )}

      {/* ── 오늘의 건강 한 줄 ── */}
      <div className="rounded-yc-lg border border-yc-green100 bg-yc-green50 px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Flask weight="fill" size={16} className="text-yc-green600" />
          <p className="text-xs font-bold tracking-wide text-yc-green600">오늘의 건강 한 줄</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">{tip.emoji}</span>
          <p className="text-[1.0625rem] font-medium text-yc-neutral800 leading-relaxed">{tip.text}</p>
        </div>
      </div>

      <p className="text-xs text-yc-neutral500 text-center pb-36 leading-relaxed">
        이 앱은 복약 정보 기록·참고 서비스입니다.<br />의학적 진단·처방을 대체하지 않습니다.
      </p>

      {/* ── 전체 복약 완료 축하 오버레이 (색종이는 canvas-confetti가 별도 렌더) ── */}
      {celebrate && (
        <div
          onClick={() => setCelebrate(false)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white/70 backdrop-blur-sm px-8 text-center"
        >
          <div className="rounded-full bg-yc-green600 flex items-center justify-center anim-pop" style={{ width: 104, height: 104 }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="font-display text-2xl text-yc-neutral900">오늘 복약 끝!</p>
          <p className="text-base text-yc-neutral600 flex items-center justify-center gap-1.5">오늘 {slots.length}번 모두 잘 챙기셨어요 <HandsClapping weight="fill" size={20} /></p>
        </div>
      )}
    </div>
  )
}
