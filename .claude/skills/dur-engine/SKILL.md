---
name: dur-engine
description: DUR 상호작용 엔진을 Shadow Feature로 모듈화하는 스킬. "DUR 엔진 모듈화", "shadow logging 구현", "DUR 백엔드 격리", "OCR에 DUR 연결", "feature flag 적용", "DUR 로그 쌓기" 요청 시 반드시 이 스킬을 사용할 것. src/lib/dur.ts를 건드리지 않고 shadow testing 레이어를 추가한다.
---

# DUR 엔진 Shadow Feature 모듈화

## 목표

`src/lib/dur.ts`는 이미 동작한다. 이 스킬은 그 위에 shadow logging 레이어를 추가하여
OCR 결과가 들어올 때마다 DUR 체크를 백그라운드로 실행하고 로그를 축적한다.
환자 화면에는 직접 노출하지 않는다.

## Step 1: Shadow Log 테이블

`supabase/migrations/002_dur_shadow_logs.sql` 생성:

```sql
CREATE TABLE IF NOT EXISTS dur_shadow_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ocr_session_id   UUID,                  -- prescriptions.id 또는 user_prescriptions.id
  drug_ids         UUID[] NOT NULL,
  matched_count    INTEGER NOT NULL DEFAULT 0,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  severity_summary JSONB,                 -- {"contraindicated":N,"warning":N,"monitor":N}
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role만 INSERT, 본인만 SELECT
ALTER TABLE dur_shadow_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dur_shadow_logs_select" ON dur_shadow_logs
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT는 service_role만 (API Route에서 admin client 사용)
```

## Step 2: shadow logging 함수

`src/lib/dur-shadow.ts` 생성:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { checkInteractions } from '@/lib/dur'

export async function logDurShadow(
  userId: string,
  drugIds: string[],
  ocrSessionId?: string
): Promise<void> {
  // 사용자 응답을 차단하지 않도록 반드시 비동기로만 실행
  // 호출부에서 await 없이 호출해야 한다 (fire-and-forget)
  try {
    const admin = createAdminClient()
    const interactions = await checkInteractions(admin, drugIds)

    const severitySummary = interactions.reduce((acc, i) => {
      acc[i.severity] = (acc[i.severity] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    await admin.from('dur_shadow_logs').insert({
      user_id:           userId,
      ocr_session_id:    ocrSessionId ?? null,
      drug_ids:          drugIds,
      matched_count:     drugIds.length,
      interaction_count: interactions.length,
      severity_summary:  severitySummary,
    })
  } catch (e) {
    // shadow log 실패는 무시 — 사용자 기능을 막지 않는다
    console.warn('[DUR shadow] log failed:', e)
  }
}
```

## Step 3: OCR 라우트 연결

`/api/ocr/route.ts`의 약품 매칭 완료 후, drug_id가 있는 항목들에 대해 fire-and-forget으로 연결:

```typescript
// OCR 완료 후 (사용자 응답 반환 직전)
const matchedDrugIds = items
  .map(i => i.matched_drug?.id)
  .filter(Boolean) as string[]

if (matchedDrugIds.length >= 2) {
  // await 없이 호출 — 응답을 차단하지 않는다
  logDurShadow(user.id, matchedDrugIds, rx?.id)
}
```

## Step 4: Feature Flag

`/interactions` 페이지의 레이아웃 또는 nav 항목을 feature flag로 감싼다:

```typescript
// src/components/dashboard/nav.tsx 수정
// NEXT_PUBLIC_SHOW_INTERACTIONS=true 일 때만 nav에 표시
const navItems = [
  { href: '/dashboard', label: '복약 프로필', icon: '💊' },
  { href: '/medications/add', label: '약 추가', icon: '➕' },
  { href: '/medications/ocr', label: '처방전 촬영', icon: '📸' },
  ...(process.env.NEXT_PUBLIC_SHOW_INTERACTIONS === 'true'
    ? [{ href: '/interactions', label: '상호작용', icon: '⚠️' }]
    : []),
  { href: '/wallet', label: '내 약 지갑', icon: '💊' },
  { href: '/profile', label: '내 정보', icon: '👤' },
]
```

`.env.local`에 `NEXT_PUBLIC_SHOW_INTERACTIONS=false` 추가.

## 검증 방법

1. OCR 업로드 후 Supabase Dashboard → `dur_shadow_logs` 테이블에 행 생성 확인
2. `/interactions` 페이지가 flag=false 시 nav에서 사라지는지 확인
3. shadow log 실패해도 OCR 정상 완료되는지 확인
