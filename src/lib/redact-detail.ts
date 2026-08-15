// Sentry 로 나가는 진단값에서 **행의 실제 값**을 걷어낸다.
//
// 왜 로깅부가 아니라 여기인가:
// `dbError`(api-error.ts)는 Postgres 오류의 code·message·details·hint 를 서버 로그에 남긴다.
// 그건 우리 경계 안이고 재현에 필요해서 8/8 에 **의도적으로** 넓힌 것이다. 되돌릴 이유가 없다.
// 문제는 그 detail 이 logger 브리지를 타고 그대로 Sentry(제3자)까지 간다는 점이다.
// 그러므로 자를 곳은 기록하는 쪽이 아니라 **국경**이다.
//
// Postgres 는 제약 위반 시 details 에 행의 값을 그대로 적는다:
//   23505 → `Key (endpoint)=(https://fcm.googleapis.com/fcm/send/…) already exists.`
//   23514 → `Failing row contains (…, 김상우, 와파린, …).`
// 처리방침에는 Sentry 를 "이용자 식별정보를 포함하지 않는" 수탁사로 적었다.
// 이미 켜져 있어 한 번 나간 것은 회수할 수 없으므로, 나가는 쪽을 막는다.
//
// 외부 의존성이 없다 — 이 모듈은 단위 테스트로 스스로 검증돼야 한다.
// (개인정보가 새는 것을 막는 장치가 정작 검증 불가능하면, 막고 있는지 알 수 없다.)

// 값이 실리는 필드만 지운다. 무엇을 남길지가 아니라 무엇을 버릴지를 적는 이유는,
// detail 로 들어오는 객체 모양이 호출부 24곳마다 다르기 때문이다 —
// 화이트리스트로 좁히면 진단이 통째로 비어 버린다.
//
// `hint` 는 **일부러 남긴다.** Postgres 는 제약 위반 시 hint 를 비워 두고,
// PostgREST 는 여기에 스키마 힌트를 담는다("Perhaps you meant 'profiles'…").
// 8/11 의 4일짜리 약사 대시보드 장애(PGRST200)를 진단해 준 것이 정확히 이 문자열이다.
// 스키마 이름은 이용자 식별정보가 아니고, 이걸 버리면 같은 유형을 다시 못 잡는다.
const VALUE_BEARING_KEYS = new Set(['details'])

// 진단에 쓸 만큼만 남긴다. 객체 전문을 그대로 실으면 무엇이 들어올지 통제할 수 없다.
const MAX_CHARS = 300

export function redactDetail(detail: unknown): string {
  if (typeof detail === 'string') return clip(detail)

  let text: string | undefined
  try {
    text = JSON.stringify(detail, (key, value) =>
      VALUE_BEARING_KEYS.has(key) && value != null ? '[값 제거됨]' : value,
    )
  } catch {
    // 순환 참조 등 — 직렬화에 실패해도 원문을 흘리지 않는다.
    return '[직렬화 불가]'
  }

  // JSON.stringify 는 undefined·함수·심볼에 undefined 를 돌려준다.
  return text === undefined ? `[${typeof detail}]` : clip(text)
}

function clip(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '…' : text
}
