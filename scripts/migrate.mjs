/**
 * Supabase 마이그레이션 실행 스크립트
 * 실행: node scripts/migrate.mjs
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

const url       = env['NEXT_PUBLIC_SUPABASE_URL']        // https://tjtugyoexwsqaquheega.supabase.co
const ref        = url.replace('https://', '').replace('.supabase.co', '')

// DB_PASSWORD 환경변수 또는 인자로 받기
const dbPassword = env['SUPABASE_DB_PASSWORD'] || process.argv[2]
if (!dbPassword) {
  console.error('❌ DB 비밀번호 필요: SUPABASE_DB_PASSWORD=xxx node scripts/migrate.mjs')
  console.error('   또는: node scripts/migrate.mjs [비밀번호]')
  console.error('\n   Supabase 대시보드 → Project Settings → Database → Database password')
  process.exit(1)
}

// Direct connection (IPv6) 또는 session pooler (IPv4)
const connectionString =
  `postgresql://postgres:${dbPassword}@db.${ref}.supabase.co:5432/postgres`

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

async function run() {
  console.log('Supabase 연결 중...')
  await client.connect()
  console.log('연결 성공\n')

  const migDir = resolve(process.cwd(), 'supabase/migrations')
  const files  = readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(resolve(migDir, file), 'utf-8')
    console.log(`▶ ${file} 실행 중...`)
    try {
      await client.query(sql)
      console.log(`  ✅ 완료\n`)
    } catch (e) {
      // 이미 존재하는 컬럼/테이블 에러는 무시
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
