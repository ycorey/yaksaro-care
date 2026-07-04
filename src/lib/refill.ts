// [리필·재방문 알림] 곧 떨어지는 처방약 감지. 읽기 전용·서버 헬퍼(약지갑/홈 공용).
// 대상: 28일 이상 처방약(만성 재처방 후보) 중 만료가 오늘~오늘+리드(5일) 이내. 멤버 스코핑.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const REFILL_LEAD_DAYS = 5     // 며칠 전부터 알릴지
const MIN_DURATION_DAYS = 28   // 만성 재처방으로 볼 최소 총투약일수

export type RefillItem = {
  id: string
  label: string        // 병원명 또는 '처방약'
  dDay: number         // 만료까지 남은 일(0~5)
  expiryLabel: string  // "7월 1일"
  expiryDate: string   // "2026-07-01" (ISO, 캘린더 점용)
  medNames: string[]
}

type Presc = { id?: string; prescribed_at?: string | null; duration_days?: number | null; hospital_name?: string | null }

export type RefillMedRow = {
  total_days?: number | null
  custom_name?: string | null
  drug?: { item_name?: string | null } | null
  prescription?: Presc | null
}

// 이미 조회된 처방약 행 → 리필 대상(순수 함수, 추가 쿼리 없음).
// 약지갑·홈이 메인 meds 쿼리 결과를 재사용한다. 처방 없는 약(영양제·일반약)은 자동 제외.
export function computeRefillSoon(meds: RefillMedRow[]): RefillItem[] {
  // 처방전별 그룹
  const groups = new Map<string, { presc: Presc; totalDays: number[]; medNames: string[] }>()
  for (const m of meds) {
    const p = m.prescription ?? null
    if (!p?.id || !p.prescribed_at) continue
    const g = groups.get(p.id) ?? { presc: p, totalDays: [], medNames: [] }
    g.totalDays.push(m.total_days ?? 0)
    const name = m.drug?.item_name ?? m.custom_name
    if (name) g.medNames.push(name)
    groups.set(p.id, g)
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const items: RefillItem[] = []
  for (const { presc, totalDays, medNames } of groups.values()) {
    const maxDays = Math.max(0, ...totalDays) || (presc.duration_days ?? 0)
    if (maxDays < MIN_DURATION_DAYS) continue
    const exp = new Date(presc.prescribed_at + 'T00:00:00')
    exp.setDate(exp.getDate() + maxDays)
    const dDay = Math.ceil((exp.getTime() - today.getTime()) / 86_400_000)
    if (dDay < 0 || dDay > REFILL_LEAD_DAYS) continue
    const y = exp.getFullYear()
    const mm = String(exp.getMonth() + 1).padStart(2, '0')
    const dd = String(exp.getDate()).padStart(2, '0')
    items.push({
      id: presc.id!,
      label: presc.hospital_name ?? '처방약',
      dDay,
      expiryLabel: `${exp.getMonth() + 1}월 ${exp.getDate()}일`,
      expiryDate: `${y}-${mm}-${dd}`,
      medNames,
    })
  }
  return items.sort((a, b) => a.dDay - b.dDay)
}

// DB 래퍼 — 단독 조회가 필요한 호출처용. 화면(약지갑/홈)은 메인 meds를 재사용해 computeRefillSoon 직접 호출.
export async function getRefillSoon(
  supabase: SupabaseClient<Database>,
  userId: string,
  memberId: string,
): Promise<RefillItem[]> {
  const { data: meds } = await supabase
    .from('user_medications')
    .select('total_days, custom_name, drug:drugs(item_name), prescription:user_prescriptions(id, prescribed_at, duration_days, hospital_name)')
    .eq('user_id', userId)
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .is('ended_at', null)
    .not('prescription_id', 'is', null)

  return computeRefillSoon((meds ?? []) as RefillMedRow[])
}
