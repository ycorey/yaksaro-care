---
name: yaksaro-care-orchestrator
description: 약사로 케어(Yaksaro Care) 종합 분석 하네스 오케스트레이터. "약사로 케어 분석", "케어 보고서 생성", "약사로 SaaS 기획", "시장 조사 시작", "투자 보고서", "기술 아키텍처 설계", "다시 실행", "보고서 업데이트", "섹션 재분석", "데이터 전략 검토", "규제 리스크 분석", "경쟁사 비교", "MVP 범위 정의" 요청 시 반드시 이 스킬을 사용하라. 9개 전문 에이전트를 협업시켜 시장 검증·데이터 전략·규제 리스크·경쟁 분석·기술 설계·MVP 정의·투자 평가·종합 보고서를 자동 생성한다.
---

# 약사로 케어 종합 분석 오케스트레이터

## 실행 모드: 하이브리드

- **Phase 2**: 서브 에이전트 7개 병렬 (`run_in_background: true`) — 독립 도메인 동시 조사
- **Phase 3**: 에이전트 팀 2명 (`TeamCreate`) — 상충 데이터 협의 및 보고서 합성
- **Phase 4**: 오케스트레이터 직접 실행 — 9섹션 최종 조립

---

## Phase 0: 컨텍스트 확인

실행 시작 시 `C:\Users\main\yaksaro-care\_workspace\` 존재 여부를 확인한다.

- `_workspace\` 없음 → **초기 실행** → Phase 1부터 시작
- `_workspace\` 있고 `02_*.md` 파일 7개 모두 존재 + 사용자가 재조사 미요청 → **후속 실행** → Phase 3부터 시작
- `_workspace\` 있고 사용자가 특정 섹션 재조사 요청 → **부분 재실행** → 해당 에이전트만 재호출 후 Phase 3

---

## Phase 1: 워크스페이스 준비

`_workspace\`와 `_workspace\final\` 디렉토리를 생성한다.

사용자에게 알림: "약사로 케어 종합 분석을 시작합니다. 7개 전문 에이전트가 병렬로 조사를 진행합니다. 완료까지 약 10~20분 소요됩니다."

---

## Phase 2: 병렬 조사 (서브 에이전트 모드)

아래 7개 에이전트를 단일 메시지에서 동시 호출한다. 반드시 `model: "opus"`.

각 에이전트 프롬프트에는 해당 스킬 활용 지시 + 출력 파일 경로를 포함한다:

| 에이전트 | 스킬 | 출력 파일 |
|---------|------|---------|
| market-validator | market-research | `_workspace/02_market-validator_research.md` |
| data-strategist | data-strategy + korean-data-sources.md | `_workspace/02_data-strategist_analysis.md` |
| regulatory-analyst | regulatory-analysis | `_workspace/02_regulatory-analyst_risks.md` |
| competitive-analyst | competitive-analysis | `_workspace/02_competitive-analyst_landscape.md` |
| tech-architect | tech-design + schema-design.md | `_workspace/02_tech-architect_design.md` |
| mvp-planner | mvp-definition | `_workspace/02_mvp-planner_scope.md` |
| investment-analyst | investment-assessment | `_workspace/02_investment-analyst_valuation.md` |

모든 에이전트 완료 대기. 완료마다 사용자에게 진행 상황 업데이트.

---

## Phase 3: 보고서 합성 (에이전트 팀 모드)

```
TeamCreate(
  team_name: "yaksaro-synthesis-team",
  members: [
    synthesis-editor (model: "opus"),
    fact-checker (model: "opus")
  ]
)
```

synthesis-editor 시작 지시: "`_workspace/02_*.md` 7개와 `references/report-template.md`를 읽어 9섹션 초안 작성 → `_workspace/03_synthesis-editor_draft.md` 저장 → fact-checker에게 SendMessage"

팀 합성 완료 후: TeamDelete("yaksaro-synthesis-team")

---

## Phase 4: 최종 조립

오케스트레이터가 `03_synthesis-editor_draft.md`를 읽고 `report-template.md` 구조로 최종 보고서를 조립한다.

출력: `_workspace/final/yaksaro-care-comprehensive-report.md`

---

## Phase 5: 완료 보고

- 보고서 경로 안내
- 팩트체크 주요 수정 사항 요약
- 다음 단계 권고 (법무 검토, DUR API 신청, 약사 파트너 모집 등)

---

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| 서브 에이전트 1개 실패 | 해당 섹션 "조사 실패" 표기 후 나머지로 진행 |
| Phase 3 팀 무응답 30분 이상 | draft를 최종본으로 처리 |
| 규제/데이터 정보 미확인 | "확인 필요" 태그 후 보고서에 반영 |

---

## 테스트 시나리오

**Should trigger:**
- "약사로 케어 분석 시작해줘"
- "보고서 만들어줘"
- "시장 조사해줘"
- "규제 리스크 분석해줘"
- "기술 아키텍처 설계해줘"
- "다시 실행해줘"

**Should NOT trigger:**
- "PharmMatch 버그 고쳐줘"
- "Next.js 코드 리뷰해줘"
- "PharmMatch 배포 상태 확인해줘"
