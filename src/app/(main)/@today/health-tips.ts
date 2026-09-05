// 오늘의 건강 한 줄 — 공공기관 원문을 **그대로 발췌**하고 문장마다 출처를 붙인다.
// 날짜 기준으로 매일 한 개씩 순환 노출된다.
//
// 왜 발췌인가(2026-09-05): 지어낸 문장은 "누가 그랬는데?" 에 답이 없다. 출처가 붙으면 문장이
// 방패를 얻고, 생활 관리 정보가 PubMed 근거를 붙이는 것과 같은 구조가 된다.
//
// 규칙 — health-tips.test.ts 와 docs/health-tips-sources.md 가 지킨다:
//  1. 출처는 **공공누리 제1유형(출처표시)** 으로 개방된 기사만. 2·4유형(상업적 이용 금지)은 못 쓴다 —
//     B2B 유료화가 예정돼 있다. 유형은 기사마다 다르므로 **기사 단위로** 확인한다(같은 식약처 자료라도
//     카드뉴스는 4유형이었다).
//  2. 문장은 원문 그대로. 다듬으면 발췌가 아니라 창작이 되고 출처 표기도 거짓이 된다. 허용하는 손질은
//     문두 접속부사('또한·특히·아울러·먼저·가령·이에 앞서') 제거와 특수문자 정규화(&middot; → ·)뿐이다.
//     눈높이에 안 맞는 문장은 다듬지 말고 **빼고 다른 문장을 고른다**.
//  3. 원문이라도 효과 단정형·약과의 비교·용량 지시·음성 판정 문구는 고르지 않는다(테스트가 거른다).
//  4. 출처 표기는 공공누리 안내대로 기관명·저작물명·링크를 문장 옆에 둔다.

export interface TipSource {
  /** 저작권 표시 기관 — 식약처 보도자료 기반 기사는 식약처, 정책기자단 기사는 정책브리핑 */
  org: string
  title: string
  url: string
  /** 기사 게시일 (YYYY-MM-DD) */
  published: string
  license: '공공누리 제1유형'
}

export interface HealthTip {
  emoji: string
  text: string
  source: TipSource
}

const KOGL1 = '공공누리 제1유형' as const

// 출처 — 확인일·유형은 docs/health-tips-sources.md 에 기사별로 기록돼 있다.
const SRC = {
  dosing: {
    org: '식품의약품안전처', title: '약은 꼭 식후 30분에 먹어야 하나요?',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148831169', published: '2017-04-04', license: KOGL1,
  },
  disposal: {
    org: '대한민국 정책브리핑', title: '유통기한 지난 폐의약품, 이렇게 버려요',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148943012', published: '2025-05-16', license: KOGL1,
  },
  drugDay: {
    org: '대한민국 정책브리핑', title: '약의 날(11.18.), 올바른 폐의약품 수거 방법 알아봐요!',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148936375', published: '2024-11-18', license: KOGL1,
  },
  leftover: {
    org: '대한민국 정책브리핑', title: '집안 구석구석 방치된 처방약들 어떻게 처리할까?',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148780601', published: '2014-07-14', license: KOGL1,
  },
  holiday: {
    org: '식품의약품안전처', title: '안전하고 건강한 설 명절…올바른 식품 구매·보관·섭취 요령은',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148898598', published: '2022-01-28', license: KOGL1,
  },
  walking: {
    org: '보건복지부', title: '코로나 우울 떨치고 건강도 챙기고…‘슬기로운 걷기 운동’',
    url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148879378', published: '2020-11-06', license: KOGL1,
  },
} satisfies Record<string, TipSource>

type SrcKey = keyof typeof SRC
const tip = (emoji: string, text: string, source: SrcKey): HealthTip => ({ emoji, text, source: SRC[source] })

