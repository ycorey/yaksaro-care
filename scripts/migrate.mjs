/**
 * Supabase 마이그레이션 실행 스크립트 (보조 수단).
 *
 * 이 저장소의 기본 절차는 **Supabase SQL Editor 에서 직접 실행**이다(CLAUDE.md).
 * 이 스크립트는 그 보조 수단이며, 다음 두 가지를 강제한다.
 *
 *  1) 비밀번호는 환경변수로만 받는다. 명령행 인자는 셸 히스토리와 프로세스 목록에
 *     평문으로 남는데, 이건 DB **슈퍼유저(postgres)** 자격증명이다.
 *  2) 적용할 파일을 인자로 **명시**해야 한다. 예전에는 migrations/ 전체를 정렬 순으로
 *     무조건 실행해서, 파괴적 DDL 이 섞이면 막을 지점이 없었다.
 *
 * 실행:
 *   SUPABASE_DB_PASSWORD=… node scripts/migrate.mjs 050_account_deletion_cascade.sql
 *   SUPABASE_DB_PASSWORD=… node scripts/migrate.mjs --all      # 전체(명시적 옵트인)
 *
 * TLS: 인증서를 검증한다. Supabase 직접 연결 CA 가 필요하면
 *   대시보드 → Database → SSL Configuration 에서 받아 SUPABASE_CA_CERT=경로 로 지정.
 */

import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import pg from 'pg'

const { Client } = pg

// .env.local 파싱
const envPath = resolve(process.cwd(), '.env.local')
const env = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key?.trim() && !key.startsWith('#')) env[key.trim()] = vals.join('=').trim()
})

const url = env['NEXT_PUBLIC_SUPABASE_URL']
if (!url) {
  console.error('❌ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 이 필요합니다.')
  process.exit(1)
}
const ref = url.replace('https://', '').replace('.supabase.co', '')

// ── 인자 파싱: .sql 파일명 또는 --all 만 허용 ───────────────────────────────
const argv = process.argv.slice(2)
const runAll = argv.includes('--all')
const named = argv.filter(a => a.endsWith('.sql'))
const unknown = argv.filter(a => a !== '--all' && !a.endsWith('.sql'))
if (unknown.length) {
  console.error(`❌ 알 수 없는 인자: ${unknown.join(' ')}`)
  console.error('   비밀번호는 인자로 받지 않습니다(셸 히스토리·프로세스 목록에 남습니다).')
  console.error('   SUPABASE_DB_PASSWORD 환경변수를 쓰고, 인자에는 적용할 .sql 파일만 지정하세요.')
  process.exit(1)
}
if (!runAll && named.length === 0) {
  console.error('❌ 적용할 마이그레이션을 지정하세요. 예: node scripts/migrate.mjs 050_x.sql')
  console.error('   전체를 적용하려면 --all 을 명시하세요(권장하지 않음).')
  process.exit(1)
}

// ── 자격증명: 환경변수 전용 ────────────────────────────────────────────────
const dbPassword = process.env.SUPABASE_DB_PASSWORD || env['SUPABASE_DB_PASSWORD']
if (!dbPassword) {
  console.error('❌ DB 비밀번호 필요: SUPABASE_DB_PASSWORD=… node scripts/migrate.mjs <파일.sql>')
  console.error('   Supabase 대시보드 → Project Settings → Database → Database password')
  process.exit(1)
}

const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${ref}.supabase.co:5432/postgres`

// TLS 검증 활성화 — 끄면 신뢰할 수 없는 네트워크에서 MITM 시
// 슈퍼유저 자격증명과 마이그레이션 트래픽 전체가 그대로 넘어간다.
const caPath = process.env.SUPABASE_CA_CERT || env['SUPABASE_CA_CERT']
const ssl = caPath
  ? { rejectUnauthorized: true, ca: readFileSync(resolve(caPath), 'utf-8') }
  : { rejectUnauthorized: true }

const client = new Client({ connectionString, ssl })

async function run() {
  console.log(`Supabase(${ref}) 연결 중… (TLS 검증 활성)`)
  try {
    await client.connect()
  } catch (e) {
    if (/self.signed|unable to verify|certificate/i.test(e.message)) {
      console.error(`❌ TLS 인증서 검증 실패: ${e.message}`)
      console.error('   대시보드 → Database → SSL Configuration 에서 CA 를 받아')
      console.error('   SUPABASE_CA_CERT=/path/to/prod-ca.crt 로 지정하세요.')
      console.error('   (검증을 끄지 마세요 — 슈퍼유저 자격증명이 오가는 연결입니다.)')
      process.exit(1)
    }
    throw e
  }
  console.log('연결 성공\n')

  const migDir = resolve(process.cwd(), 'supabase/migrations')
  const all = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
  const files = runAll ? all : named

  const missing = files.filter(f => !all.includes(f))
  if (missing.length) {
    console.error(`❌ 없는 마이그레이션: ${missing.join(', ')}`)
    await client.end()
    process.exit(1)
  }

  console.log(`적용 대상 ${files.length}건: ${files.join(', ')}\n`)

  for (const file of files) {
    const sql = readFileSync(resolve(migDir, file), 'utf-8')
    console.log(`▶ ${file} 실행 중...`)
    try {
      await client.query(sql)
      console.log(`  ✅ 완료\n`)
    } catch (e) {
      // 이미 존재하는 컬럼/테이블 에러는 무시(멱등 재실행)
      if (e.code === '42701' || e.code === '42P07') {
        console.log(`  ⚠️  이미 존재 (건너뜀)\n`)
      } else {
        console.error(`  ❌ 오류: ${e.message}\n`)
        throw e
      }
    }
  }

  await client.end()
  console.log('마이그레이션 완료!')
}

run().catch(e => {
  console.error('실패:', e.message)
  process.exit(1)
})
