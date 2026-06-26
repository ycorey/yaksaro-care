// 복약 스케줄 타입(임상 스케줄 프리셋 — 가벼운 버전)
//  daily : 매일 (기본, 기존 동작)
//  prn   : 필요시 — 오늘복약 슬롯·알림에서 제외(약지갑에만)
//  weekly: 지정 요일에만 (dow: 0=일 ~ 6=토)
export type ScheduleType = 'daily' | 'prn' | 'weekly'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

type SchedMed = { schedule_type?: string | null; dow?: number[] | null }

// KST 기준 오늘 요일 (0=일 ~ 6=토). 서버 UTC와 무관하게 한국 요일로 판정.
export function kstWeekday(): number {
  return new Date(Date.now() + 9 * 3600_000).getUTCDay()
}

// 이 약이 주어진 요일의 복약 일정(오늘복약 슬롯·알림)에 포함되는가.
// 만료(ended_at)는 호출부의 기존 필터가 처리 — 여기선 타입/요일만 본다.
export function isScheduledOnWeekday(med: SchedMed, weekday: number): boolean {
  const type = med.schedule_type ?? 'daily'
  if (type === 'prn') return false
  if (type === 'weekly') return (med.dow ?? []).includes(weekday)
  return true
}

// 요일 배열 → "월·목" 라벨 (약지갑/검수 표시용)
export function weekdayLabels(dow: number[] | null | undefined): string {
  if (!dow || dow.length === 0) return ''
  return [...dow].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).filter(Boolean).join('·')
}
