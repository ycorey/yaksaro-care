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

function parseEnvFile() {
  const env = {}
  let raw
  try {
    raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  } catch {
    return env   // CI 에는 .env.local 이 없다 — 그쪽은 process.env 로 받는다.
  }
  // CRLF·BOM 내성. Windows 에서 .env.local 을 편집기·스크립트가 한 번만 다시 써도 파일 전체가
  // CRLF 로 바뀌는데, 예전 파서는 `\n` 으로만 쪼개 각 줄 끝에 `\r` 이 남았다. JS 정규식의 `.` 은
  // **`\r` 을 매치하지 않으므로**(줄종결자 취급) `(.*)$` 가 어긋나 **모든 키가 통째로 유실**됐다.
  // 값이 아니라 키가 0개가 되므로 증상은 "키가 필요합니다" 한 줄 — 실제로는 e2e 16종 전부 침묵.
  // (2026-08-11 실측: 키 23개가 파일에 다 있는데 파싱된 줄 0개.)
  for (const line of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

export function loadEnv() {
  const env = parseEnvFile()
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL_ || !ANON || !SERVICE) throw new Error('.env.local에 SUPABASE URL/ANON/SERVICE_ROLE 키가 필요합니다')
  guardTarget(URL_)
  return { URL_, ANON, SERVICE }
}

// 읽기 전용 검사용 — **공개 키(anon)만** 돌려주고 service_role 은 아예 제공하지 않는다.
//
// 위의 guardTarget 은 시드·삭제를 하는 하네스가 운영 DB 를 치는 것을 CI 에서 막는다.
// 그런데 스키마 정합성 검사(임베드 ↔ FK)는 **정확히 운영 스키마를 대상으로 돌아야** 의미가 있다
// — 8/11 장애는 운영에서만 존재하던 FK 변경이 원인이었고, 테스트 DB 를 봤다면 못 잡았다.
// 그래서 이 경로는 막지 않되, **쓰기 능력 자체를 주지 않는 것**으로 안전을 보장한다.
// anon 키 + RLS 로는 시드도 삭제도 불가능하므로 "운영을 친다" 는 위험이 성립하지 않는다.
// CI 에서는 process.env(시크릿), 로컬에서는 .env.local 을 쓴다.
export function loadPublicEnv() {
  const env = parseEnvFile()
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!URL_ || !ANON) {
    throw new Error('SUPABASE URL/ANON 이 필요합니다 (.env.local 또는 환경변수)')
  }
  const ref = URL_.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '(unknown)'
  console.log(`[schema] 대상 Supabase 프로젝트: ${ref} (읽기 전용·anon)`)
  return { URL_, ANON }
}