export const HEALTH_TIPS: HealthTip[] = [
  // ── 복용 방법 (식약처 2017) ──
  tip('💧', '콜라, 주스, 커피 등과 함께 약을 복용하는 경우 이들 음료가 위의 산도에 영향을 주거나 음료 중에 들어있는 카페인등의 성분이 약의 흡수에 영향을 줄 수 있으므로 약은 물과 함께 복용하는 것이 가장 바람직하다.', 'dosing'),
  tip('🕐', '약은 효과는 높이고 부작용은 최소화할 수 있도록 규칙적으로 복용해야 하며 식후·식전·취침전 복용하는 약으로 나뉜다.', 'dosing'),
  tip('🍽️', '식사를 거르더라도 위장장애를 유발하는 의약품이 아닌 경우 정해진 시간에 따라 복용하는 것이 바람직하다.', 'dosing'),
  tip('🍚', '식사 후 복용하는 약은 음식물이 있을 경우 약 효과가 높아지거나 섭취한 음식이 위점막을 보호해 속쓰림 등 부작용을 감소할 수 있는 약이다.', 'dosing'),
  tip('⏰', '식사 전 복용하는 약은 음식물로 인해 약 흡수가 방해되거나 약의 작용기전에 따라 식사 전에 복용해야 약효가 잘 나타나는 약이다.', 'dosing'),
  tip('🛏️', '재채기, 코막힘, 가려움, 눈 따가움 등 알레르기성 비염치료에 사용되는 항히스타민제는 복용 후 졸음이 발생해 운전, 기계 등 조작 시 사고를 유발할 수 있으므로 취침 전 복용하는 것이 바람직하다.', 'dosing'),
  // ── 보관 ──
  tip('🧊', '냉장 보관이 권장되는 의약품이 아닌 이상 실온 보관이 권장된다.', 'disposal'),
  tip('🧴', '연고 약품은 개봉 후 뚜껑을 잘 닫아 밀봉해 두어야 안전하게 사용할 수 있다.', 'disposal'),
  tip('📝', '약의 증상과 유통기한을 표시해서 꼼꼼하게 챙겨놓는 것도 폐의약품을 줄이는 하나의 대안이 될 수 있다.', 'leftover'),
  // ── 폐기 ──
  tip('♻️', '폐의약품은 밀봉해서 약국이나 보건소, 보건 진료소에 제출하는 것이 원칙이다.', 'disposal'),
  tip('📍', '폐의약품 수거함은 구청, 보건소(지소, 분소), 약국, 행정복지센터 등에 설치되어 있다.', 'drugDay'),
  tip('💊', '종합감기약, 진통제 등 알약은 비닐 포장지를 제거하고, 내용물만 모아서 밀봉해야 한다.', 'disposal'),
  tip('🧪', '물약은 한 용기에 모아서 용기 그대로 버린다.', 'disposal'),
  tip('📦', '가루약은 약 포장지를 뜯지 않고 그대로 밀봉 배출한다.', 'disposal'),
  tip('💨', '기타 연고나 흡입제, 스프레이 등 특수한 형태의 약들은 따로 분리하지 말고, 포장재째로 배출하면 된다.', 'disposal'),
  tip('🫙', '물약, 시럽, 연고의 경우 내용물이 흘러나오지 않도록 마개를 닫고 배출해야 한다.', 'drugDay'),
  tip('🌊', '폐의약품을 제대로 처리하지 않고 땅에 매립하거나 하수구에 함부로 버리면 약품의 항생물질로 인해 환경오염이 발생하고, 생태계 교란을 일으킨다.', 'drugDay'),
  // ── 건강기능식품 (식약처 2022) ──
  tip('🥗', '건강기능식품은 안전성과 기능성이 확보되는 일일섭취량이 정해져 있으므로 제품에 표시된 섭취량, 섭취방법, 섭취 시 주의사항을 확인하고 섭취해야 한다.', 'holiday'),
  tip('🦠', '프로바이오틱스 제품도 항생제와 섭취하면 효과가 떨어질 수 있다.', 'holiday'),
  tip('🌿', '홍삼의 진세노사이드 성분은 혈소판 응고를 감소시키며 혈당 저하 효과를 강화할 수 있으므로 당뇨 치료제와 혈액 항응고제 복용 시에는 의사 등 전문가와 상의해야 한다.', 'holiday'),
  tip('🧂', '국·찌개 등 국물 음식은 조리 마지막에 간을 하거나 식사할 때 소금·양념장을 활용하면 덜 짜게 먹을 수 있다.', 'holiday'),
  // ── 걷기 (보건복지부 2020) ──
  tip('🚶', '성인에게 필요한 걷기량은 1주일에 최소 빠르게 걷기 150분을 권장하는데, 이때의 활동은 중강도 수준으로 걸으면서 대화는 가능하나 노래는 어려운 상태다.', 'walking'),
  tip('🏃', '걷기 전에는 충분한 준비운동을 하고 걸은 후에는 정리운동을, 그리고 걷기 시작할 때는 5분 정도 천천히 걷다가 속도를 높이고 걷기를 끝낼 때는 서서히 속도를 늦추는 것이 좋다.', 'walking'),
  tip('🛒', '마트에서 장을 볼 때도 30분 이내의 거리는 가능한 걸어서 이동하며, 점심시간 동안 주 1~2회 주변의 산책로를 걷거나 가까운 산에 오르는 것도 좋다.', 'walking'),
  tip('🚌', '버스나 지하철을 이용하는 직장인은 출퇴근 시 한두 정거장 미리 내려서 걷고, 에스컬레이터 보다는 계단을 이용하면 충분하다.', 'walking'),
  tip('🧍', '바른 자세로 걸으면 심호흡이 가능하고 어깨와 목의 긴장을 풀어주며 허리나 골반의 통증을 방지할 수 있는 점을 꼭 기억하고 올바른 자세를 유지해야 한다.', 'walking'),
]

/** 해당 날짜의 '오늘의 건강 한 줄'을 반환 (하루 동안 고정, 매일 순환). */
export function getDailyTip(date: Date = new Date()): HealthTip {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / 86_400_000)
  return HEALTH_TIPS[dayOfYear % HEALTH_TIPS.length]
}
