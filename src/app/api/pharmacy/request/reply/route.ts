import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'
import { passesSafetyFrame } from '@/lib/lifestyle-info/safety-frame'

// 약사 자유 텍스트 회신(비임상). 사용자(약사) 토큰 + RLS(자기 약국만). 037 트리거가 컬럼 무결성 보장.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, text } = await request.json().catch(() => ({})) as { id?: string; text?: string }
  const msg = (text ?? '').toString().trim()
  if (!id || !msg) return NextResponse.json({ error: '내용을 입력해주세요' }, { status: 400 })
  if (msg.length > 300) return NextResponse.json({ error: '300자 이내로 적어주세요' }, { status: 400 })
  if (!passesSafetyFrame(msg)) {
    return NextResponse.json(
      { error: '복약·진단 안내는 전화·대면으로 해주세요. 예약·재고·픽업 안내만 보낼 수 있어요.' },
      { status: 400 },
    )
  }

  // 회신 기록 — RLS(preq_pharmacist_update)가 자기 약국 요청만 허용
  const { data, error } = await supabase
    .from('pharmacy_requests')
    .update({ reply_text: msg, replied_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['open', 'acknowledged'])
    .select('patient_id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? '대상 없음' }, { status: 500 })

  // open이면 acknowledged로 승격(별도 가드 업데이트 — done/canceled는 안 건드림)
  await supabase.from('pharmacy_requests').update({ status: 'acknowledged' }).eq('id', id).eq('status', 'open')

  // 환자에게 푸시 (fire-and-forget)
  void sendPushToUser(data.patient_id as string, {
    title: '단골약국에서 답이 왔어요',
    body: msg.length > 40 ? msg.slice(0, 40) + '…' : msg,
    url: '/settings',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
