// .env.local 파서 (E2E 스크립트 공용) — dotenv 의존 없이 KEY=VALUE만 읽는다.
import { readFileSync } from 'node:fs'

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
  return { URL_, ANON, SERVICE }
}
