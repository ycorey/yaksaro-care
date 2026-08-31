import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveDrugIdByItemSeq } from '@/lib/drug-master'
import { resolveDrugByName } from '@/lib/drug-name-resolve'
import { logDurShadow } from '@/lib/dur-shadow'
import { logSupplementInteractionShadow } from '@/lib/supplement-interaction/shadow'
import { logger } from '@/lib/logger'
import { getActiveMember } from '@/lib/active-member'
import { dbError } from '@/lib/api-error'
import { requireHealthConsent } from '@/lib/require-consent'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // §23 — 화면 게이트만으로는 **처리**가 막히지 않는다. 만들거나 바꾸는 경로는 여기서도 막는다.
  const consent = await requireHealthConsent(supabase, user.id)
  if (!consent.ok) return consent.response

  const { active } = await getActiveMember(supabase, user.id)

  const body = await request.json() as {
    medicines?: { name: string; edi_code?: string | null; ingredient?: string | null; dose_amount?: number | null; doses_per_day?: number | null; days?: number | null; meal_times?: string[]; drug_id?: string | null; item_seq?: string | null; unit?: string | null; schedule_type?: string | null; dow?: number[] | null }[]
    names?: string[]
    prescription_id:  string | null
    pharmacy_name?:   string | null
    pharmacy_address?: string | null
    pharmacy_phone?:   string | null
    pharmacy_lat?:     number | null
    pharmacy_lng?:     number | null
  }
  const { prescription_id, pharmacy_name, pharmacy_address, pharmacy_phone, pharmacy_lat, pharmacy_lng } = body

  // 신규: 용법 포함 medicines[] / 구버전: names[] 모두 지원
  const items = Array.isArray(body.medicines) && body.medicines.length > 0
    ? body.medicines
    : (body.names ?? []).map(name => ({ name, edi_code: null, ingredient: null, dose_amount: null, doses_per_day: null, days: null, meal_times: [] as string[], drug_id: null, item_seq: null, unit: null, schedule_type: null, dow: null }))

  if (items.length === 0) {
    return NextResponse.json({ error: '약품명 없음' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // drugs 매칭: EDI 보험코드 → edi_code 컬럼 ilike(콤마 다중코드 대응) → 이름 ilike 폴백
  const rows = await Promise.all(
    items.map(async (m) => {
      let drugRow: { id: string } | null = null

      // 0) 검수에서 검색-교체로 부착된 정식 식별자 최우선 (drug_id → item_seq)
      if (m.drug_id) {
        const { data } = await supabase.from('drugs').select('id')
          .eq('id', m.drug_id).eq('is_canceled', false).maybeSingle()
        drugRow = data
      }
      if (!drugRow && m.item_seq) {
        // 마스터 조회 → 없으면 허가정보에서 재취득해 생성 (addMedication과 동일 경로).
        // OCR이 넘긴 이름(m.name)은 마스터 값으로 쓰지 않는다 — 오인식 텍스트가
        // 전역 검색 결과에 정상 품목처럼 섞이는 것을 막는다.
        const resolved = await resolveDrugIdByItemSeq(supabase, m.item_seq)
        drugRow = resolved ? { id: resolved } : null
      }

      const ediCode = m.edi_code?.replace(/\D/g, '') || null
      if (!drugRow && ediCode) {
        // 콤마 경계 매칭 — 9자리 코드가 더 긴 코드의 부분문자열로 오매칭되는 것 방지
        // (ediCode는 숫자만 — 콤마 포함 like 패턴은 PostgREST 규칙대로 큰따옴표로 감싼다)
        const { data } = await supabase.from('drugs').select('id')
          .or(`edi_code.eq.${ediCode},edi_code.like."${ediCode},%",edi_code.like."%,${ediCode}",edi_code.like."%,${ediCode},%"`)
          .eq('is_canceled', false)
          .limit(1).maybeSingle()
        drugRow = data
      }
      if (!drugRow) {
        // 이름 폴백 — 규칙은 drug-name-match.ts(순수/단위테스트), 조회는 drug-name-resolve.ts.
        // 예전에는 `item_name` 정확일치 → `%이름%` 부분일치가 유일할 때만 채택이었는데,
        // 마스터 이름이 `콩코르정5밀리그램(비소프롤롤푸마르산염)` 처럼 함량+성분명을 달고 있어
        // OCR 이 남긴 `콩코르정` 은 접두일 뿐이라 후보가 여럿 → 전부 버려졌다(운영 53행).
        // 지금은 함량까지 맞아떨어질 때만 채택하고, 함량이 갈리면 여기서 고르지 않는다 —
        // 5mg 과 2.5mg 중 아무거나 붙이면 사용자의 약이 다른 용량으로 기록된다.
        // (검수 화면이 후보를 띄워 사용자가 고르고, 고른 결과는 위의 drug_id 경로로 들어온다.)
        const byName = await resolveDrugByName(supabase, m.name)
        if (byName.kind === 'unique') drugRow = { id: byName.match.id }
      }
      const data = drugRow

      // 복용 방식 — 매주인데 요일 비면 약이 어디에도 안 떠 daily 폴백(폼 가드와 동일 방어)
      let schedType = (m.schedule_type === 'prn' || m.schedule_type === 'weekly') ? m.schedule_type : 'daily'
      const validDow = (m.dow ?? []).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
      if (schedType === 'weekly' && validDow.length === 0) schedType = 'daily'

      return {
        user_id:         user.id,
        member_id:       active.id,
        drug_id:         data?.id ?? null,
        supplement_id:   null,
        custom_name:     data ? null : m.name,
        ingredient:      m.ingredient    ?? null,
        dose:            m.unit          ?? null,   // 단위(정/캡슐/포 등) — 검수에서 선택
        dose_amount:     m.dose_amount   ?? null,
        doses_per_day:   m.doses_per_day ?? null,
        total_days:      m.days          ?? null,
        meal_times:      m.meal_times    ?? [],
        schedule_type:   schedType,
        dow:             schedType === 'weekly' ? validDow : null,
        started_at:      today,
        source:          'ocr' as const,
        prescription_id: prescription_id ?? null,
      }
    })
  )

  const { error } = await supabase.from('user_medications').insert(rows)
  if (error) {
    logger.error('medications/bulk', 'insert 오류', error.message)
    return dbError('medications', error)
  }

  // DUR shadow: 저장된 실제 drug_id 기반 (fire-and-forget)
  const drugIds = rows.map(r => r.drug_id).filter((id): id is string => !!id)
  if (drugIds.length >= 2) {
    logDurShadow(user.id, active, drugIds, prescription_id ?? undefined)
  }

  // 건기식·약물 상호작용 shadow: 지갑 전체(약물×건기식) 기준 (fire-and-forget)
  logSupplementInteractionShadow(user.id, prescription_id ?? undefined)

  // 조제 약국 정보를 처방전에 반영
  if (prescription_id && pharmacy_name) {
    await supabase
      .from('user_prescriptions')
      .update({
        pharmacy_name,
        ...(pharmacy_address !== undefined && { pharmacy_address }),
        ...(pharmacy_phone   !== undefined && { pharmacy_phone   }),
        ...(pharmacy_lat     !== undefined && { pharmacy_lat     }),
        ...(pharmacy_lng     !== undefined && { pharmacy_lng     }),
      })
      .eq('id', prescription_id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ saved: rows.length })
}
