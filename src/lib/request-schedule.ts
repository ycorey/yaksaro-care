export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later'

// KST 오늘 날짜 (YYYY-MM-DD)
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().split('T')[0]
}

// 마감일(YYYY-MM-DD)과 기준일(YYYY-MM-DD)의 일수 차로 버킷 분류.
// 둘 다 UTC 자정으로 파싱해 순수 일수차를 낸다(타임존 영향 제거).
export function bucketByDue(due: string | null, today: string): DueBucket {
  if (!due) return 'today'
  const diff = Math.round(
    (Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000,
  )
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return 'thisWeek'
  return 'later'
}
