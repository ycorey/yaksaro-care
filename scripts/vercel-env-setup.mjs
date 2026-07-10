// .env.local의 배포용 환경변수를 Vercel(preview+production)에 멱등 upsert 한다.
// Vercel REST API 사용 — CLI의 preview 브랜치 비대화식 제약을 우회하고, 파괴적 rm 없이 안전.
//
// 선행(한 번만): vercel login && vercel link  (→ .vercel/repo.json 또는 project.json 생성)
// 실행: node scripts/vercel-env-setup.mjs
// 주의: NEXT_PUBLIC_* 는 빌드 시 인라인되므로 값이 바뀌었다면 재배포(vercel --prod) 필요.
//       CRON_SECRET 설정 시 Vercel Cron 호출에 Authorization 헤더가 자동으로 붙어 라우트 인증됨.
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const VARS = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET']

function fail(msg) { console.error('❌ ' + msg); process.exit(1) }

// 1) 토큰: VERCEL_TOKEN 우선, 없으면 vercel CLI auth.json
function getToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN
  const candidates = [
    join(homedir(), 'AppData/Roaming/xdg.data/com.vercel.cli/auth.json'),
    join(homedir(), 'AppData/Roaming/com.vercel.cli/auth.json'),
    join(homedir(), '.local/share/com.vercel.cli/auth.json'),
    join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
  ]
  for (const p of candidates) if (existsSync(p)) {
    const t = JSON.parse(readFileSync(p, 'utf8')).token
    if (t) return t
  }
  fail('Vercel 토큰을 찾을 수 없음 → `vercel login` 또는 VERCEL_TOKEN 설정')
}

// 2) 프로젝트/팀: .vercel/repo.json(신형) 또는 project.json(구형)
function getProject() {
  const repo = join(ROOT, '.vercel/repo.json')
  const proj = join(ROOT, '.vercel/project.json')
  if (existsSync(repo)) {
    const p = JSON.parse(readFileSync(repo, 'utf8')).projects?.[0]
    if (p?.id) return { projectId: p.id, teamId: p.orgId }
  }
  if (existsSync(proj)) {
    const d = JSON.parse(readFileSync(proj, 'utf8'))
    if (d.projectId) return { projectId: d.projectId, teamId: d.orgId }
  }
  fail('프로젝트 링크를 찾을 수 없음 → `vercel link` 먼저')
}

// 3) .env.local 파싱
function loadEnv() {
  const out = {}
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const token = getToken()
const { projectId, teamId } = getProject()
const env = loadEnv()
const url = `https://api.vercel.com/v10/projects/${projectId}/env?upsert=true` + (teamId ? `&teamId=${teamId}` : '')

let failed = 0
for (const key of VARS) {
  const value = env[key]
  if (!value) { console.log(`⚠️  SKIP ${key} (.env.local에 없음)`); continue }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, type: 'encrypted', target: ['preview', 'production'] }),
  })
  if (res.ok) console.log(`✅ ${key} → preview+production`)
  else { failed++; const j = await res.json().catch(() => ({})); console.log(`❌ ${key} → ${res.status} ${j?.error?.message || ''}`) }
}
console.log(failed ? `\n${failed}건 실패` : '\n완료. 값이 바뀌었다면 재배포: vercel --prod')
process.exit(failed ? 1 : 0)
