// .env.local 파서 (E2E 스크립트 공용) — dotenv 의존 없이 KEY=VALUE만 읽는다.
import { readFileSync } from 'node:fs'

// 이 하네스는 실 DB 에 임시 유저·약국·처방을 만들고 지운다. 어느 DB 를 치는지 모르고
// 돌리는 상황이 가장 위험하므로, 대상 프로젝트를 항상 표시하고 CI 에서는 fail-closed 로 막는다.
// 운영 ref 는 저장소(public)에 적지 않고 PROD_SUPABASE_REF 환경변수/시크릿으로 주입받는다.
function guardTarget(url) {
  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '(unknown)'
  const allowProd = process.env.E2E_ALLOW_PROD === 'yes-i-know'

  if (process.env.CI && !allowProd) {
    const prodRef = process.env.PROD_SUPABASE_REF
    if (!prodRef) {
      throw new Error(
        'CI: PROD_SUPABASE_REF 가 없어 운영 DB 여부를 판별할 수 없습니다. ' +
        '시크릿을 설정하거나 E2E_ALLOW_PROD=yes-i-know 를 명시하세요.',
      )
    }
    if (ref === prodRef) {
      throw new Error(`CI: 운영 DB(${ref}) 대상 e2e 를 차단했습니다. 테스트 프로젝트를 사용하세요.`)
    }
  }

  // 로컬은 막지 않되(개발자가 의도적으로 운영을 치는 흐름이 있다) 대상은 반드시 보이게 한다.
  console.log(`[e2e] 대상 Supabase 프로젝트: ${ref}`)
  return ref
}

export function loadEnv() {
  const env = {}
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !ANON || !SERVICE) throw new Error('.env.local에 SUPABASE URL/ANON/SERVICE_ROLE 키가 필요합니다')
  guardTarget(URL_)
  return { URL_, ANON, SERVICE }
}
