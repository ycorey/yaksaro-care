---
name: matcher-eval-scoring
description: 매칭 게이트 매처를 페어 단위로 채점하는 스킬. TP/FP/FN → precision/recall/F1/F2, FP(거짓경고) vs FN(놓침) 도메인 분리, 러너 실행·결과 저장·케이스 diff·두 run 회귀 비교. "매처 채점", "precision recall 측정", "baseline 측정", "F1 F2 산출", "매처 회귀 비교", "compare 회귀", "다시 측정", "재측정" 작업 시 반드시 이 스킬을 사용할 것. eval-scorer 에이전트가 사용한다.
---

# 매처 평가 채점 (Matcher Eval Scoring)

## 목표

매처 결과를 정답셋과 대조해 **"정말 나아졌는가"를 숫자로** 답한다. 위치: `interaction-poc/eval-harness/src/`.

## 실행

```bash
node eval-harness/src/runner.mjs --matcher rule            # 채점 + results/ 저장 + 요약
node eval-harness/src/report.mjs results/run_rule_<date>.json          # 리포트 다시 보기
node eval-harness/src/report.mjs --compare results/A.json results/B.json   # 회귀 비교
```

## 채점 규칙 (비교 키 = pair_id)

| | 정답=true_interaction | 정답=noise |
|---|---|---|
| 매처가 matched | **TP** | **FP** (거짓경고) |
| 매처가 dropped | **FN** (놓침) | TN |

- `precision = TP/(TP+FP)`, `recall = TP/(TP+FN)`, `F1`(균형), **`F2`(recall 가중)**.
- 분모 0 → null(0 아님). `TODO`·`no_pairs`·dedup·unlabeled는 **채점 제외하되 별도 카운트로 노출**.

## FP vs FN 도메인 의미 (반드시 분리 보고)

- **FP**(거짓경고): noise를 matched → 약사 신뢰훼손·알림피로. precision이 잡는다.
- **FN**(놓침): true를 dropped → 환자 위해. recall이 잡는다.
- 임상에선 보통 **FN이 더 위험** → F2 병기. 단 거짓경고도 환자 불안/과잉회피를 부르므로
  **최종 트레이드오프는 약사가 정한다**(하네스는 숫자만 제공).

## 조용한 누락 금지

dedup·TODO·no_pairs·unlabeled를 전부 카운트로 보여준다. 삼키면 커버리지를 오해한다.
특히 `unlabeled>0`(라벨 없는 페어가 matched)는 정답셋 누락 신호 → golden-curator에 통지.

## micro 평균 주지표

케이스별 페어 수 편차가 커서 macro 평균은 소수 케이스에 휘둘림 → 전체 TP/FP/FN을 풀링한 micro를 주지표로.

## 회귀 워크플로

- 매처를 바꾸면 항상 새 run → 이전 run과 `--compare`.
- 🔴 회귀 = 정답 새로 놓침(tp→fn)·거짓경고 생김(tn→fp). 🟢 개선 = 그 반대.
- 결정성 확인: 같은 입력 2회 → 차이 0(LLM은 temperature 0 + 캐시 전제).

## baseline 해석 주의

rule이 시드셋에서 만점인 건 DRUG_HINTS가 그 약물들에 손맞춤돼서다. **"하네스가 채점을 정확히 한다"는
확인이지 "rule이 충분하다"가 아니다.** 변별력은 DRUG_HINTS 미등록 약물로 정답셋을 확장할 때 나온다.

## 도구 (구현됨)

- `score.mjs`: `fbeta`·`scoreCase`·`aggregate`(순수).
- `runner.mjs`: 매처 동적 import→채점→저장. 미구현 매처 exit 2.
- `report.mjs`: `renderRun`·`renderCompare`.
