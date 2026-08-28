import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// DUR 단일 약 플래그(066 dur_single_flags) 조회 + 효능군중복 판정.
//
// 저장된 것은 "이 약이 노인주의로 등재됐다 / 이 효능군에 속한다"는 사실뿐이다.
// "중복"은 조회 시점의 사실 — 같은 효능군 약이 현재 등록에 2개 이상인지는
// 여기(resolveDuplicates)가 계산하고, DB 에는 판정을 저장하지 않는다.

// 식약처 PROHBT_CONTENT 원문을 환자 화면에 실을 수 있는 사실 서술로 정제한다.
//
// 원문은 **처방자에게 쓴 글**이다 — 운영 DB 의 비폴백 원문 전량(58행/3종, 2026-08-27 실측)이
// "…나타나기 쉬움으로 소량부터 신중투여" 처럼 투여 지시로 끝난다. 실버 사용자 화면에서
// 그 종결 명령형은 "적게 드세요"라는 용량 조절 지시로 읽히고, 대상 약이 벤조·항정신병약·
// 삼환계 항우울제라 자의 감량이 실제로 위험하다. 웰니스(비의료기기) 판정의 기둥인
// "용량 조절 제시 0"과도 충돌한다 → 사실(부작용 경향)만 남기고 지시절은 잘라낸다.
//
// 정제하지 못하는 문장은 **표시를 포기한다**(배지만 남는다) — ETL 이 계속 도는 한
// 더 강한 지시문이 유입될 수 있고, 어중간하게 싣는 것보다 안 싣는 편이 안전하다.
const INSTRUCTION_TAIL     = /[,\s]*(소량(으로|부터)?\s*)?신중\s*투여\s*\.?$/
const FACT_ENDING          = /(나타나기\s*)?쉬(우므로|움으로|우니|움에)\s*$/
const RESIDUAL_INSTRUCTION = /(투여|복용하지|중단|금기|처방|할\s*것|마십시오|마시오)/

export function sanitizeElderlyNote(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  // "성분: 클로르페니라민" — ETL 폴백. 등재 '내용'이 아니라 성분명이라 화면에 쓸모가 없다
  // (그대로 실으면 "노인주의 등재 내용 성분: 클로르페니라민" 같은 문장이 된다).
  if (/^성분\s*[:：]/.test(t)) return null

  const body = t
    .replace(INSTRUCTION_TAIL, '')
    .replace(/[,\s]*$/, '')
    .replace(FACT_ENDING, '나타나기 쉬운 것으로')
  if (!body || RESIDUAL_INSTRUCTION.test(body)) return null
  return `${body} 등재되어 있어요.`
}

export type DurFlagEntry = {
  elderly:     boolean
  elderlyNote: string | null   // 식약처 PROHBT_CONTENT 원문 (판단이 아니라 등재 사유)
  groups:      string[]        // 소속 효능군명 목록 (EFFECT_NAME)
}

export async function getDurFlagsByItemSeq(
  supabase: SupabaseClient<Database>,
  itemSeqs: string[],
): Promise<Map<string, DurFlagEntry>> {
  const map = new Map<string, DurFlagEntry>()
  const seqs = [...new Set(itemSeqs.filter(Boolean))]
  if (seqs.length === 0) return map

  const { data, error } = await supabase
    .from('dur_single_flags')
    .select('item_seq, flag_type, group_code, description')
    .in('item_seq', seqs)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const entry = map.get(row.item_seq) ?? { elderly: false, elderlyNote: null, groups: [] }
    if (row.flag_type === 'elderly_caution') {
      entry.elderly = true
      entry.elderlyNote = entry.elderlyNote ?? row.description
    } else if (row.flag_type === 'efficacy_duplicate_group' && row.group_code) {
      if (!entry.groups.includes(row.group_code)) entry.groups.push(row.group_code)
    }
    map.set(row.item_seq, entry)
  }
  return map
}

// 등록약 목록에서 효능군중복을 판정한다 (순수 함수 — 단위 테스트 대상).
// 반환: item_seq → 겹친 효능군명 (중복 아니면 null).
// 같은 약을 두 번 등록한 경우(동일 item_seq)는 중복으로 치지 않는다 — distinct 기준.
export function resolveDuplicates(
  flags: Map<string, { groups: string[] }>,
  activeItemSeqs: string[],
): Map<string, string | null> {
  const result = new Map<string, string | null>()
  const distinct = [...new Set(activeItemSeqs.filter(Boolean))]

  // 군별로 서로 다른 약이 몇 개 속해 있는지 센다
  const groupCount = new Map<string, number>()
  for (const seq of distinct) {
    for (const g of flags.get(seq)?.groups ?? []) {
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1)
    }
  }

  for (const seq of distinct) {
    const dup = (flags.get(seq)?.groups ?? []).find(g => (groupCount.get(g) ?? 0) >= 2) ?? null
    result.set(seq, dup)
  }
  return result
}
