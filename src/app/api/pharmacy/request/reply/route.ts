import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'
import { passesSafetyFrame } from '@/lib/lifestyle-info/safety-frame'
import { ownedPharmacyId } from '@/lib/pharmacy-auth'

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

  // 약국 계정인지 앱 계층에서 먼저 확인 — RLS 만 믿으면 환자가 자기 요청에 대해 통과한다.
  const pharmacyId = await ownedPharmacyId(supabase, user.id)
  if (!pharmacyId) return NextResponse.json({ error: '약국 계정이 아닙니다' }, { status: 403 })

  // 회신 기록 + status 승격(open→acknowledged)을 단일 update로 원자 처리
  // RLS(preq_pharmacist_update) + pharmacy_id 명시로 이중 방어. 038 트리거가 컬럼 무결성 보장.
  const { data, error } = await supabase
    .from('pharmacy_requests')
    .update({ reply_text: msg, replied_at: new Date().toISOString(), status: 'acknowledged' })
    .eq('id', id)
    .eq('pharmacy_id', pharmacyId)
    .in('status', ['open', 'acknowledged'])
    .select('patient_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: '전송에 실패했어요. 다시 시도해주세요' }, { status: 500 })
  if (!data) return NextResponse.json({ error: '이미 처리됐거나 답장할 수 없는 요청이에요' }, { status: 409 })

  // 환자에게 푸시 (fire-and-forget)
  // 회신 원문은 푸시 본문에 싣지 않는다 — 잠금화면은 기기를 든 사람 누구에게나 보인다.
  // (passesSafetyFrame 이 복약·진단 문구를 막지만, 노출 자체를 없애는 편이 확실하다)
  void sendPushToUser(data.patient_id as string, {
    title: '단골약국에서 답이 왔어요',
    body: '앱에서 내용을 확인해주세요',
    url: '/settings',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
