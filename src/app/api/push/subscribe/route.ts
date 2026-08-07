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
  const admin = createAdminClient()
  const { error: takeoverError } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', sub.endpoint)
    .neq('user_id', user.id)
  if (takeoverError) logger.warn('push', '이전 구독 정리 실패', takeoverError.message)

  // 내 행은 사용자 토큰 + RLS 로 기록한다(service_role 우회 금지 원칙).
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    logger.error('push', '구독 저장 실패', error.message)
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
