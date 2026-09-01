// 테스트 시드용 가입 메타데이터.
//
// 왜 필요한가: §23 동의 게이트가 생기면서 `consent_health=false` 인 계정은
// `(main)`·`medications` 레이아웃에서 `/consent` 로 돌려보내진다(307).
// 대부분의 e2e 가 재현하려는 것은 **동의를 마친 보통 사용자**이므로 시드도 그 상태여야 한다.
// 안 그러면 모든 화면 테스트가 "동의 안 함" 하나 때문에 무더기로 빨개진다.
//
// 049(`handle_new_user`)가 `raw_user_meta_data->>'consent_health'` 를 읽어
// `profiles` 에 넣으므로, 생성 시점에 실어 보내면 추가 쿼리가 필요 없다.
//
// ⚠️ **약사 계정에는 쓰지 말 것.** 환자용 민감정보 동의를 약사 행에 찍으면 의미가 오염된다
//    (같은 이유로 이메일 로그인도 약사면 기록을 건너뛴다 — src/app/login/actions.ts).
//    그리고 동의 게이트 자체를 검증하는 테스트도 이걸 쓰면 안 된다(미동의로 시작해야 한다).
export const consentedPatientMeta = () => ({
  consent_health: true,
  consent_health_at: new Date().toISOString(),
})
