'use client'

import type React from 'react'
import { useState, useEffect } from 'react'
import AppHeader from '@/components/app-header'
import { CalendarBlank, Fire, HandsClapping, Lightning, Leaf, Heart } from '@phosphor-icons/react'

type DayStatus = 'full' | 'partial' | 'miss'
type DaySummary = { done: number; status: DayStatus }
type CalendarData = { days: Record<string, DaySummary> }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function StatusDot({ status }: { status: DayStatus | undefined }) {
  if (!status) return <span className="block w-1.5 h-1.5" />
  if (status === 'full')
    return <span className="block w-1.5 h-1.5 rounded-full bg-yc-green600" />
  if (status === 'partial')
    return <span className="block w-1.5 h-1.5 rounded-full bg-yc-warning" />
  return <span className="block w-1.5 h-1.5 rounded-full border border-yc-neutral300" />
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState<CalendarData | null>(null)
  // 로딩은 파생값 — "마지막으로 적재 완료한 연-월"과 현재 연-월이 다르면 로딩 중
  const [loadedKey, setLoadedKey] = useState('')
  const monthKey = `${year}-${month}`
  const loading = loadedKey !== monthKey

  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
        if (active && res.ok) setData(await res.json())
      } finally {
        if (active) setLoadedKey(`${year}-${month}`)
      }
    })()
    return () => { active = false }
  }, [year, month])

  function prev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function next() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    if (isCurrentMonth) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // 달력 그리드 계산
  const firstDow  = new Date(year, month - 1, 1).getDay()  // 0=일
  const lastDay   = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ]
  // 6주 그리드로 패딩
  while (cells.length % 7 !== 0) cells.push(null)

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // 이번 달 요약 통계
  const days = data?.days ?? {}
  const fullDays    = Object.values(days).filter(d => d.status === 'full').length
  const partialDays = Object.values(days).filter(d => d.status === 'partial').length
  const missDays    = Object.values(days).filter(d => d.status === 'miss').length
  const recordedDays = fullDays + partialDays + missDays

  // 연속 챙김 일수 — 이번 달 한정, 오늘(또는 어제)부터 거꾸로 세기
  let streak = 0
  if (isCurrentMonth) {
    for (let d = now.getDate(); d >= 1; d--) {
      const s = days[dateKey(year, month, d)]?.status
      if (s === 'full' || s === 'partial') streak++
      else if (d === now.getDate()) continue // 오늘은 아직 안 챙겼을 수 있으니 건너뜀
      else break
    }
  }

  // 격려 메시지 (완벽 복용 비율 기준)
  const fullRatio = recordedDays > 0 ? fullDays / recordedDays : 0
  const cheer: { icon: React.ReactNode; text: string } =
    fullRatio >= 0.9 ? { icon: <HandsClapping weight="fill" size={24} className="text-yc-green700" />, text: '정말 훌륭해요! 거의 매일 완벽하게 챙기셨어요.' } :
    fullRatio >= 0.6 ? { icon: <Lightning     weight="fill" size={24} className="text-yc-green700" />, text: '잘하고 계세요. 꾸준함이 가장 큰 힘이에요.' } :
    fullRatio >= 0.3 ? { icon: <Leaf          weight="fill" size={24} className="text-yc-green700" />, text: '조금씩 챙기고 계시네요. 오늘 한 번 더 챙겨볼까요?' } :
                       { icon: <Heart         weight="fill" size={24} className="text-yc-green700" />, text: '약 챙기기가 쉽지 않죠. 내일은 한 번이라도 더 챙겨봐요.' }

  return (
    <div className="space-y-5">
      <AppHeader />
      <h1 className="font-display text-2xl text-yc-neutral900 flex items-center gap-2">복약 캘린더 <CalendarBlank weight="fill" size={22} className="text-yc-green600" /></h1>

      {/* 월 네비게이션 */}
      <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] p-4 anim-page" style={{ animationDelay: '40ms' }}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prev}
            aria-label="이전 달"
            className="w-10 h-10 flex items-center justify-center rounded-yc-md active:bg-yc-neutral100 text-yc-neutral500"
          >
            ‹
          </button>
          <span className="font-display text-base text-yc-neutral900">
            {year}년 {month}월
          </span>
          <button
            onClick={next}
            disabled={isCurrentMonth}
            aria-label="다음 달"
            className="w-10 h-10 flex items-center justify-center rounded-yc-md active:bg-yc-neutral100 text-yc-neutral500 disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[11px] font-medium pb-1 ${
                i === 0 ? 'text-yc-error' : i === 6 ? 'text-yc-blue500' : 'text-yc-neutral400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        {loading ? (
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center py-1.5">
                <div className="w-7 h-7 rounded-full bg-yc-neutral100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const key    = dateKey(year, month, day)
              const isToday = key === todayStr
              const isFuture = key > todayStr
              const summary = days[key]
              const dow = (firstDow + day - 1) % 7

              return (
                <div key={key} className="flex flex-col items-center py-1">
                  <span
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                      isToday
                        ? 'bg-yc-green600 text-white'
                        : isFuture
                        ? 'text-yc-neutral300'
                        : dow === 0
                        ? 'text-yc-error'
                        : dow === 6
                        ? 'text-yc-blue500'
                        : 'text-yc-neutral800'
                    }`}
                  >
                    {day}
                  </span>
                  <span className="mt-0.5 flex items-center justify-center h-2">
                    {!isFuture && <StatusDot status={summary?.status} />}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5 text-xs text-yc-neutral500">
          <span className="w-2 h-2 rounded-full bg-yc-green600" />
          완전 복용
        </div>
        <div className="flex items-center gap-1.5 text-xs text-yc-neutral500">
          <span className="w-2 h-2 rounded-full bg-yc-warning" />
          부분 복용
        </div>
        <div className="flex items-center gap-1.5 text-xs text-yc-neutral500">
          <span className="w-2 h-2 rounded-full border border-yc-neutral300" />
          거름
        </div>
      </div>

      {/* 이번 달 요약 */}
      {!loading && Object.keys(days).length > 0 && (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 anim-page" style={{ animationDelay: '80ms' }}>
          <p className="text-xs font-bold text-yc-neutral400 uppercase tracking-widest mb-3">
            {month}월 복약 요약
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-display text-2xl text-yc-green600">{fullDays}</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">완전 복용</p>
            </div>
            <div>
              <p className="font-display text-2xl text-yc-warning">{partialDays}</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">부분 복용</p>
            </div>
            <div>
              <p className="font-display text-2xl text-yc-neutral400">{missDays}</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">거름</p>
            </div>
          </div>
        </div>
      )}

      {!loading && Object.keys(days).length === 0 && (
        <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] py-10 text-center">
          <div className="mb-3 flex justify-center"><CalendarBlank weight="light" size={48} className="text-yc-neutral300" /></div>
          <p className="text-base font-semibold text-yc-neutral700">복약 기록이 없어요</p>
          <p className="text-sm text-yc-neutral500 mt-1">오늘 탭에서 복약을 체크해보세요</p>
        </div>
      )}

      {/* ── 복약 습관 응원 ── */}
      {!loading && recordedDays > 0 && (
        <div className="rounded-yc-lg border border-yc-green100 bg-yc-green50 px-5 py-4 anim-page" style={{ animationDelay: '120ms' }}>
          {streak >= 2 && (
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-yc-green100">
              <Fire weight="fill" size={22} className="text-yc-warning" />
              <p className="text-[1.0625rem] font-bold text-yc-green600">
                {streak}일 연속으로 약을 챙기고 계세요!
              </p>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="leading-none mt-0.5">{cheer.icon}</span>
            <p className="text-[1.0625rem] font-medium text-yc-neutral800 leading-relaxed">{cheer.text}</p>
          </div>
        </div>
      )}

      <div className="pb-36" />
    </div>
  )
}
