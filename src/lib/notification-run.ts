import { logger } from './logger.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// 알림 cron 실행 영수증 기록(058).
//
// 왜 필요한가: "리필이 10주간 한 번도 안 나갔다" 를 두고
//   (a) cron 이 안 돌았다 (b) 돌았는데 대상이 없었다 (c) 보내려다 실패했다
// 를 구분할 수단이 없어, 10차 평가에서 pg_stat_statements 로 호출 횟수를 역추적해서야
// (b) 로 확정했다. 그건 진단이지 운영 수단이 아니다 — 매번 그렇게 캘 수는 없다.
//
// 기록 실패가 알림 자체를 막으면 안 된다. 영수증은 관측 수단이고, 관측 실패로 본업을
// 중단시키는 건 순서가 뒤집힌 것이다 → 로그만 남기고 삼킨다.
//
// 061 에서 /ter 신청 파기(ter_purge)도 이 표를 쓴다. 파기는 되돌릴 수 없으므로
// 알림보다 오히려 영수증이 더 필요하다 — "몇 건을 지웠는지" 만 남기고 누구인지는 남기지 않는다.
export async function recordNotificationRun(
  admin: SupabaseClient<Database>,
  run: {
    kind: 'meal' | 'refill' | 'ter_purge'
    runDate: string
    slot?: string | null
    targets?: number
    sent?: number
    failed?: number
    note?: string | null
  },
): Promise<void> {
  const { error } = await admin.from('notification_runs').insert({
    kind: run.kind,
    run_date: run.runDate,
    slot: run.slot ?? null,
    targets: run.targets ?? 0,
    sent: run.sent ?? 0,
    failed: run.failed ?? 0,
    note: run.note ?? null,
  })
  if (error) logger.warn(`cron:${run.kind}`, '발송 영수증 기록 실패', error.message)
}
