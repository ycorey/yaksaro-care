import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveDrugIdByItemSeq } from '@/lib/drug-master'
import type { TablesUpdate } from '@/types/database'
import { dbError } from '@/lib/api-error'
import { requireHealthConsent } from '@/lib/require-consent'

// 본인 복약 항목 삭제(소프트 삭제) / 수정. RLS + user_id 필터로 본인 것만 처리.

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { error } = await supabase
    .from('user_medications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return dbError('medications', error)
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // §23 — 화면 게이트만으로는 **처리**가 막히지 않는다. 만들거나 바꾸는 경로는 여기서도 막는다.
  const consent = await requireHealthConsent(supabase, user.id)
  if (!consent.ok) return consent.response

  const body = await request.json() as {
    dose_amount?:   number | null
    doses_per_day?: number | null
    total_days?:    number | null
    ended_at?:      string | null   // 복용 종료(YYYY-MM-DD) / 다시 복용(null)
    custom_name?:   string
    drug_id?:       string | null
    supplement_id?: string | null
    // 허가정보 API 결과 선택 시 — 조회 키만 받는다.
    // 약품명·제조사·이미지는 서버가 허가정보에서 재취득한다(전역 마스터 오염 방지).
    item_seq?:      string | null
  }

  const patch: TablesUpdate<'user_medications'> = {}
  if ('dose_amount'   in body) patch.dose_amount   = body.dose_amount
  if ('doses_per_day' in body) patch.doses_per_day = body.doses_per_day
  if ('total_days'    in body) patch.total_days    = body.total_days
  // 복용 종료(ended_at 세팅) / 다시 복용(null) — 약지갑↔지난 약 이동
  if ('ended_at'      in body) patch.ended_at      = body.ended_at

  // 자동완성으로 실제 약품/건기식을 선택하면 ID로 연결하고 custom_name 비움.
  // (CHECK 제약: drug_id OR supplement_id OR custom_name 중 하나는 필수)
  if (body.drug_id) {
    patch.drug_id = body.drug_id; patch.supplement_id = null; patch.custom_name = null
  } else if (body.supplement_id) {
    patch.supplement_id = body.supplement_id; patch.drug_id = null; patch.custom_name = null
  } else if (body.item_seq) {
    // 허가정보 API 결과 선택 — 클라이언트가 보낸 약품명·제조사·이미지는 신뢰하지 않는다.
    // resolveDrugIdByItemSeq 가 허가정보에서 값을 재취득해 전역 마스터를 채운다.
    const resolved = await resolveDrugIdByItemSeq(supabase, body.item_seq)
    if (resolved) {
      patch.drug_id = resolved; patch.supplement_id = null; patch.custom_name = null
    }
  } else if (typeof body.custom_name === 'string' && body.custom_name.trim()) {
    patch.custom_name = body.custom_name.trim()
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경 내용 없음' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_medications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return dbError('medications', error)
  return NextResponse.json({ ok: true })
}
