// E2E 정리: 시드 데이터 삭제 + 테스트 유저 삭제 (운영 DB 흔적 즉시 제거).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let creds
try {
  creds = JSON.parse(readFileSync(new URL('./.auth/creds.json', import.meta.url), 'utf8'))
} catch {
  console.log('creds.json 없음 — 정리할 유저 정보가 없습니다')
  process.exit(0)
}
const uid = creds.userId

// user_id FK 테이블 먼저 정리(캐스케이드 미설정 대비), members는 owner_id
for (const t of ['medication_check_logs', 'medication_schedules', 'user_medications', 'user_prescriptions']) {
  const { error } = await admin.from(t).delete().eq('user_id', uid)
  if (error) console.log(`  warn ${t}: ${error.message}`)
}
{
  const { error } = await admin.from('members').delete().eq('owner_id', uid)
  if (error) console.log(`  warn members: ${error.message}`)
}
const { error: uErr } = await admin.auth.admin.deleteUser(uid)
if (uErr) { console.log('deleteUser 실패: ' + uErr.message); process.exit(1) }

console.log(`TEARDOWN_OK uid=${uid} (유저·시드 삭제 완료)`)
