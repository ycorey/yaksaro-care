#!/usr/bin/env bash
# .env.local의 배포용 환경변수를 Vercel(production+preview)에 등록한다.
# 선행 조건(한 번만):
#   npm i -g vercel      # Vercel CLI 설치
#   vercel login         # 브라우저 인증
#   vercel link          # 이 폴더를 Vercel 프로젝트에 연결
# 실행:
#   bash scripts/vercel-env-setup.sh
#
# 주의:
#  - NEXT_PUBLIC_ 변수는 빌드 시 코드에 인라인되므로, 등록 후 반드시 재배포해야 반영됨.
#  - CRON_SECRET을 넣으면 Vercel Cron 호출에 자동으로 Authorization 헤더가 붙어 라우트가 인증됨.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

[ -f .env.local ] || { echo "❌ .env.local 없음"; exit 1; }
command -v vercel >/dev/null || { echo "❌ vercel CLI 없음 → npm i -g vercel"; exit 1; }
[ -d .vercel ] || { echo "❌ 프로젝트 미연결 → vercel link 먼저"; exit 1; }

VARS=(NEXT_PUBLIC_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT CRON_SECRET)

getval() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -E 's/^["'"'"']//; s/["'"'"']$//'; }

for v in "${VARS[@]}"; do
  val="$(getval "$v")"
  if [ -z "$val" ]; then echo "⚠️  SKIP $v (.env.local에 값 없음)"; continue; fi
  for target in production preview; do
    # 이미 있으면 지우고(멱등), 다시 추가
    vercel env rm "$v" "$target" -y >/dev/null 2>&1
    if printf '%s' "$val" | vercel env add "$v" "$target" >/dev/null 2>&1; then
      echo "✅ $v → $target"
    else
      echo "❌ $v → $target (실패 — 수동 확인)"
    fi
  done
done

echo ""
echo "완료. 반영하려면 재배포하세요:  vercel --prod"
