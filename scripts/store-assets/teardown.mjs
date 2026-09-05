// 스토어 자산 시드 정리 — 운영 DB에서 촬영용 임시 계정과 흔적을 즉시 지운다.
// e2e/teardown.mjs 와 같은 절차이되 creds 경로만 이쪽(.auth/creds.json)을 본다.
import { readFileSync, rmSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../../e2e/_env.mjs'

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

try { rmSync(new URL('./.auth/', import.meta.url), { recursive: true, force: true }) } catch {}
console.log(`STORE_TEARDOWN_OK uid=${uid} (유저·시드·세션파일 삭제 완료)`)
