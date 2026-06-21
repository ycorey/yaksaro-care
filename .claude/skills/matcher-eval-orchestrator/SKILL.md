---
name: matcher-eval-orchestrator
description: 건기식·약물 상호작용 "매칭 게이트" 평가 하네스 오케스트레이터. matcher-engineer·golden-curator·eval-scorer·eval-qa를 에이전트 팀으로 협업시켜, 관련성 매처(rule→rxclass→claude→hybrid)를 정답셋에 채점하고 precision/recall로 회귀를 증명한다. "매칭 게이트 평가", "매처 평가", "precision recall 측정", "매처 baseline", "rxclass 붙이고 재측정", "claude 매처 비교", "hybrid 매처", "매처 회귀", "정답셋 확장", "golden 라벨링", "상호작용 매처 채점", "다시 측정", "재실행", "baseline 갱신", "매처 업데이트" 요청 시 반드시 이 스킬을 사용하라. (주의: 상호작용 *파이프라인 자체*는 interaction-poc/04_pipeline_poc — 이 스킬은 그 매칭 게이트를 *평가/승급*하는 전용 하네스다.)
---

# 매칭 게이트 평가 하네스 오케스트레이터

## 목표

상호작용 파이프라인의 **관련성 매칭 게이트**를 갈아끼울 때(rule→rxclass→claude→hybrid)
*"정말 나아졌는지"*를 precision/recall 숫자로 증명한다. 안 그러면 개선이 아니라 도박이다.

작업 루트: `interaction-poc/eval-harness/`. **무파괴**: `interaction-poc/04_pipeline_poc/`는 import만.
**무자본**: RxClass는 무료, claude는 키 필요(호출부 TODO 가능).

## 팀 (에이전트 팀 모드, 전원 model: opus)

| 에이전트 | 역할 | 스킬 |
|---|---|---|
| **matcher-engineer** | 매처를 인터페이스 계약대로 구현/유지 | matcher-strategy-impl |
| **golden-curator** | 정답셋 박제·pair_id·라벨링·검수 | golden-set-curation |
| **eval-scorer** | 채점·러너·리포트·회귀 해석 | matcher-eval-scoring |
| **eval-qa** | 경계면 교차 검증(general-purpose 타입) | (검증 실행) |

스폰 시 `Agent` 도구에 **`model: "opus"`** 명시. eval-qa만 `subagent_type: "general-purpose"`(검증 스크립트 실행 필요 — read-only Explore 불가).

## Phase 0 — 컨텍스트 확인 (먼저)

`interaction-poc/eval-harness/`와 `results/`를 확인해 실행 모드를 분기한다:

- **rule 재측정만** / "다시 측정" → **eval-scorer 단독**(runner+compare). 팀 불필요.
- **새 매처 추가/승급**(rxclass/claude/hybrid) → matcher-engineer + eval-scorer + eval-qa.
- **정답셋 확장/검수** → golden-curator 중심 + eval-scorer(재채점) + eval-qa(스키마 일치).
- **초기 구축**(eval-harness 없음) → 전 팀(이미 STEP1~5로 구축됨 — 보통 해당 없음).

## Phase 1 — 작업 분해 + 데이터 흐름

데이터 전달 = **파일 기반**(`eval-harness/`) + 태스크 기반 + 메시지.

```
golden-curator → golden/cases.json (정답셋, 박제+라벨)
matcher-engineer → matchers/<id>.mjs (매처)
        ↓ (둘 다 eval-qa가 경계면 교차검증)
eval-scorer → results/run_<id>_<date>.json + --compare (회귀)
```

전형 흐름(매처 승급):
1. matcher-engineer가 `matchers/<id>.mjs` 구현(interface.md 준수, 04_pipeline_poc 무수정).
2. eval-qa가 인터페이스 불변식 실행 검증(pair_id 보존·shape·결정성).
3. eval-scorer가 `runner --matcher <id>` 측정 → 기존 baseline과 `--compare`.
4. 회귀(🔴)/개선(🟢) 페어를 해석해 보고. 회귀면 matcher-engineer로 반려.

## Phase 2 — 실행 모드별 조율

**에이전트 팀**: `TeamCreate`로 팀 구성 → `TaskCreate`로 작업+의존성 할당 → 팀원이 `SendMessage`로 자체 조율 →
리더가 결과 종합. 단일 작업(rule 재측정)이면 팀 없이 eval-scorer 서브에이전트만.

## 에러 핸들링

- 매처 throw(미구현 등) → runner exit 2. **조용히 0점 리포트 만들지 않는다**(가짜 개선 오판 차단).
- eval-qa 불일치 발견 → 자동수정 금지, 구체적 불일치 + 재현법으로 책임 에이전트에 반려.
- MedData 한도(429)/인증(401) → golden-curator 중단·보고. 1회 재시도 후 실패면 누락 명시하고 진행.
- 정답셋 라벨 애매분은 `TODO`로 남겨 약사 검수 대기(상충 라벨을 임의 확정하지 않음).

## 핵심 계율

1. **무파괴**: `04_pipeline_poc/` git diff 0. 매처는 import만.
2. **채점 키 = pair_id**: 매처가 뭘 하든 채점은 pair_id로만. 보존 못 하면 채점 불가.
3. **FP/FN 분리**: 거짓경고(약사 신뢰) vs 놓침(환자 위해). F2 병기, 최종 트레이드오프는 약사.
4. **조용한 누락 금지**: dedup·TODO·no_pairs·unlabeled 전부 카운트로 노출.
5. **변별력**: baseline 만점은 DRUG_HINTS 손맞춤 탓. 미등록 약물로 정답셋 확장해야 평가가 일한다.

## 테스트 시나리오

- **정상 흐름**: "rxclass 매처 붙이고 재측정" → Phase0=새 매처 → engineer 구현 → qa 검증 → scorer 측정+compare(rule vs rxclass) → 회귀/개선 보고.
- **에러 흐름**: claude 매처 미구현 상태에서 "claude로 측정" → runner exit 2 → scorer가 "미구현"보고 → engineer에게 호출부 TODO 안내(무자본이면 보류).

## 산출물

- 매처: `eval-harness/matchers/<id>.mjs`
- 정답셋: `eval-harness/golden/cases.json` (+ `_snapshot_raw.json`)
- 결과: `eval-harness/results/run_<id>_<date>.json`
- 해석: baseline 숫자 + 회귀/개선 페어 + README baseline 갱신
