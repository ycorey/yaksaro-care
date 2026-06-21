---
name: golden-set-curation
description: 매칭 게이트 채점용 정답셋(golden set)을 만들고 유지하는 스킬. MedData 실응답을 스냅샷으로 박제, pair_id 부여, "이 페어가 질의약물에 해당하는가" 라벨링(명백=proposed, 애매=TODO 약사검수). "정답셋 만들기", "골든셋 라벨링", "케이스 추가", "스냅샷 박제", "MedData 응답 고정", "라벨 검수", "정답셋 확장", "golden 케이스" 작업 시 반드시 이 스킬을 사용할 것. golden-curator 에이전트가 사용한다.
---

# 정답셋 큐레이션 (Golden Set Curation)

## 목표

매처를 채점할 **기준 정답셋**을 만든다. 코드와 분리된 데이터다. 위치: `interaction-poc/eval-harness/golden/`.

## 파이프라인

```
snapshot.mjs (MedData 실호출, 케이스당 1콜)
  → _snapshot_raw.json (풀 페어 박제, pair_id 주입, 재호출 금지)
  → build-cases.mjs (박제 + LABELS 병합 + 무결성검사)
  → cases.json (정본: 스냅샷 + 라벨)
```

실행:
```bash
node --env-file=.env eval-harness/golden/snapshot.mjs   # MedData 박제
node eval-harness/golden/build-cases.mjs                # cases.json 생성
```

## 핵심 규칙 (이유 포함)

1. **박제 불변**: MedData 응답은 회귀 비교 기준 → 한 번 떠서 고정, 재호출 금지. 매번 호출하면 채점이 흔들린다.
2. **풀 페어 보존**: `item_1_name`(약물쪽 클래스 라벨)이 매처 매칭의 표적 → 절대 평탄화/유실 금지.
   (`03_matrix_result.json`은 severities[]/descriptions[]로 평탄화돼 못 씀 → 풀 페어로 다시 박제.)
3. **라벨 축은 하나 — 매칭 게이트**: "이 페어가 질의약물에 해당하는가"만 본다.
   임상 위험도/근거충분성은 별개 축(근거·해석 레이어). 예: CoQ10×warfarin 기전이 논쟁적이어도 매칭상 `true_interaction`.
4. **클래스 라벨 매칭이 정답 기준**: ciprofloxacin∈"Fluoroquinolone", amoxicillin∈"Antibiotics", 피임약="Oral contraceptives".

## 라벨 값

| label | 의미 | 채점 |
|---|---|---|
| `true_interaction` | 질의약물에 해당(매처가 matched 해야 정답) | matched→TP, dropped→FN |
| `noise` | 다른 약물 상호작용(매처가 dropped 해야 정답) | matched→FP, dropped→TN |
| `TODO` | 약사 검수 대기 — 채점 제외 |

`review`: `proposed`(초안) → 약사 검수 → `confirmed`. **명백한 건 proposed로 채우고 임상 애매분만 TODO.**

## dedup 인지

ODS 출처 중복 페어(설명 동일)는 매처가 dedup → 채점에 한 쪽만 나타난다. 박제엔 둘 다 남기되 라벨 동일,
`why`에 "ODS 중복 — dedup 대상" 표기.

## no_pairs

MedData 404(식품 등 미수록, 예: 자몽) → `status:"no_pairs"`, `snapshot:[]`. 매칭 채점 제외,
시스템 커버리지 공백으로 별도 집계(식품군은 PubMed/규칙 보완).

## 변별력 (정답셋 확장의 진짜 목적)

`DRUG_HINTS` 등록 약물만 담으면 rule이 만점이라 **평가가 일을 안 한다**. 의도적으로:
- DRUG_HINTS **미등록 약물**, 표현이 다른 클래스 라벨, 대조문 함정(약물명이 있지만 의미상 무관)
을 추가해 매처를 변별한다. 새 케이스는 `snapshot.mjs`의 CASES에 추가 → 박제 → LABELS 라벨 → build.

## 약사 검수 워크플로

1. `cases.json`의 `review:"proposed"`를 훑어 동의하면 `confirmed`.
2. 틀리면 `label`·`why` 수정 후 `confirmed`.
3. `TODO`는 판단해 `true_interaction`/`noise`로 확정.
4. `snapshot`·`pair_id`는 **건드리지 않는다**(회귀 기준 고정).

## 변경 후

eval-scorer(재채점)·eval-qa(스키마↔파서 일치)·matcher-engineer(라벨 표현이 매처 가정과 어긋나는지)에 통지.
