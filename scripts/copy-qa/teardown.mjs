// 문구 QA 시드 정리 — 환자·약사·약국·요청·기록을 운영 DB에서 즉시 지운다.
import { readFileSync, rmSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../../e2e/_env.mjs'

const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let c
try { c = JSON.parse(readFileSync(new URL('./.auth/creds.json', import.meta.url), 'utf8')) }
catch { console.log('creds.json 없음 — 정리할 것이 없습니다'); process.exit(0) }

const warn = (t, e) => { if (e) console.log(`  warn ${t}: ${e.message}`) }
warn('pharmacy_requests', (await admin.from('pharmacy_requests').delete().eq('patient_id', c.uid)).error)
for (const t of ['medication_check_logs', 'medication_schedules', 'user_medications', 'user_prescriptions']) {
  warn(t, (await admin.from(t).delete().eq('user_id', c.uid)).error)
}
warn('members', (await admin.from('members').delete().eq('owner_id', c.uid)).error)
warn('profile unlink', (await admin.from('profiles').update({ regular_pharmacy_id: null }).eq('id', c.uid)).error)
warn('pharmacies', (await admin.from('pharmacies').delete().eq('id', c.pharmacyId)).error)
for (const u of [c.uid, c.pharmacistUid]) {
  const { error } = await admin.auth.admin.deleteUser(u)
  if (error) console.log('deleteUser 실패 ' + u + ': ' + error.message)
}
try { rmSync(new URL('./.auth/', import.meta.url), { recursive: true, force: true }) } catch {}
console.log('COPYQA_TEARDOWN_OK')
