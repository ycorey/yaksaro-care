// 이 앱의 "하루" 는 한국 자정에 넘어간다 — 날짜 키(check_date · started_at · prescribed_at ·
// ended_at · 순응도 윈도)는 전부 이 파일로 만든다.
//
// 왜 한 곳인가: 2026-10-19 12차 평가가 `new Date().toISOString().split('T')[0]`(UTC 날짜) 10곳을
// 찾았다. 화면·/api/meal-checks 는 UTC 날짜를, 알림 cron 은 KST 날짜를 키로 써서 **같은 하루를
// 두 이름으로** 부르고 있었다. 결과: 아침 8시에 체크하면 전날 행에 기록되고 9시가 지나면 미체크로
// 되돌아가며, 아침 알림 cron 은 그 체크를 보지 못했다. 운영 데이터는 사용 시각이 전부 KST 09시
// 이후여서 두 규약이 어긋난 행이 0건이었다(2026-10-20 실측) — 데이터 이전 없이 규약만 바꾼다.
//
// 규약: 모든 호출자가 같은 키를 쓴다. 한 곳만 다른 규약을 쓰면 KST 00~09시에 그 화면만 하루가
// 어긋난다(meal-slots.ts 의 경고가 그 사례다). 새 날짜 키가 필요하면 여기 함수를 쓸 것.

const KST_OFFSET_MS = 9 * 3600_000
const DAY_MS = 86_400_000

/** timestamptz · epoch ms · Date → 한국 날짜 'YYYY-MM-DD' */
export function kstDateOf(input: Date | number | string): string {
  const ms = typeof input === 'number' ? input : new Date(input).getTime()
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 한국 기준 오늘 'YYYY-MM-DD' */
export function todayKST(): string {
  return kstDateOf(Date.now())
}

/** 'YYYY-MM-DD' 에 n 일 더하기 — 타임존 무관한 순수 날짜 산술 */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' 두 날짜의 일수 차(to − from). 같은 날 0, 내일 1, 어제 −1 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS)
}
