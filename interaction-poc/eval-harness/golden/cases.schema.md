# 정답셋(golden set) 스키마 — `cases.json`

매칭 게이트를 채점하려면 "이 건기식×약물 질의에서, MedData가 돌려준 각 페어가 **질의약물과 관련 있는 정답인지(noise인지)**"를 사람이 라벨링한 기준표가 필요하다. 이 파일이 그 기준이다.

> ⚠️ **이 라벨은 "매칭 게이트"용이다.** 묻는 것은 *"이 페어가 질의약물에 해당하는가"* 한 가지다.
> "이 상호작용이 임상적으로 진짜 위험한가/근거가 충분한가"는 **다른 축**(근거·해석 레이어가 담당)이며 여기서 라벨하지 않는다.
> 예: CoQ10×warfarin(c9)은 기전 설명이 논쟁적이지만, **페어가 warfarin에 해당하는 것은 분명**하므로 매칭상 `true_interaction`이다.

---

## 파일 구조

```jsonc
{
  "meta": { "generated_from", "snapshot_source", "label_legend", "notes" },
  "cases": [
    {
      "id": "c4",
      "supplement_ko": "세인트존스워트",
      "supplement_en": "St. John's Wort",
      "drug_query": "ethinyl estradiol",     // 정규화된 영문 약물명(매처 입력)
      "clinical_fact": "경구피임약 효과 감소",  // 이 조합의 알려진 임상 사실(참고용)
      "status": "has_pairs",                  // has_pairs | no_pairs
      "returned_pairs": 8,                    // 박제된 페어 수(중복 포함)
      "snapshot": [                           // ★MedData 실응답 박제 — 회귀 기준, 재호출 금지
        {
          "pair_id": "c4_p3",                 // 채점 정렬 키. 절대 변형/삭제 금지
          "item_1_name": "Oral contraceptives (birth control pills)",
          "item_1_rxcui": null, "item_1_type": "drug",
          "item_2_name": "St. John's Wort", "item_2_rxcui": null, "item_2_type": "supplement",
          "severity": "high",
          "description": "St. John's Wort increases metabolism of hormonal contraceptives ...",
          "source": "Supplements DB"
        }
        // ... 나머지 페어
      ],
      "labels": {                             // pair_id → 라벨
        "c4_p3": { "label": "true_interaction", "review": "proposed",
                   "why": "질의약물 ethinyl estradiol = 경구피임약. CYP3A4 유도로 피임효과 감소(확립)" },
        "c4_p1": { "label": "noise", "review": "proposed",
                   "why": "질의약물=피임약. SSRI는 다른 약" }
        // ... 나머지
      }
    }
  ]
}
```

## 라벨 값(`label`)

| 값 | 의미 | 채점 |
|---|---|---|
| `true_interaction` | 이 페어는 **질의약물에 해당**한다(약물명 직접 or 약물이 속한 클래스 라벨). 매처가 `matched`에 남겨야 정답. | matched→**TP**, dropped→**FN**(놓침) |
| `noise` | 이 페어는 **다른 약물**의 상호작용이다(같은 건기식이지만 질의약물 아님). 매처가 `dropped`로 버려야 정답. | matched→**FP**(거짓경고), dropped→TN |
| `TODO` | 임상/매칭상 **애매**해 약사 검수 대기. | **채점 제외**(별도 표기) |

## 검수 상태(`review`)

| 값 | 의미 |
|---|---|
| `proposed` | 자동/초안 라벨. 약사(나)가 검토 후 `confirmed`로 승격하거나 수정. |
| `confirmed` | 약사 검수 완료. |
| (TODO 항목) | `label:"TODO"` 자체가 "검수 필요"를 뜻함. 판단 후 `true_interaction`/`noise` + `review:"confirmed"`로 교체. |

## 클래스 라벨 매칭이 핵심인 이유

MedData는 약물쪽을 **자유텍스트 클래스 라벨**로 준다(`item_1_rxcui=null`). 그래서:
- 질의약물 문자열이 응답에 **그대로 없을 수 있다.** 예: `ethinyl estradiol`은 응답에 없고 `"Oral contraceptives (birth control pills)"`로만 존재. → 정답 라벨은 **"이 클래스가 질의약물을 포함하는가"**로 판단한다(ciprofloxacin∈"Fluoroquinolone", amoxicillin∈"Antibiotics", warfarin∈"Warfarin and other blood thinners").
- 매처의 임무 = 이 클래스 라벨을 질의약물과 의미적으로 잇는 것. 정답셋은 그 "정답"을 사람이 고정한다.

## 중복(dedup) 페어 처리

동일 내용이 `source:"Supplements DB"`와 `source: ODS factsheet URL` 두 번 등장한다(설명 텍스트 동일). 매처가 dedup하므로 **둘 중 하나는 채점에 안 나타난다.** 박제에는 둘 다 남기되(원본 충실), 라벨은 양쪽 다 같은 값으로 둔다(`why`에 "ODS 중복 — dedup 대상" 표기). 채점은 dedup 후 살아남은 페어만 본다.

## `no_pairs` 케이스

자몽(식품)처럼 MedData가 404(미수록)면 `status:"no_pairs"`, `snapshot:[]`. **매칭 게이트 채점 대상이 아니다**(매칭할 페어가 없음). 단 "시스템 차원의 커버리지 공백"으로 별도 집계한다(식품군은 PubMed/규칙 보완 필요 — `05_decision_report.md`).

## 사람이 채우는 법 (약사용)

1. `review:"proposed"` 라벨을 훑어보고 동의하면 `confirmed`로 바꾼다.
2. 틀렸으면 `label`을 고치고 `why`를 갱신, `review:"confirmed"`.
3. `label:"TODO"`는 판단 후 `true_interaction`/`noise`로 확정한다.
4. `snapshot`·`pair_id`는 **건드리지 않는다**(회귀 기준 고정).
