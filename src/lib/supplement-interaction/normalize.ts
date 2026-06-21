// [정규화 레이어] 한글 건기식 → 영문 성분/RxCUI, 약물명 → RxCUI(canonical)
// 건기식: ko 사전 우선. 약물: RxNorm findRxcuiByString.
// 출처: interaction-poc/04_pipeline_poc/lib/normalize.mjs 이식.
//
// TODO(승급): 건기식은 ko 사전(JSON) 대신 앱 supplements 테이블 + 사전을 병행하고,
//   약물은 한글 제품명→성분 경로(앱 drugs 테이블/DUR)를 추가할 것. 현재는 PoC 충실 이식.

import { logger } from '@/lib/logger'
import type { NormalizedSupplement, NormalizedDrug } from './types'
import dict from './ko-dictionary.json'

type DictEntry = {
  en: string
  ingredient_en: string
  rxcui: string
  rxcui_broad?: string
  rule?: string
  strain_level?: boolean
  aliases?: string[]
}

const DICT = dict as Record<string, DictEntry | { desc: string; rxcui_source: string; note: string }>
const RXNAV = 'https://rxnav.nlm.nih.gov/REST'
const TIMEOUT_MS = 5000

const norm = (s: string): string => String(s).trim().toLowerCase().replace(/\s+/g, ' ')

// 한글/별칭 건기식명 → 정규화 결과
export function normalizeSupplement(input: string): NormalizedSupplement {
  const q = norm(input)
  for (const [key, v] of Object.entries(DICT)) {
    if (key.startsWith('_')) continue
    const entry = v as DictEntry
    const keys = [key, ...(entry.aliases ?? [])].map(norm)
    if (keys.includes(q)) {
      return {
        input,
        matched: true,
        source: 'dictionary',
        en: entry.en,
        ingredient_en: entry.ingredient_en,
        rxcui: entry.rxcui,
        rxcui_broad: entry.rxcui_broad ?? null,
        rule: entry.rule ?? null,
        strain_level: !!entry.strain_level,
      }
    }
  }
  // 사전 미수록: 수동 사전 확장 대상
  return {
    input,
    matched: false,
    source: 'none',
    en: input,
    ingredient_en: null,
    rxcui: null,
    note: '사전 미수록 — ko-dictionary.json 확장 필요',
  }
}

// 약물명(영문 권장) → RxCUI + canonical name
export async function normalizeDrug(input: string): Promise<NormalizedDrug> {
  try {
    const u = `${RXNAV}/rxcui.json?name=${encodeURIComponent(input)}&search=2`
    const r = await fetch(u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const j = (await r.json()) as { idGroup?: { rxnormId?: string[] } }
    const rxcui = j?.idGroup?.rxnormId?.[0] ?? null
    let name = input
    if (rxcui) {
      const p = await fetch(`${RXNAV}/rxcui/${rxcui}/properties.json`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const pj = (await p.json()) as { properties?: { name?: string } }
      name = pj?.properties?.name ?? input
    }
    return { input, matched: !!rxcui, source: rxcui ? 'rxnorm' : 'none', en: input, rxcui, canonical: name }
  } catch (e) {
    logger.warn('supplement-interaction', `RxNorm 정규화 실패: "${input}"`, e)
    return { input, matched: false, source: 'error', en: input, rxcui: null, error: String((e as Error)?.message ?? e) }
  }
}
