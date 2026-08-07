import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// 구독 등록/갱신
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const sub = (await req.json()) as PushSubscriptionJSON & { keys?: { p256dh: string; auth: string } }
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: '잘못된 구독 정보' }, { status: 400 })
  }

  // 기기 인수인계 — 같은 endpoint 를 쓰던 다른 계정 행을 먼저 정리한다(048: endpoint 유니크).
  // 이 정리 없이 upsert 하면 남의 행을 UPDATE 하려다 RLS 에 막혀 구독 자체가 조용히 실패한다.
  //
  // 왜 admin 인가: RLS 로는 타인 행을 지울 수 없는데, endpoint 는 브라우저가 이 기기에
  // 발급한 값이므로 "이 기기는 이제 내 것"이라는 주장은 정당하다. endpoint 는 어떤 API 로도
  // 외부에 노출되지 않으므로 타인 endpoint 를 알아내 지우는 것은 비현실적이고, 성공하더라도
  // 피해는 알림 중단(DoS)이지 정보 노출이 아니다.
  const row = {
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  }

  // 먼저 사용자 토큰 + RLS 로 시도한다(service_role 우회 금지 원칙).
  // 내 행이거나 신규면 여기서 끝나고 admin 은 아예 실행되지 않는다.
  const { error } = await supabase
    .from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (!error) return NextResponse.json({ ok: true })

  // 남의 행과 충돌한 경우에만(=이 기기를 쓰던 이전 계정) 인수인계한다.
  // 048 이후 endpoint 가 유니크라, 이 정리 없이는 RLS 에 막혀 구독이 조용히 실패한다.
  // admin 실행 범위를 "실제 충돌 시"로 좁혀 상시 특권 경로를 만들지 않는다.
  const isConflict = error.code === '23505' || error.code === '42501'
  if (!isConflict) {
    logger.error('push', '구독 저장 실패', { code: error.code, message: error.message })
    return NextResponse.json({ error: '알림 설정에 실패했어요' }, { status: 500 })
  }

  logger.info('push', '기기 인수인계 — 이전 계정 구독 정리')
  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete()
    .eq('endpoint', sub.endpoint).neq('user_id', user.id)

  const { error: retryError } = await supabase
    .from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (retryError) {
    logger.error('push', '인수인계 후 저장 실패', { code: retryError.code, message: retryError.message })
    return NextResponse.json({ error: '알림 설정에 실패했어요' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// 구독 해제
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { endpoint } = await req.json()
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  }
  return NextResponse.json({ ok: true })
}
