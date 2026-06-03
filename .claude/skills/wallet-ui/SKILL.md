---
name: wallet-ui
description: 약 지갑 메인 화면을 구현하는 스킬. "약 지갑 만들어줘", "의사에게 보여주기 화면", "복약 체크박스 UI", "/wallet 페이지", "실버 세대 UI", "큰 글씨 약 목록", "아침점심저녁 체크" 요청 시 반드시 이 스킬을 사용할 것. Tailwind CSS + Next.js App Router 기반으로 모바일 최적화된 약 지갑 화면을 만든다.
---

# 약 지갑 메인 화면 구현

## 목표

타 병원/응급실 접수처에서 **3초 안에** 화면을 제시할 수 있는 초간단 뷰.
실버 세대가 혼자서도 사용할 수 있는 시인성 우선 UI.

## 파일 구조

```
src/app/wallet/
├── layout.tsx          ← DashboardNav 포함 (dashboard/layout.tsx와 동일 패턴)
├── page.tsx            ← 서버 컴포넌트 (약 목록 조회)
└── meal-checks.tsx     ← 클라이언트 컴포넌트 (체크박스)
```

## Step 1: layout.tsx

`src/app/dashboard/layout.tsx`와 동일 패턴으로 작성. 인증 체크 + DashboardNav 포함.

## Step 2: page.tsx

```typescript
// 서버 컴포넌트
// user_medications JOIN drugs/supplements 조회
// active(ended_at IS NULL, deleted_at IS NULL)만
// 약 카드 목록 렌더링
```

**카드 UI 요구사항:**
- 약품명: `text-2xl font-bold` (최소 24px)
- 제조사/분류: `text-base text-gray-500`
- 용량/복용법: `text-lg text-gray-700`
- 카드 패딩: `px-5 py-4` 이상
- 카드 간격: `space-y-3`

**헤더:**
```html
<h1 class="text-2xl font-bold">💊 현재 복용 중인 약</h1>
<p class="text-base text-gray-500">총 N종 · 오늘 날짜</p>
```

**안내 문구 (하단):**
```html
<p class="text-sm text-center text-gray-400 leading-relaxed">
  이 화면을 의사 · 약사 · 응급실 접수처에 보여주세요
</p>
```

## Step 3: meal-checks.tsx (클라이언트 컴포넌트)

```typescript
'use client'
// localStorage 키: `meal_checks_${userId}_${YYYY-MM-DD}`
// 날짜 바뀌면 자동 초기화
// 체크박스 3개: 아침 / 점심 / 저녁
// 터치 타겟: min-h-[52px] min-w-[52px]
// 선택 시: bg-blue-500 text-white rounded-2xl
// 미선택: bg-gray-100 text-gray-600 rounded-2xl
```

체크박스 UI 패턴:
```html
<div class="grid grid-cols-3 gap-3">
  <button class="flex flex-col items-center justify-center min-h-[52px] rounded-2xl bg-blue-500 text-white">
    <span class="text-xl">🌅</span>
    <span class="text-sm font-medium mt-1">아침</span>
  </button>
  <!-- 점심, 저녁 동일 -->
</div>
```

## Step 4: DashboardNav 수정

`src/components/dashboard/nav.tsx`의 navItems 배열에 추가:
```typescript
{ href: '/wallet', label: '내 약 지갑', icon: '💊' },
```
모바일 하단 탭 순서: 복약 프로필 → **내 약 지갑** → 약 추가 → 처방전 촬영 → 내 정보

## 빈 상태 처리

약이 없을 때:
```html
<div class="text-center py-16">
  <div class="text-6xl mb-4">💊</div>
  <p class="text-xl font-medium text-gray-700 mb-2">복용 중인 약이 없어요</p>
  <p class="text-base text-gray-400 mb-8">처방전을 찍으면 자동으로 추가됩니다</p>
  <a href="/medications/ocr" class="...">📸 처방전 촬영하기</a>
</div>
```

## 검증 체크리스트

- [ ] 약품명 폰트 24px 이상
- [ ] 체크박스 터치 타겟 52px 이상
- [ ] 아침 체크 → 날짜 바뀌면 초기화
- [ ] 약 없을 때 빈 상태 표시
- [ ] 모바일 430px 폭에서 레이아웃 깨지지 않음
