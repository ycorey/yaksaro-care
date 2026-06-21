# 매칭 게이트 평가 하네스 (eval-harness)

건기식·약물 상호작용 파이프라인의 **관련성 매칭 게이트**를 페어 단위로 채점한다.
매처(rule → rxclass → claude → hybrid)를 갈아끼울 때 *"정말 나아졌는지"*를
precision/recall 숫자로 증명하기 위한 프레임이다. 안 그러면 개선이 아니라 도박이다.

> 왜 매칭 게이트가 핵심인가: MedData는 페어매칭을 안 한다(건기식의 상호작용 *전체 목록*을 주고,
> 약물 쪽은 `item_1_rxcui=null` + 자유텍스트 클래스 라벨). 질의약물에 해당하는 페어만 골라내는
> 이 게이트가 차별점의 핵심이고, 지금은 손맞춤 규칙이라 약물이 늘면 병목이 된다. → `../05_decision_report.md`

---

## 디렉토리 맵

```
eval-harness/
  matchers/                 # 교체 가능한 매처 전략(같은 시그니처)
    interface.md            # 공통 계약 — match()→{matched,dropped,scored,meta}, pair_id 불변식
    rule.mjs                # ✅ 기존 filterPairsForDrug() 어댑터(import만, 04_pipeline_poc 무수정)
    rxclass.mjs             # 🟡 스켈레톤 — RxClass(무료)로 DRUG_HINTS 자동화
    claude.mjs              # 🟡 스켈레톤 — LLM 관련성 판정(표현다양성·한글·대조문 함정)
    hybrid.mjs              # 🟡 스켈레톤 — rxclass 1차 → 경계만 claude 승급
  golden/                   # 정답셋(코드와 분리된 데이터)
    cases.schema.md         # 스키마 + 라벨 의미 + 약사가 채우는 법
    cases.json              # ★정본 정답셋 — 스냅샷 + pair_id + 라벨
    _snapshot_raw.json      # MedData 실응답 박제(회귀 기준, 재호출 금지)
    snapshot.mjs            # 스냅샷 캡처 도구(MedData 10콜)
    build-cases.mjs         # 박제 + 라벨맵 → cases.json (무결성 검사 포함)
  src/
    score.mjs               # 채점 — TP/FP/FN/TN, precision/recall/F1/F2 (순수 모듈)
    runner.mjs              # 케이스 로드 → 매처 실행 → 채점 → results/ 저장
    report.mjs              # 요약표 + 케이스 diff + --compare(회귀 비교)
  results/                  # run 결과(git 추적 — 회귀 비교용)
    run_<matcher>_<date>.json
```

## 실행

```bash
# interaction-poc/ 기준. 매처 채점 + 저장 + 요약 출력
node eval-harness/src/runner.mjs --matcher rule

# 저장된 run 리포트만 다시 보기
node eval-harness/src/report.mjs eval-harness/results/run_rule_<date>.json

# 두 run 회귀 비교(새로 깨진/고쳐진 페어 + 지표 델타)
node eval-harness/src/report.mjs --compare results/run_rule_A.json results/run_rxclass_B.json
```

매처는 `--matcher <id>` 로 주입(`matchers/<id>.mjs` 동적 import). 미구현 매처는 **조용히 0점을 내지 않고**
exit 2로 명확히 중단한다.

## 현재 baseline (rule)

`results/run_rule_2026-06-21_14-00-00.json` — 시드 정답셋(10케이스, 채점 9 / no_pairs 1):

| matcher | precision | recall | F1 | F2 | TP | FP | FN |
|---|---|---|---|---|---|---|---|
| **rule** | **1.000** | **1.000** | **1.000** | **1.000** | 9 | 0 | 0 |

dedup=4(ODS 출처 중복), **TODO매칭=1**(c6_p2 — 약사검수 대기), unlabeled=0.

> ⚠️ **이 만점을 오해하지 말 것.** rule이 완벽한 게 아니라, `DRUG_HINTS`가 *이 시드셋의 8개 약물에 손으로
> 맞춰져* 있어서다. 평가의 **변별력은 정답셋을 확장할 때** 나온다:
> - `DRUG_HINTS`에 **없는 약물**을 추가하면 rule은 즉시 깨진다(클래스 라벨을 못 잇거나, 약물명 직접표기가 없으면 0).
> - 그때 rxclass/claude가 이겨야 "승급이 진짜 개선"임이 숫자로 증명된다.
> 즉 baseline=만점은 "하네스가 채점을 정확히 한다"는 확인이지, "rule이 충분하다"가 아니다.

## 매처 로드맵

1. **rule**(현재) — 문자열·DRUG_HINTS 매칭. 시드셋엔 충분하나 손맞춤·미등록약물 0점.
2. **rxclass** — 약물 → RxNorm → RxClass 클래스 자동확장 → DRUG_HINTS 제거. 한글약물은 미해결.
3. **claude** — LLM 의미 판정. 표현다양성·한글·대조문 함정(c6_p2류) 흡수. 비용·비결정성(캐시로 완화).
4. **hybrid** — rxclass 1차 + 경계만 claude. 정확도≈claude, 콜수 급감.

각 승급마다: ① 매처 구현 → ② `runner --matcher <new>` → ③ `report --compare rule new` 로 회귀/개선 확인.

## 정답셋 확장하는 법 (변별력의 원천)

1. `golden/snapshot.mjs` 의 `CASES`에 새 (건기식, 약물) 추가 — **특히 `DRUG_HINTS`에 없는 약물**.
2. `node --env-file=.env eval-harness/golden/snapshot.mjs` (MedData 콜, 풀 페어 박제).
3. `build-cases.mjs` 의 `LABELS`에 새 pair_id 라벨 채움(`proposed`) → `node build-cases.mjs`.
4. 약사 검수: `cases.json` 의 `proposed`→`confirmed`, `TODO` 확정.
5. `runner --matcher rule` 로 재측정 — rule이 새 약물에서 깨지는지 확인(=평가가 일하기 시작).

## 회귀 워크플로

- 매처를 바꾸면 항상 새 run 저장 → 이전 run과 `--compare`.
- 🔴 회귀 = 정답을 새로 놓침(tp→fn) 또는 거짓경고 생김(tn→fp). 🟢 개선 = 그 반대.
- 같은 입력 2회는 동일해야 함(결정성). LLM 매처는 temperature 0 + 캐시로 보장.

## 도메인 주의 (FP vs FN)

- **FP**(거짓경고, noise를 matched) → 약사 신뢰 훼손·알림피로. precision이 잡음.
- **FN**(놓침, true를 dropped) → 환자 위해. recall이 잡음.
- 임상에선 보통 **FN이 더 위험** → F2(recall 가중) 병기. 단 거짓경고도 환자 불안/과잉회피를 부르므로
  **최종 트레이드오프는 약사가 정한다**(하네스는 숫자만 제공).

## 미결(pending)

- [ ] **c6_p2 TODO 확정** — 비타민K×warfarin의 "Other anticoagulants(NOAC)" 대조 페어.
      rule이 'warfarin' 문자열로 매칭함 → 약사가 noise로 판정하면 즉시 FP로 드러남(rule의 첫 실패 후보).
- [ ] 정답셋 라벨 전반 `proposed`→`confirmed` 약사 검수.
- [ ] rxclass/claude/hybrid 실구현 + 재측정(무자본 단계라 호출부 TODO).
- [ ] 정답셋을 DRUG_HINTS 미등록 약물로 확장(변별력 확보).
