import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'
import { MEAL_LABELS, MEAL_TIMES, isMeal } from '@/lib/meal-slots'

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
 * 인증: Authorization: Bearer <CRON_SECRET> 또는 ?key=<CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')?.replace('Bearer ', '')
  const keyParam = req.nextUrl.searchParams.get('key')
  if (!secret || (auth !== secret && keyParam !== secret)) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const meal = req.nextUrl.searchParams.get('meal') ?? ''
  if (!isMeal(meal)) return NextResponse.json({ error: 'meal 파라미터 필요(morning/afternoon/evening/bedtime)' }, { status: 400 })
  const label = MEAL_LABELS[meal]
  const time  = MEAL_TIMES[meal]

  const admin = createAdminClient()
  const day = todayKST()

  // 0) 만료 처방 약 자동 종료 — 매 cron 실행마다 한 번만 처리 (morning 끼니에 한정)
  if (meal === 'morning') {
    try { await admin.rpc('end_expired_medications', { today: day }) } catch { /* 함수 미생성 시 무시 */ }
  }

  // 1) 푸시 구독한 사용자
  const { data: subs } = await admin.from('push_subscriptions').select('user_id')
  const pushUsers = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  if (pushUsers.length === 0) return NextResponse.json({ sent: 0, reason: '구독자 없음' })

  // 2) 알림 설정을 켜둔 사용자 (전체 토글 + 이 끼니 토글)
  const { data: prefs } = await admin
    .from('profiles')
    .select('id, alarm_enabled, alarm_times')
    .in('id', pushUsers)
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
  const { data: checked } = await admin
    .from('medication_schedules')
    .select('user_id, member_id')
    .eq('check_date', day).eq('meal_time', meal).eq('is_checked', true)
    .in('user_id', pushUsers)
  const checkedPairs = new Set((checked ?? []).map((c) => pairKey(c.user_id as string, c.member_id as string | null)))

  // 4) 활성 복약이 있는 (사용자, 멤버) 쌍 → 사용자별 활성 멤버 집합
  const { data: active } = await admin
    .from('user_medications')
    .select('user_id, member_id')
    .in('user_id', pushUsers)
    .is('deleted_at', null).is('ended_at', null)
  const activeMembersByUser = new Map<string, Set<string | null>>()
  for (const m of active ?? []) {
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
  await Promise.allSettled(
    targets.map(async (u) => {
      const n = await sendPushToUser(u, {
        title: `${label} 약 드실 시간이에요 💊`,
        body: `${time} · 오늘 ${label} 약을 챙겨보세요.`,
        url: '/today',
      })
      sent += n
    }),
  )

  return NextResponse.json({ meal, day, targets: targets.length, sent })
}
