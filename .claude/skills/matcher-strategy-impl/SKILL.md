---
name: matcher-strategy-impl
description: 건기식·약물 상호작용 "매칭 게이트" 매처를 공통 인터페이스 계약에 맞춰 구현하는 스킬. rule 어댑터 유지, rxclass(무료 RxClass API)·claude(LLM 판정)·hybrid 매처 승급. "매처 구현", "rxclass 매처", "claude 관련성 판정", "hybrid 매처", "DRUG_HINTS 자동화", "매칭 게이트 승급", "relevance 매처 교체" 작업 시 반드시 이 스킬을 사용할 것. matcher-engineer 에이전트가 사용한다. (interaction-poc/04_pipeline_poc는 import만, 무수정.)
---

# 매처 전략 구현 (Matcher Strategy)

## 목표

매칭 게이트(질의약물에 해당하는 상호작용 페어만 선별)를 **교체 가능한 전략**으로 구현한다.
하네스는 매처를 주입받아 채점만 한다 — 매처를 갈아끼워도 채점 코드는 그대로다.

위치: `interaction-poc/eval-harness/matchers/<id>.mjs`. 계약: 같은 폴더 `interface.md`.

## 공통 계약 (반드시)

```js
export async function match(supplementPairs, drugQuery, opts) {
  return { matched, dropped, scored, meta };
}
export const id = "<matcher-id>";
```

- `Pair`에는 스냅샷이 부여한 **`pair_id`**가 있다. **절대 변형/삭제 금지** — 채점이 이걸로 정렬한다.
- `matched`/`dropped`는 원본 페어 필드를 전부 보존. 점수 같은 매처 산물은 `scored[]`로만.
- 분할 완전성: `matched ∪ dropped` = 입력(dedup 후). dedup 수는 `meta.deduped`.
- 비동기 통일·결정성(LLM은 temperature 0 + 캐시).

## 왜 이렇게 (이유를 알면 엣지에서도 맞게 판단한다)

MedData는 페어매칭을 안 한다 — 건기식의 상호작용 *전체 목록*을 주고 약물 쪽은 `item_1_rxcui=null` +
자유텍스트 클래스 라벨("Oral contraceptives (birth control pills)")이다. 그래서 질의약물 문자열이 응답에
없을 수 있다(클래스로만 존재). 매처의 임무 = **이 클래스 라벨을 질의약물과 의미적으로 잇는 것**.

## 무파괴 규칙

`interaction-poc/04_pipeline_poc/`는 **import만** 한다. rule 매처는 그 안 `filterPairsForDrug()`의
어댑터일 뿐 로직을 안 바꾼다. 검증: `git diff interaction-poc/04_pipeline_poc/` 가 비어야 한다.

## 매처별 설계

| 매처 | 방법 | 장점 | 한계 |
|---|---|---|---|
| **rule**(완성) | DRUG_HINTS 키워드 + 부분일치 | 단순·결정적 | 손맞춤·미등록약물 0점 |
| **rxclass** | drug→RxNorm rxcui→RxClass 클래스 자동확장→라벨 매칭 | DRUG_HINTS 제거 | 한글약물 미해결 |
| **claude** | 페어별(배치) LLM JSON 판정(relevant/score/reason) | 표현다양성·한글·대조문 함정 흡수 | 비용·비결정(캐시 완화) |
| **hybrid** | rxclass 1차→경계만 claude 승급 | 정확도≈claude, 콜 급감 | 경계규칙 휴리스틱 |

상세 호출 URL·프롬프트 스키마는 각 `<id>.mjs` 상단 설계 주석 참조.

## 미구현 처리

실호출 미구현 매처는 **조용히 0점(전체 dropped 등)을 내지 않고** 명확히 `throw` 한다.
runner가 exit 2로 중단 → 가짜 점수로 오판하지 않게. (무자본 단계: claude 호출부는 TODO 유지 가능.)

## 구현 후

1. eval-qa에게 인터페이스 준수 검증 요청(pair_id 보존·shape·결정성).
2. eval-scorer에게 재측정 요청 → 이전 매처와 `--compare`로 회귀/개선 확인.
3. 정답셋 표현에서 구조적으로 막히면 golden-curator에 피드백.

## 체크리스트

- [ ] `match()`·`id` export, id 파일명과 일치.
- [ ] pair_id 보존, 원본 필드 비파괴, 분할 완전성, dedup 수 meta 보고.
- [ ] 결정성(2회 동일). LLM이면 temperature 0 + 캐시.
- [ ] `04_pipeline_poc` git diff 0.
- [ ] 미구현이면 명확히 throw(조용한 0점 금지).
