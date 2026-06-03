// 첫 페이지 원본 응답 구조 출력 (필드명 확인용)
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key && !key.startsWith('#')) env[key.trim()] = vals.join('=').trim()
})

const KEY  = encodeURIComponent(env['MFDS_EASY_DRUG_KEY'])
const HKEY = encodeURIComponent(env['MFDS_HEALTH_FOOD_KEY'])
const BASE = 'https://apis.data.go.kr'

async function inspect(label, url) {
  console.log(`\n━━ ${label} ━━`)
  const res = await fetch(url)
  const text = await res.text()
  const json = JSON.parse(text)

  // 최상위 키
  console.log('최상위 키:', Object.keys(json))

  // body 구조
  const body = json.body ?? json.response?.body
  console.log('body 키:', body ? Object.keys(body) : '없음')

  // items 구조
  const items = body?.items
  if (items === null || items === undefined) {
    console.log('items: null/undefined')
  } else if (Array.isArray(items)) {
    console.log(`items: Array(${items.length})`)
    if (items.length > 0) console.log('첫 아이템 키:', Object.keys(items[0]))
  } else if (typeof items === 'object') {
    console.log('items 키:', Object.keys(items))
    const inner = items.item
    if (Array.isArray(inner)) {
      console.log(`items.item: Array(${inner.length})`)
      if (inner.length > 0) console.log('첫 아이템 키:', Object.keys(inner[0]))
    } else if (inner) {
      console.log('items.item (단건):', Object.keys(inner))
    }
  } else {
    console.log('items 타입:', typeof items, items)
  }

  // Array 첫 원소가 {item:{}} 래퍼인 경우 내부 필드 출력
  if (Array.isArray(items) && items.length > 0 && items[0].item) {
    const inner = items[0].item
    console.log('items[0].item 키:', Object.keys(inner))
    console.log('items[0].item 샘플:', JSON.stringify(inner).slice(0, 300))
  } else if (Array.isArray(items) && items.length > 0) {
    console.log('items[0] 샘플:', JSON.stringify(items[0]).slice(0, 300))
  }
}

await inspect(
  'e약은요',
  `${BASE}/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList?serviceKey=${KEY}&numOfRows=3&pageNo=1&type=json`
)

await inspect(
  '건강기능식품',
  `${BASE}/1471000/HtfsInfoService03/getHtfsList01?serviceKey=${HKEY}&numOfRows=3&pageNo=1&type=json`
)
