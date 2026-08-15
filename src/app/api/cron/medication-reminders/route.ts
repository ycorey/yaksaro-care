import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'
import { MEAL_LABELS, MEAL_TIMES, isMeal, effectiveMealSlots } from '@/lib/meal-slots'
import { isScheduledOnWeekday, kstWeekday } from '@/lib/med-schedule'
import { isAuthorizedBearer } from '@/lib/bearer-auth'
import { cronDbFailure, settledFailures, type CronFailure } from '@/lib/cron-guard'
import { recordNotificationRun } from '@/lib/notification-run'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// KST(UTC+9) 기준 오늘 날짜
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().split('T')[0]
}

/**
 * 복약 리마인더 cron — 끼니별로 호출(?meal=morning|afternoon|evening|bedtime).
 * 푸시 구독한 사용자 중 ① 활성 복약이 있고 ② 이 끼니를 아직 체크하지 않았고
 * ③ 알림 설정(profiles.alarm_enabled + alarm_times[meal])을 켜둔 사람에게 전송.
 * 인증: Authorization: Bearer <CRON_SECRET> (헤더 전용 — 쿼리스트링은 로그/Referer 노출되어 금지).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedBearer(req, process.env.CRON_SECRET)) {
    // 영수증을 표에 남기지 않는다 — 미인증 요청에 쓰기 경로를 열어주면 표가 밖에서 부풀려지고,
    // 그러면 "행이 없으면 안 돈 것" 이라는 판독 규칙 자체를 남이 흔들 수 있다.
    // 대신 경보로 올린다. CRON_SECRET 이 한쪽만 회전하면 **모든 실행이 여기서 끝나는데**
    // 표에는 아무 행도 안 생겨, 10주간 아무도 몰랐던 그 모양과 정확히 같아진다.
    logger.warn('cron:meal', '인증 실패로 거부 — CRON_SECRET 불일치일 수 있다')
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()
  const day = todayKST()

  const meal = req.nextUrl.searchParams.get('meal') ?? ''
  if (!isMeal(meal)) {
    // 인증은 통과했으니 이건 **호출 설정이 어긋난 것**이다(vercel.json 의 path 오타 등).
    // 행을 남기지 않으면 "cron 이 아예 안 돌았다" 로 읽혀 엉뚱한 곳을 파게 된다.
    await recordNotificationRun(admin, {
      kind: 'meal', runDate: day,
      note: `중단: meal 파라미터 이상(${meal.slice(0, 20) || '없음'})`,
    })
    return NextResponse.json({ error: 'meal 파라미터 필요(morning/afternoon/evening/bedtime)' }, { status: 400 })
  }
  const label = MEAL_LABELS[meal]
  const time  = MEAL_TIMES[meal]

  // 조회 실패로 중단할 때도 영수증을 남긴다.
  // 남기지 않으면 "돌았는데 실패한 실행" 이 "안 돈 실행" 과 **같은 모양**(행 없음)이 되어,
  // 058 이 세운 판독 규칙("행이 없으면 안 돈 것")이 성립하지 않는다.
  const abort = async (fail: CronFailure, step: string) => {
    await recordNotificationRun(admin, {
      kind: 'meal', runDate: day, slot: meal, note: `중단: ${step} 단계 실패`,
    })
    return NextResponse.json(fail.body, { status: fail.status })
  }

  // 0) 만료 처방 약 자동 종료 — 매 cron 실행마다 한 번만 처리 (morning 끼니에 한정)
  if (meal === 'morning') {
    try { await admin.rpc('end_expired_medications', { today: day }) } catch { /* 함수 미생성 시 무시 */ }
  }

  // 1) 푸시 구독한 사용자
  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('user_id')
  const subsFail = cronDbFailure('cron:meal', '푸시 구독', subsError)
  if (subsFail) return abort(subsFail, '푸시 구독')
  const pushUsers = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  if (pushUsers.length === 0) {
    await recordNotificationRun(admin, { kind: 'meal', runDate: day, slot: meal, note: '구독자 없음' })
    return NextResponse.json({ sent: 0, reason: '구독자 없음' })
  }

  // 2) 알림 설정을 켜둔 사용자 (전체 토글 + 이 끼니 토글)
  const { data: prefs, error: prefsError } = await admin
    .from('profiles')
    .select('id, alarm_enabled, alarm_times')
    .in('id', pushUsers)
  const prefsFail = cronDbFailure('cron:meal', '알림 설정', prefsError)
  if (prefsFail) return abort(prefsFail, '알림 설정')
  const allowedSet = new Set(
    (prefs ?? [])
      .filter((p) =>
        p.alarm_enabled !== false &&
        (p.alarm_times as Record<string, boolean> | null)?.[meal] !== false)
      .map((p) => p.id as string),
  )

  // 멤버 인식: 체크/활성 복약을 (user_id, member_id) 쌍 단위로 집계.
  // 한 계정이 여러 가족 멤버 약을 관리하므로, '본인'이 체크해도 '어머니'가 미체크면 알림해야 한다.
  const pairKey = (u: string, m: string | null) => `${u}:${m ?? ''}`

  // 3) 이 끼니를 이미 체크한 (사용자, 멤버) 쌍
  const { data: checked, error: checkedError } = await admin
    .from('medication_schedules')
    .select('user_id, member_id')
    .eq('check_date', day).eq('meal_time', meal).eq('is_checked', true)
    .in('user_id', pushUsers)
  const checkedFail = cronDbFailure('cron:meal', '오늘 체크 현황', checkedError)
  if (checkedFail) return abort(checkedFail, '오늘 체크 현황')
  const checkedPairs = new Set((checked ?? []).map((c) => pairKey(c.user_id as string, c.member_id as string | null)))

  // 4) 활성 복약이 있는 (사용자, 멤버) 쌍 → 사용자별 활성 멤버 집합
  const { data: active, error: activeError } = await admin
    .from('user_medications')
    .select('user_id, member_id, schedule_type, dow, meal_times, doses_per_day')
    .in('user_id', pushUsers)
    .is('deleted_at', null).is('ended_at', null)
  const activeFail = cronDbFailure('cron:meal', '활성 복약', activeError)
  if (activeFail) return abort(activeFail, '활성 복약')
  // prn(필요시)·오늘 요일 미해당 weekly는 알림 대상에서 제외
  const wd = kstWeekday()
  const activeMembersByUser = new Map<string, Set<string | null>>()
  for (const m of active ?? []) {
    if (!isScheduledOnWeekday(m, wd)) continue
    if (!effectiveMealSlots(m).includes(meal)) continue   // 이 끼니에 실제 배정된 약만
    const u = m.user_id as string
    if (!activeMembersByUser.has(u)) activeMembersByUser.set(u, new Set())
    activeMembersByUser.get(u)!.add(m.member_id as string | null)
  }

  // 알림 대상: 알림 켜짐 + 활성 멤버 중 이 끼니를 아직 체크 안 한 멤버가 1명 이상
  const targets = pushUsers.filter((u) => {
    if (!allowedSet.has(u)) return false
    const members = activeMembersByUser.get(u)
    if (!members || members.size === 0) return false
    for (const mem of members) {
      if (!checkedPairs.has(pairKey(u, mem))) return true
    }
    return false
  })

  let sent = 0
  const results = await Promise.allSettled(
    targets.map(async (u) => {
      const n = await sendPushToUser(u, {
        title: `${label} 약 드실 시간이에요 💊`,
        body: `${time} · 오늘 ${label} 약을 챙겨보세요.`,
        url: '/today',
      })
      sent += n
    }),
  )

  const pushFailed = settledFailures(results)
  await recordNotificationRun(admin, {
    kind: 'meal', runDate: day, slot: meal,
    targets: targets.length, sent, failed: pushFailed,
    note: targets.length === 0 ? '대상 없음(이미 체크했거나 해당 끼니 약 없음)' : null,
  })
  return NextResponse.json({ meal, day, targets: targets.length, sent, pushFailed })
}
