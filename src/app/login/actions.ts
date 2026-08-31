'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// 이메일+비밀번호 로그인 — 심사자용 입구.
//
// 왜 필요한가: 환자 로그인이 구글·카카오뿐이라 **스토어 심사자가 앱에 들어올 수단이 없다.**
// 구글은 해외 심사자 계정이 2FA 에 걸리고 카카오는 사실상 못 쓴다 — 흔한 리젝 사유다.
// Play Console 의 App access 에 여기 쓸 계정을 적는다.
//
// 왜 Server Action 인가: `<form action={...}>` 은 **하이드레이션 전에도 동작한다.**
// 클라이언트 `onSubmit` + `preventDefault()` 방식은 JS 가 붙기 전 제출되면 브라우저가
// 같은 주소로 GET 을 보내 **비밀번호가 쿼리스트링에 실린다**(주소창·서버 로그·리퍼러에 남는다).
// 이 저장소가 로그인에서 클라이언트 폼을 걷어낸 이유가 그것이다(CLAUDE.md).
//
// 덤으로 §23 동의를 여기서 **서버가 기록한다.** 로그인 화면의 [필수] 체크는 지금까지
// 버튼을 여는 클라이언트 상태였을 뿐 아무 데도 남지 않았다(실측: 환자 7명 중 6명이
// `consent_health=false`). 처리방침 제4조가 "별도의 동의를 받습니다" 라고 선언한 것과
// 기록이 어긋나 있었다.

export type EmailLoginState = { error: string | null }

/** 동의를 profiles 에 남긴다. 실패해도 로그인은 막지 않는다 — 이미 인증된 사용자를
 *  기록 실패로 되돌려보내면 들어올 방법이 사라진다. 대신 로그를 남겨 추적한다.
 *  (`consent_health`·`consent_health_at` 는 046 에서 authenticated 에 UPDATE 가 부여돼 있다.) */
export async function recordHealthConsent(userId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ consent_health: true, consent_health_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('consent_health', false)   // 최초 동의 시각을 나중 로그인이 덮어쓰지 않게
  if (error) logger.warn('auth', '민감정보 동의 기록 실패', error.message)
}

export async function signInWithEmail(
  _prev: EmailLoginState,
  formData: FormData,
): Promise<EmailLoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const consented = formData.get('consent') === 'on'

  if (!email || !password) return { error: '이메일과 비밀번호를 입력해 주세요.' }
  if (!consented) return { error: '먼저 [필수] 민감정보 수집·이용 동의에 체크해 주세요.' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  // 어느 쪽이 틀렸는지 알려주지 않는다 — 계정 존재 여부가 새면 그 자체가 정보다.
  if (error || !data.user) return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }

  await recordHealthConsent(data.user.id)

  // 약사 계정이 이 입구로 들어오면 약국 대시보드로 보낸다.
  // 판독이 실패하면 '약사가 아님' 이 아니라 '모름' 이므로 환자 홈으로 보낸다 —
  // `/pharmacy` 는 자체 가드가 있어 잘못 보내도 막히지만, 그 반대는 막을 것이 없다.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', data.user.id).maybeSingle()

  redirect(profile?.role === 'pharmacist' ? '/pharmacy' : '/home')
}
