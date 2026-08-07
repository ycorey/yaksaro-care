import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// 회원 탈퇴 — 약관 제8조·개인정보 처리방침의 "탈퇴 시 지체 없이 파기" 이행 경로.
//
// 삭제 대상은 **호출자 본인뿐**이다. user.id 는 세션에서 나오며 클라이언트 입력을 받지 않는다.
// auth.users 행을 지우면 050 의 FK CASCADE 가 프로필·복약·체크이력·복용일정·가족멤버·
// 처방·푸시구독·쿼터·약국요청·메모를 함께 파기한다.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 약사 계정은 셀프 탈퇴를 막는다 — CASCADE 로 약국 행까지 사라져 QR·단골 연결과
  // 그 약국에 쌓인 요청·메모가 함께 증발한다. B2B 계정 해지는 관리자 절차로 처리한다.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role === 'pharmacist') {
    return NextResponse.json(
      { error: '약국 계정은 앱에서 탈퇴할 수 없어요. 문의처로 연락해주세요.' },
      { status: 403 },
    )
  }

  // auth.users 삭제는 service_role 만 가능하다. 대상은 검증된 세션의 본인 id 로 고정한다.
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    logger.error('account', '탈퇴 처리 실패', error.message)
    return NextResponse.json({ error: '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  logger.info('account', '회원 탈퇴 완료')
  return NextResponse.json({ ok: true })
}
