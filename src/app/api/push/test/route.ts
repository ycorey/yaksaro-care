import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

// 현재 로그인 사용자에게 테스트 푸시 (구독 동작 확인용)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const sent = await sendPushToUser(user.id, {
    title: '약사로케어 알림이 켜졌어요 🔔',
    body: '약 드실 시간에 이렇게 알려드릴게요.',
    url: '/today',
  })
  return NextResponse.json({ sent })
}
