// 약사 대시보드 순수 파생 로직 + 공용 타입. UI 무관·테스트 가능.
import { bucketByDue } from './request-schedule.ts'

export type ReqStatus = 'open' | 'acknowledged' | 'done' | 'canceled'

// 환자 요청 1건(약사가 처리). 카드·목록·페이지 공용.
export type InboxRow = {
  id: string
  type: string
  note: string | null
  contact_phone: string | null
  status: ReqStatus
  created_at: string
  due_date: string | null
  patientName: string | null
  isFamily?: boolean
  replyText?: string | null
  repliedAt?: string | null
  patientAckAt?: string | null
  patientId?: string
}

export const TYPE_LABEL: Record<string, string> = {
  callback: '전화 요청', dispense_prep: '조제 미리 준비', pickup: '픽업 예약',
  consult_booking: '상담 예약', stock_inquiry: '재고 문의',
}

export type AutoTask = {
  id: string
  kind: 'reply_pending' | 'due_today' | 'refill_today'
  label: string
  patientId: string
}

type DeriveParams = {
  requests: { id: string; patientId: string; patientName: string; status: ReqStatus; due_date: string | null; replyText?: string | null }[]
  refillsToday: { patientId: string; patientName: string }[]
  today: string
}

// '오늘 할 일'의 자동 파생분. 완료·취소 요청은 제외.
export function deriveTodayAutoTasks({ requests, refillsToday, today }: DeriveParams): AutoTask[] {
  const tasks: AutoTask[] = []
  for (const r of requests) {
    if (r.status !== 'open' && r.status !== 'acknowledged') continue
    if (r.status === 'open' && !r.replyText) {
      tasks.push({ id: r.id, kind: 'reply_pending', label: `${r.patientName} · 요청 답장 대기`, patientId: r.patientId })
    } else if (bucketByDue(r.due_date, today) === 'today') {
      tasks.push({ id: r.id, kind: 'due_today', label: `${r.patientName} · 오늘 마감`, patientId: r.patientId })
    }
  }
  for (const f of refillsToday) {
    tasks.push({ id: `refill-${f.patientId}`, kind: 'refill_today', label: `${f.patientName} · 오늘 리필`, patientId: f.patientId })
  }
  return tasks
}

export type CalendarItem = { date: string; kind: 'request' | 'refill'; label: string }

// 요청 마감·리필 만료를 캘린더 항목으로. null 날짜 제외 후 날짜순.
export function buildCalendarItems(
  requests: { date: string | null; label: string }[],
  refills: { date: string | null; label: string }[],
): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const r of requests) if (r.date) items.push({ date: r.date, kind: 'request', label: r.label })
  for (const r of refills) if (r.date) items.push({ date: r.date, kind: 'refill', label: r.label })
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

// today('YYYY-MM-DD')가 속한 달의 그리드 셀(일요일 시작). 앞뒤 빈칸은 null, 길이는 7의 배수.
export function monthGridDays(today: string): (string | null)[] {
  const [y, m] = today.split('-').map(Number)
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0=일
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
