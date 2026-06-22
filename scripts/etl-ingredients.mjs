/**
 * 약사로 케어 — 성분 구조화 ETL (drugs.ingredient_name → drug_ingredients)
 *
 * 기존 drugs.ingredient_name(허가정보 ITEM_INGR_NAME: 영문·슬래시·중복)을
 * 성분 단위로 분해·중복제거하여 drug_ingredients 에 적재한다.
 * name_ko 는 표준 한글 매핑(CURATED)으로 enrich(부분) — 매칭 안 되면 영문 유지.
 * 한글 전수 + 함량(분량/단위)은 식약처 상세/주성분 API 등록 후 별도 채움(완전판).
 *
 * 실행:
 *   node scripts/etl-ingredients.mjs           실제 적재
 *   node scripts/etl-ingredients.mjs --dry     DB 쓰기 없이 샘플만 출력(검증)
 *
 * 사전조건: 026_drug_ingredients.sql 적용.
 * (외부 API 없음 — 기존 DB 컬럼만 사용해 빠르고 안정적)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const DRY  = process.argv.includes('--dry')

// ── 성분 파싱: 슬래시 분해 + 공백정규화 + 대소문자 무시 중복제거(순서보존) ──
function parseIngredients(itemIngrName) {
  if (!itemIngrName) return []
  const seen = new Set(); const out = []
  for (const tok of String(itemIngrName).split('/')) {
    const name = tok.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key); out.push(name)
  }
  return out
}

// 영문 성분명 정규화 키 (매핑 조회용): 소문자 + 끝의 로마숫자/구분기호 제거
function enKey(s) {
  return String(s).toLowerCase().trim()
    .replace(/\s+(i{1,3}|iv|v)$/i, '')   // "cellulase ii" → "cellulase"
    .replace(/[.·]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── 표준 한글 성분명 사전(고빈도 OTC/소화효소 — 안정적 표준 표기) ──
const CURATED = {
  'acetaminophen':'아세트아미노펜','paracetamol':'아세트아미노펜','ibuprofen':'이부프로펜',
  'dexibuprofen':'덱시부프로펜','aspirin':'아스피린','naproxen':'나프록센','loxoprofen':'록소프로펜',
  'acetylsalicylic acid':'아세틸살리실산',
  'pancreatin':'판크레아틴','simethicone':'시메티콘','ursodeoxycholic acid':'우르소데옥시콜산',
  'bromelain':'브로멜라인','lipase':'리파제','diastase':'디아스타제','pepsin':'펩신','papain':'파파인',
  'cellulase':'셀룰라제','pancrelipase':'판크레리파제','biodiastase':'비오디아스타제','protease':'프로테아제',
  'famotidine':'파모티딘','ranitidine':'라니티딘','cimetidine':'시메티딘','omeprazole':'오메프라졸',
  'esomeprazole':'에스오메프라졸','lansoprazole':'란소프라졸','pantoprazole':'판토프라졸',
  'rabeprazole':'라베프라졸','mosapride':'모사프리드','domperidone':'돔페리돈','itopride':'이토프리드',
  'cetirizine':'세티리진','levocetirizine':'레보세티리진','loratadine':'로라타딘',
  'fexofenadine':'펙소페나딘','chlorpheniramine':'클로르페니라민','chlorphenamine':'클로르페니라민',
  'pseudoephedrine':'슈도에페드린','dextromethorphan':'덱스트로메토르판','guaifenesin':'구아이페네신',
  'ambroxol':'암브록솔','bromhexine':'브롬헥신','acetylcysteine':'아세틸시스테인',
  'loperamide':'로페라미드','bisacodyl':'비사코딜','metformin':'메트포르민','amlodipine':'암로디핀',
  'atorvastatin':'아토르바스타틴','rosuvastatin':'로수바스타틴','telmisartan':'텔미사르탄',
  'losartan':'로사르탄','cetirizine hydrochloride':'세티리진염산염',
}

function lookupKo(nameEn) {
  const ko = CURATED[enKey(nameEn)]
  return { ko: ko ?? null, code: null }
}

async function main() {
  console.log('━━ 성분 구조화 ETL (drug_ingredients) ━━', DRY ? '[DRY-RUN]' : '')

  // drugs 전체 페이지네이션 (ingredient_name 있는 것만 처리)
  const BATCH = 500
  let offset = 0, scanned = 0, withIngr = 0, totalRows = 0, koHits = 0
  for (;;) {
    const { data, error } = await supabase
      .from('drugs').select('id, item_name, ingredient_name')
      .order('id', { ascending: true }).range(offset, offset + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    scanned += data.length

    const batchRows = []
    const batchDrugIds = []
    for (const d of data) {
      const parsed = parseIngredients(d.ingredient_name)
      if (parsed.length === 0) continue
      withIngr++; batchDrugIds.push(d.id)
      parsed.forEach((nameEn, idx) => {
        const { ko, code } = lookupKo(nameEn)
        if (ko) koHits++
        batchRows.push({
          drug_id: d.id, position: idx, name_en: nameEn,
          name_ko: ko, ingredient_code: code, updated_at: new Date().toISOString(),
        })
      })
    }

    if (DRY) {
      if (offset === 0) {
        console.log('\n  [DRY 샘플 — 첫 배치 상위 3개 약품]')
        let shown = 0
        for (const d of data) {
          const parsed = parseIngredients(d.ingredient_name)
          if (parsed.length === 0) continue
          console.log(`   · ${d.item_name}: ` + parsed.map(n => {
            const { ko } = lookupKo(n); return ko ? `${n}→${ko}` : `${n}(?)`
          }).join(', '))
          if (++shown >= 3) break
        }
      }
    } else if (batchRows.length) {
      // 정확 동기화: 해당 약품들 기존 성분 행 삭제 후 재삽입
      for (let k = 0; k < batchDrugIds.length; k += 200) {
        const ids = batchDrugIds.slice(k, k + 200)
        const { error: delErr } = await supabase.from('drug_ingredients').delete().in('drug_id', ids)
        if (delErr) throw new Error(`delete: ${delErr.message}`)
      }
      for (let k = 0; k < batchRows.length; k += 500) {
        const { error: insErr } = await supabase.from('drug_ingredients').insert(batchRows.slice(k, k + 500))
        if (insErr) throw new Error(`insert: ${insErr.message}`)
      }
    }
    totalRows += batchRows.length

    process.stdout.write(`\r  진행 ${scanned.toLocaleString()} scanned | ${withIngr.toLocaleString()} 약품 | ${totalRows.toLocaleString()} 성분행 | 한글 ${koHits.toLocaleString()}      `)
    if (data.length < BATCH) break
    offset += BATCH
    if (DRY && offset >= BATCH * 2) break   // dry는 2배치만
  }

  console.log(`\n━━ 완료${DRY ? '(DRY)' : ''}: 약품 ${withIngr.toLocaleString()} / 성분행 ${totalRows.toLocaleString()} / 한글매칭 ${koHits.toLocaleString()} ━━`)
}

main().catch(e => { console.error('\n❌ ETL 오류:', e.message); process.exit(1) })
