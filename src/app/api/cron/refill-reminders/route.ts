import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'
import { isAuthorizedBearer } from '@/lib/bearer-auth'
import { cronDbFailure, settledFailures } from '@/lib/cron-guard'
import { recordNotificationRun } from '@/lib/notification-run'
import { todayKST } from '@/lib/request-schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEAD_DAYS = 5
const MIN_DURATION_DAYS = 28

/**
 * 리필·재방문 리마인더 cron — 일 1회. 28일+ 처방약 중 만료가 LEAD일 이내인 처방을
 * 알림 켠·푸시 구독한 사용자에게 1회 발송(처방전당 refill_reminded_at으로 중복 방지).
 * 인증: Authorization: Bearer <CRON_SECRET> (헤더 전용 — 쿼리스트링은 로그/Referer 노출되어 금지).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedBearer(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1) 푸시 구독 + 알림 마스터 켠 사용자
  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('user_id')
  const subsFail = cronDbFailure('cron:refill', '푸시 구독', subsError)
  if (subsFail) return NextResponse.json(subsFail.body, { status: subsFail.status })
  const pushUsers = [...new Set((subs ?? []).map(s => s.user_id as string))]
  if (pushUsers.length === 0) {
    await recordNotificationRun(admin, { kind: 'refill', runDate: todayKST(), note: '구독자 없음' })
    return NextResponse.json({ sent: 0, reason: '구독자 없음' })
  }

  const { data: prefs, error: prefsError } = await admin.from('profiles').select('id, alarm_enabled').in('id', pushUsers)
  const prefsFail = cronDbFailure('cron:refill', '알림 설정', prefsError)
  if (prefsFail) return NextResponse.json(prefsFail.body, { status: prefsFail.status })
  const eligible = new Set((prefs ?? []).filter(p => p.alarm_enabled !== false).map(p => p.id as string))
  const users = pushUsers.filter(u => eligible.has(u))
  if (users.length === 0) {
    await recordNotificationRun(admin, { kind: 'refill', runDate: todayKST(), note: '알림 끔' })
    return NextResponse.json({ sent: 0, reason: '알림 끔' })
  }

  // 2) 활성 처방약 + 처방전(미알림) 로드
  const { data: meds, error: medsError } = await admin
    .from('user_medications')
    .select('total_days, prescription:user_prescriptions!inner(id, user_id, prescribed_at, duration_days, refill_reminded_at)')
    .in('user_id', users)
    .is('deleted_at', null)
    .is('ended_at', null)
    .not('prescription_id', 'is', null)
  const medsFail = cronDbFailure('cron:refill', '활성 처방약', medsError)
  if (medsFail) return NextResponse.json(medsFail.body, { status: medsFail.status })

  type Presc = { id: string; user_id: string; prescribed_at: string | null; duration_days: number | null; refill_reminded_at: string | null }
  const groups = new Map<string, { p: Presc; totalDays: number[] }>()
  for (const m of meds ?? []) {
    const p = m.prescription as unknown as Presc | null
    if (!p?.id || !p.prescribed_at || p.refill_reminded_at) continue
    const g = groups.get(p.id) ?? { p, totalDays: [] }
    g.totalDays.push(m.total_days ?? 0)
    groups.set(p.id, g)
  }

  // 3) KST 자정 기준 만료까지 일수 계산 → 28일+·0~LEAD일만
  const nowKST = new Date(Date.now() + 9 * 3600_000)
  const todayUTC = Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate())
  const byUser = new Map<string, { ids: string[]; minDDay: number }>()
  for (const { p, totalDays } of groups.values()) {
    const maxDays = Math.max(0, ...totalDays) || (p.duration_days ?? 0)
    if (maxDays < MIN_DURATION_DAYS) continue
    const exp = new Date(p.prescribed_at + 'T00:00:00Z'); exp.setUTCDate(exp.getUTCDate() + maxDays)
    const dDay = Math.round((exp.getTime() - todayUTC) / 86_400_000)
    if (dDay < 0 || dDay > LEAD_DAYS) continue
    const u = byUser.get(p.user_id) ?? { ids: [], minDDay: dDay }
    u.ids.push(p.id); u.minDDay = Math.min(u.minDDay, dDay)
    byUser.set(p.user_id, u)
  }

  // 4) 사용자당 1회 푸시 + refill_reminded_at 기록
  let sent = 0
  const remindedIds: string[] = []
  const results = await Promise.allSettled([...byUser.entries()].map(async ([userId, { ids, minDDay }]) => {
    const body = ids.length > 1
      ? `처방약 ${ids.length}건이 곧 떨어져요. 재방문·재처방을 챙겨보세요.`
      : minDDay === 0
        ? '처방약이 오늘까지예요. 재방문·재처방을 챙겨보세요.'
        : `처방약이 ${minDDay}일 후 떨어져요. 재방문·재처방을 챙겨보세요.`
    const n = await sendPushToUser(userId, { title: '곧 약이 떨어져요 💊', body, url: '/wallet' })
    sent += n
    // 실제 전송된 경우에만 알림 완료 마킹 — 0건(만료/실패 구독)이면 다음 cron에서 재시도
    if (n > 0) remindedIds.push(...ids)
  }))

  if (remindedIds.length > 0) {
    // 이 기록이 실패하면 다음 실행이 같은 사람에게 또 보낸다 — 조용히 넘기지 않는다.
    const { error: markError } = await admin
      .from('user_prescriptions').update({ refill_reminded_at: new Date().toISOString() }).in('id', remindedIds)
    const markFail = cronDbFailure('cron:refill', '발송 기록', markError)
    if (markFail) return NextResponse.json(markFail.body, { status: markFail.status })
  }

  const pushFailed = settledFailures(results)
  await recordNotificationRun(admin, {
    kind: 'refill', runDate: todayKST(),
    targets: byUser.size, sent, failed: pushFailed,
    note: byUser.size === 0 ? '조건 충족 처방 없음' : null,
  })
  return NextResponse.json({ sent, prescriptions: remindedIds.length, users: byUser.size, pushFailed })
}
