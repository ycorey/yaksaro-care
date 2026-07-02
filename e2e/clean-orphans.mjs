// 실패한 셋업으로 남은 고아 테스트 유저(e2e-test+…@yaksaro-e2e.test) 일괄 삭제.
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let removed = 0
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) throw new Error(error.message)
  const users = data?.users ?? []
  if (users.length === 0) break
  for (const u of users) {
    if (u.email?.startsWith('e2e-test+') && u.email?.includes('@yaksaro-e2e.test')) {
      for (const t of ['medication_check_logs', 'medication_schedules', 'user_medications', 'user_prescriptions']) {
        await admin.from(t).delete().eq('user_id', u.id)
      }
      await admin.from('members').delete().eq('owner_id', u.id)
      await admin.auth.admin.deleteUser(u.id)
      removed++
      console.log('  removed', u.email)
    }
  }
  if (users.length < 200) break
}
console.log(`CLEAN_ORPHANS_OK removed=${removed}`)
