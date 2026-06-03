---
name: qr-pharmacy-mapping
description: QR 기반 단골 약국 매핑 로직을 구현하는 스킬. "QR 매핑", "단골 약국 연결", "/store/[store_id] 라우트", "약국 QR코드 진입", "regular_pharmacy_id 업데이트", "약국 CRM 연결" 요청 시 반드시 이 스킬을 사용할 것. 약국 QR코드 스캔 → 앱 진입 → 자동 약국 매핑 플로우 전체를 구현한다.
---

# QR 기반 단골 약국 매핑 구현

## 전체 플로우

```
약국 QR 스캔
    ↓
/store/[store_id] 접근
    ↓
store_id 쿠키 저장 (7일)
    ↓
로그인 여부 분기
 ├── 로그인됨 → profiles.regular_pharmacy_id 즉시 업데이트 → /wallet으로
 └── 미로그인 → /login (또는 /signup) → 완료 후 쿠키 읽어 매핑 처리
```

## Step 1: DB — pharmacies 테이블 확인

`pharmacies` 테이블에 `store_id` 컬럼이 없으면 추가:

```sql
-- supabase/migrations/003_pharmacy_store_id.sql
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS store_id TEXT UNIQUE;
-- store_id: 약국이 QR 생성 시 사용할 짧은 식별자 (예: "gangnam-001")

-- profiles에 regular_pharmacy_id 없으면 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS regular_pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE SET NULL;
```

## Step 2: `/store/[store_id]` 페이지

`src/app/store/[store_id]/page.tsx`:

```typescript
// 서버 컴포넌트
// 1. store_id로 pharmacies 테이블 조회 → 존재 여부 확인
// 2. 없으면 → notFound() 또는 / 리다이렉트
// 3. 있으면 → 쿠키 설정 (서버 set-cookie) + 로그인 여부에 따라 분기
```

쿠키 설정 후 분기:
- 로그인됨: `profiles.regular_pharmacy_id` 업데이트 → `/wallet?pharmacy_linked=1` 리다이렉트
- 미로그인: `/login?redirect=/store/${store_id}` 리다이렉트

## Step 3: 로그인/회원가입 완료 후 쿠키 처리

`src/app/auth/callback/route.ts`에 쿠키 읽기 로직 추가:

```typescript
// 인증 완료 후
const pendingPharmacyId = cookies().get('pending_pharmacy_store_id')?.value
if (pendingPharmacyId) {
  // pharmacies에서 store_id로 id 조회
  // profiles.regular_pharmacy_id 업데이트
  // 쿠키 삭제
  // /wallet?pharmacy_linked=1 로 리다이렉트
}
```

## Step 4: 연결 완료 토스트

`/wallet` 페이지에서 `?pharmacy_linked=1` 쿼리 파라미터 감지 시 토스트 표시:

```typescript
// page.tsx 서버 컴포넌트에서 searchParams 읽기
// pharmacy_linked=1이면 toast("OO약국과 연결되었습니다") 클라이언트 이벤트 트리거
```

## Step 5: 약국 QR 생성 (약사 모드용 — 향후 구현)

약국 대시보드에서 QR 생성 URL 패턴:
```
https://yaksaro-care.com/store/{pharmacies.store_id}
```
QR 생성은 추후 약사 모드 구현 시 추가. 현재는 URL만 설계.

## 보안 고려사항

- store_id는 예측 불가능한 값으로 설정 (UUID 또는 slug+랜덤)
- 쿠키는 `httpOnly: false` (클라이언트에서도 읽어야 하므로), `sameSite: lax`, `maxAge: 7일`
- 매핑 1회 완료 후 쿠키 즉시 삭제

## 검증 체크리스트

- [ ] 존재하지 않는 store_id → 404 또는 / 리다이렉트
- [ ] 미로그인 → 로그인 후 자동 매핑
- [ ] 이미 다른 약국에 연결된 경우 → 덮어쓰기 (사용자 동의 없이)
- [ ] 연결 완료 토스트 표시
