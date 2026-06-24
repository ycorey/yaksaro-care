/**
 * HIRA 시도·시군구 코드표 생성 — getParmacyBasisList 전국 스윕으로 (sidoCd,sidoCdNm)·
 * (sgguCd,sgguCdNm)을 수집해 src/lib/hira-regions.ts 를 만든다.
 * 지역(행정구역) 검색용: 약국검색 라우트가 "강서구" 같은 행정구역명을 sgguCd로 변환.
 *
 * 키: .env.local 의 HIRA_PHARMACY_KEY (data.go.kr 심평원 약국정보서비스).
 * 실행: node scripts/gen-hira-regions.mjs   (재갱신 시 재실행)
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const KEY = env['HIRA_PHARMACY_KEY']
const BASE = 'https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList'

const sidos = new Map()  // code -> name
const sggus = new Map()  // code -> { name, sidoCode }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function page(pageNo, numOfRows) {
  const url = new URL(BASE)
  url.searchParams.set('serviceKey', KEY)
  url.searchParams.set('pageNo', String(pageNo))
  url.searchParams.set('numOfRows', String(numOfRows))
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) })
  const text = await res.text()
  const total = Number((text.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0)
  for (const m of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1]
    const sidoCd = (b.match(/<sidoCd>([^<]*)<\/sidoCd>/) || [])[1]
    const sidoNm = (b.match(/<sidoCdNm>([^<]*)<\/sidoCdNm>/) || [])[1]
    const sgguCd = (b.match(/<sgguCd>([^<]*)<\/sgguCd>/) || [])[1]
    const sgguNm = (b.match(/<sgguCdNm>([^<]*)<\/sgguCdNm>/) || [])[1]
    if (sidoCd && sidoNm) sidos.set(sidoCd, sidoNm)
    if (sgguCd && sgguNm) sggus.set(sgguCd, { name: sgguNm, sidoCode: sidoCd })
  }
  return total
}

const NUM = 1000
const total = await page(1, NUM)
const pages = Math.ceil(total / NUM)
console.log(`총 ${total}건, ${pages}페이지 스윕`)
for (let p = 2; p <= pages; p++) {
  await sleep(120)
  await page(p, NUM)
  if (p % 5 === 0) console.log(`  ${p}/${pages} … 시도 ${sidos.size} 시군구 ${sggus.size}`)
}

const sidoArr = [...sidos.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
const sgguArr = [...sggus.entries()].map(([code, v]) => ({ code, name: v.name, sido: v.sidoCode })).sort((a, b) => a.code.localeCompare(b.code))

const out = `// 자동 생성: scripts/gen-hira-regions.mjs — HIRA 약국정보서비스 시도·시군구 코드표.
// 지역(행정구역) 약국 검색용. 갱신: node scripts/gen-hira-regions.mjs
export type HiraSido = { code: string; name: string }
export type HiraSggu = { code: string; name: string; sido: string }

export const HIRA_SIDOS: HiraSido[] = ${JSON.stringify(sidoArr, null, 2)}

export const HIRA_SGGUS: HiraSggu[] = ${JSON.stringify(sgguArr, null, 2)}
`
const dest = resolve(process.cwd(), 'src/lib/hira-regions.ts')
writeFileSync(dest, out, 'utf-8')
console.log(`완료: 시도 ${sidoArr.length} · 시군구 ${sgguArr.length} → ${dest}`)
