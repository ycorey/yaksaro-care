import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedBearer } from '@/lib/bearer-auth'
import { cronDbFailure } from '@/lib/cron-guard'
import { recordNotificationRun } from '@/lib/notification-run'
import { logger } from '@/lib/logger'
import { todayKST } from '@/lib/request-schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETENTION_DAYS = 365
const STALE_NOTIFY_HOURS = 24

/**
 * /ter 신청 보유기간 집행 cron — 일 1회.
 *
 * 처리방침 제2조와 신청 폼이 "리포트 회신 완료 후 1년" 을 약속하는데 지우는 장치가 없었다.
 * 손으로 지우게 두면 결국 안 지운다 — 약속만 남고 이행이 없는 상태가 가장 나쁘다.
 *
 * 기산점은 061 의 `coalesce(replied_at, status_at, created_at)` 규칙을 따른다:
 *   회신한 건 → 회신일 / 취소·중복 → 상태변경일 / 회신 못 한 건 → 접수일
 * 마지막 항목은 방침이 명시하지 않던 구멍이라 접수일 기준으로 함께 지운다(더 보호적인 쪽).
 *
 * 겸해서 **알림이 나가지 않은 신청**을 같이 감시한다. 055 트리거는 pg_net 실패를
 * `raise warning` 으로 삼키고, anon 키를 회전하면 조용히 401 을 받는다. 그러면 신청은
 * 쌓이는데 아무도 모르고 "3~5일 회신" 이 소리 없이 깨진다. notified_at(063)이 24시간째
 * 비어 있으면 그건 알림 경로가 죽었다는 뜻이므로 **실행을 실패로 만들어** 신호를 남긴다.
 *
 * 인증: Authorization: Bearer <CRON_SECRET> (헤더 전용 — 쿼리스트링은 로그·Referer 노출).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedBearer(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()
  const runDate = todayKST()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()

  // 1) 파기 대상 조회 → 삭제. 조회를 먼저 하는 이유는 영수증에 적을 건수를 알기 위해서다.
  //    (delete 만으로도 되지만, 그러면 "0건 지웠다" 와 "조회가 실패했다" 가 구분되지 않는다.)
  const { data: due, error: dueError } = await admin
    .from('ter_requests')
    .select('id')
    .or(
      `replied_at.lt.${cutoff},` +
      `and(replied_at.is.null,status_at.lt.${cutoff}),` +
      `and(replied_at.is.null,status_at.is.null,created_at.lt.${cutoff})`,
    )
  const dueFail = cronDbFailure('cron:ter-retention', '파기 대상', dueError)
  if (dueFail) return NextResponse.json(dueFail.body, { status: dueFail.status })

  const ids = (due ?? []).map(r => r.id as string)
  let purged = 0

  if (ids.length > 0) {
    const { error: delError } = await admin.from('ter_requests').delete().in('id', ids)
    const delFail = cronDbFailure('cron:ter-retention', '파기 실행', delError)
    if (delFail) return NextResponse.json(delFail.body, { status: delFail.status })
    purged = ids.length
    // 지운 건수만 남긴다. 어떤 신청이었는지는 남기지 않는다 — 파기의 목적과 어긋난다.
    logger.info('cron:ter-retention', `보유기간 경과 신청 ${purged}건 파기`)
  }

  // 2) 알림 미발송 감시. 파기와 한 잡에 묶은 이유는 둘 다 "매일 한 번 ter_requests 를
  //    훑는다" 는 같은 일이고, 잡이 늘수록 각각이 죽었는지 보기 어려워지기 때문이다.
  const staleCutoff = new Date(Date.now() - STALE_NOTIFY_HOURS * 3600_000).toISOString()
  const { count: stuck, error: stuckError } = await admin
    .from('ter_requests')
    .select('id', { count: 'exact', head: true })
    .is('notified_at', null)
    .lt('created_at', staleCutoff)
  const stuckFail = cronDbFailure('cron:ter-retention', '미발송 신청', stuckError)
  if (stuckFail) return NextResponse.json(stuckFail.body, { status: stuckFail.status })

  const unnotified = stuck ?? 0

  await recordNotificationRun(admin, {
    kind: 'ter_purge',
    runDate,
    targets: ids.length,
    sent: purged,
    failed: unnotified,
    note: unnotified > 0 ? `알림 미발송 ${unnotified}건 — 알림 경로 점검 필요` : null,
  })

  if (unnotified > 0) {
    // 200 으로 돌려주면 Vercel 이 성공으로 기록해 아무도 보지 않는다.
    // 파기 자체는 이미 끝났으므로 데이터는 정합하다 — 실패는 오직 **알리기 위한** 것이다.
    logger.error(
      'cron:ter-retention',
      `알림이 나가지 않은 신청 ${unnotified}건 (${STALE_NOTIFY_HOURS}시간 경과) — ter-notify·트리거 점검 필요`,
    )
    return NextResponse.json(
      { purged, unnotified, error: `알림 미발송 ${unnotified}건` },
      { status: 500 },
    )
  }

  return NextResponse.json({ purged, unnotified: 0 })
}
