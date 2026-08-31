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

## Step 4: 환자 대면 노출 금지

`/interactions` 페이지와 `/api/interactions/check` 는 **2026-08-31 에 삭제됐다.** 되살리지 않는다.

그 화면은 `병용금기`·`안전` 배지와 "검출되지 않았습니다"(음성 판정)를 면책 없이 표시했고,
네비게이션 링크만 없었을 뿐 **로그인 사용자가 URL 로 직접 열 수 있었다.**
`NEXT_PUBLIC_SHOW_INTERACTIONS` 로 감싸는 방식은 채택했다가 폐기했다 —
**그 플래그를 읽는 코드가 `src/` 에 한 줄도 없었다.** 읽지 않는 플래그는 가드가 아니다.

DUR 판정 결과를 사용자에게 보여야 한다면 **약 지갑의 "정보 있음 + 약사 상담" 형태만** 쓴다
(`src/lib/dur-flags.ts` 관례). 지켜야 할 것 셋:

- **음성 판정을 생산하지 않는다** — "없습니다/안전합니다/검출되지 않았습니다" 금지. 무표시이거나 "정보 있음".
- **등재 원문을 그대로 싣지 않는다** — 식약처 원문은 처방자용 텍스트다. 용량·일수 등 숫자가 든 문장은 차단한다.
- **약사 상담으로 종결한다.**

회귀 가드는 `e2e/store-readiness-qa.mjs` 가 HTTP 404 와 음성 판정 어휘 0건을 함께 단언한다.

## 검증 방법

1. OCR 업로드 후 Supabase Dashboard → `dur_shadow_logs` 테이블에 행 생성 확인
2. `/interactions` 페이지가 flag=false 시 nav에서 사라지는지 확인
3. shadow log 실패해도 OCR 정상 완료되는지 확인
