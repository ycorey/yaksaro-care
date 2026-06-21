# 매처 공통 계약 (Matcher Strategy Contract)

모든 매처(rule / rxclass / claude / hybrid)는 **같은 시그니처**를 구현한다. 하네스는 매처를
"주입"받아 채점만 한다 — 매처를 갈아끼워도 채점 코드는 그대로다.

## 시그니처

```js
/**
 * @param {Pair[]} supplementPairs  MedData가 한 건기식에 대해 반환한 상호작용 페어 전체(스냅샷)
 * @param {string} drugQuery        정규화된 영문 약물명(예: "ethinyl estradiol")
 * @param {object} [opts]           매처별 옵션(threshold 등)
 * @returns {Promise<MatchResult>}
 */
export async function match(supplementPairs, drugQuery, opts) { ... }
```

비동기로 통일한다. 규칙 매처는 내부적으로 동기지만 `async`로 감싼다 — rxclass/claude는
네트워크/LLM 호출이라 비동기여야 하므로 시그니처를 일치시킨다.

## 입력 타입 — `Pair`

MedData InteractionPair에 스냅샷 시 **`pair_id`가 주입된** 형태:

```jsonc
{
  "pair_id": "c3_p3",            // ★ 스냅샷이 부여. 채점의 정렬 키. 절대 변형/삭제 금지
  "item_1_name": "Oral contraceptives (birth control pills)",  // 약물쪽(자유텍스트 클래스 라벨)
  "item_1_rxcui": null,          // MedData는 약물쪽 rxcui를 안 줌 — 그래서 매칭이 어려움
  "item_1_type": "drug",
  "item_2_name": "St. John's Wort",
  "item_2_rxcui": null,
  "item_2_type": "supplement",
  "severity": "high",
  "description": "St. John's Wort increases metabolism of hormonal contraceptives ...",
  "source": "Supplements DB"
}
```

## 출력 타입 — `MatchResult`

```jsonc
{
  "matched": Pair[],   // 질의약물과 관련 있다고 선별된 페어. 원본 필드 전부 보존(+pair_id)
  "dropped": Pair[],   // 무관하다고 버려진 페어. 역시 원본 보존
  "scored": [          // 전체 페어에 대한 점수+근거(설명가능성/디버깅용)
    { "pair_id": "c3_p3", "score": 7, "reason": "matched keywords: oral contraceptive, birth control" }
  ],
  "meta": { "matcher": "rule", "deduped": 0 }   // 선택: 매처명·dedup 수 등
}
```

## 불변식 (매처가 반드시 지킬 것 — eval-qa가 검증)

1. **`pair_id` 보존**: `matched`·`dropped`의 모든 페어는 입력 페어의 `pair_id`를 그대로 가진다.
   채점은 `pair_id`로 정렬하므로, 이걸 잃으면 TP/FP/FN을 셀 수 없다.
2. **원본 필드 비파괴**: 페어 객체의 기존 필드를 삭제/변형하지 않는다. 점수 같은 매처 산물은
   `scored[]`에만 담는다(페어 객체에 `_score`를 붙여도 무방하나, 채점은 그 필드를 안 본다).
3. **분할 완전성**: `matched ∪ dropped` 는 입력 페어 집합과 같다(중복 제거 후). 빠뜨리는 페어가 없다.
   단 매처가 dedup을 하면 `meta.deduped`로 제거 수를 보고하고, 제거된 페어는 dropped/matched 어디에도 안 넣어도 된다(중복이므로). dedup 정책은 매처 자유.
4. **결정성**: 같은 입력 → 같은 출력(회귀 비교의 전제). LLM 매처는 temperature 0 + 캐시 권장.

## 채점이 이 출력을 쓰는 법 (src/score.mjs)

- golden 케이스의 라벨(`pair_id → true_interaction|noise|TODO`)과 대조.
- **TP** = `matched`에 있고 라벨이 `true_interaction`
- **FP** = `matched`에 있고 라벨이 `noise`  ← 거짓경고(약사 신뢰 훼손)
- **FN** = `dropped`에 있고 라벨이 `true_interaction`  ← 놓친 경고(환자 위해)
- `TODO`/dedup된 페어는 채점 제외.
