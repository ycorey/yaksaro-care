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

// 복용 방식 배지 라벨 (필요시 / 매주 월·목). daily면 null.
export function scheduleLabelOf(type: string | null | undefined, dow: number[] | null | undefined): string | null {
  if (type === 'prn') return '필요시'
  if (type === 'weekly') { const w = weekdayLabels(dow); return w ? `매주 ${w}` : '매주' }
  return null
}

type DoseMed = SchedMed & {
  dose_amount?: number | null
  doses_per_day?: number | null
}

/**
 * 복용법 한 줄 요약 — "1회 1 · 필요시" / "1회 1 · 매주 월·목 · 하루 2회".
 *
 * 이 문구는 의사·약사에게 그대로 전달된다. 복용 방식(schedule_type)이 빠지면
 * 필요시 약이 정기 복용약으로 읽히므로, 빈도 표기는 반드시 방식을 거쳐서 만든다.
 *
 * 필요시(prn)에는 doses_per_day 를 쓰지 않는다 — PRN 은 일정이 아니라 "필요할 때"이고,
 * 남아 있는 값은 OCR·빈도 프리셋에서 흘러든 잔여값이라 하루 복용 횟수로 읽으면 틀린다.
 */
export function doseSummary(med: DoseMed): string {
  const parts: string[] = []
  if (med.dose_amount != null) parts.push(`1회 ${med.dose_amount}`)

  const type = med.schedule_type ?? 'daily'
  if (type === 'prn') {
    parts.push('필요시')
  } else {
    if (type === 'weekly') {
      const w = weekdayLabels(med.dow)
      parts.push(w ? `매주 ${w}` : '매주')
    }
    if (med.doses_per_day != null) parts.push(`하루 ${med.doses_per_day}회`)
  }
  return parts.join(' · ')
}
