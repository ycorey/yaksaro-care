import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/types/database'

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json() as {
    dose_amount?:   number | null
    doses_per_day?: number | null
    total_days?:    number | null
    ended_at?:      string | null   // 복용 종료(YYYY-MM-DD) / 다시 복용(null)
    custom_name?:   string
    drug_id?:       string | null
    supplement_id?: string | null
    // 허가정보 API 결과 선택 시 — 검색에서 받아온 정보를 직접 전달 (외부 API 재호출 없이 upsert)
    item_seq?:      string | null
    drug_name?:     string | null
    drug_entp?:     string | null
    drug_img?:      string | null
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
  } else if (body.item_seq && body.drug_name) {
    // 허가정보 API 결과 선택 — 검색에서 받아온 정보로 직접 upsert (외부 API 재호출 금지)
    // item_seq로 먼저 기존 약 조회, 없으면 upsert로 생성
    const { data: existing } = await supabase
      .from('drugs').select('id').eq('item_seq', body.item_seq).maybeSingle()
    if (existing?.id) {
      patch.drug_id = existing.id; patch.supplement_id = null; patch.custom_name = null
    } else {
      const admin = createAdminClient()
      const { data: newDrug } = await admin
        .from('drugs')
        .upsert(
          {
            item_seq:  body.item_seq,
            item_name: body.drug_name,
            entp_name: body.drug_entp ?? null,
            image_url: body.drug_img  ?? null,  // 검색 결과의 이미지를 즉시 반영
          },
          { onConflict: 'item_seq' }
        )
        .select('id')
        .single()
      if (newDrug?.id) {
        patch.drug_id = newDrug.id; patch.supplement_id = null; patch.custom_name = null
      }
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
