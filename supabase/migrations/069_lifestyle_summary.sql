-- 069: 생활관리 정보 요약 — 카드 기본은 요약, 펼치면 전문
--
-- 왜: lifestyle_content 본문이 평균 287자이고 질환당 3항목이라 한 질환에 900자,
-- 추정 질환이 3개면 2,700자가 한 번에 렌더된다(lifestyle-section 은 접기 없는 서버 컴포넌트).
--
-- 왜 생성 시점인가: 이 콘텐츠는 우리가 만든 것이라 원문 훼손 개념이 없다. 잘라낸 첫
-- 문장보다 목적을 갖고 쓴 2문장이 읽힌다. 전문은 남기고 한 번 더 눌러서 본다.
-- (식약처 원문인 약 정보는 반대로 표시 계층에서만 줄인다 — src/lib/drug-text.ts)
--
-- nullable 인 이유: 요약도 본문과 같은 안전 게이트(passesSafetyFrame)를 통과해야
-- 채택된다. 실패하면 null 로 두고 화면은 본문을 보여준다 — 요약이 게이트에 걸렸다고
-- 정보 자체가 사라지면 안 된다.

alter table public.lifestyle_content add column if not exists summary_ko text;
