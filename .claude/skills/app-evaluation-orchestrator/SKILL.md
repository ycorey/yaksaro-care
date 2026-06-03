---
name: app-evaluation-orchestrator
description: 약사로 케어 앱의 전체 품질을 평가하는 오케스트레이터. UX·기술·제품 3개 전문 에이전트를 병렬 실행해 보완·개선 리포트를 생성한다. "앱 평가", "전체 점검", "보완해야 할 것", "개선점 분석", "품질 감사", "출시 전 체크", "앱 리뷰", "다시 평가", "평가 업데이트" 요청 시 반드시 이 스킬을 사용하라.
---

# 약사로 케어 앱 평가 오케스트레이터

## 실행 모드: 서브 에이전트 (팬아웃/팬인)

3개 평가 에이전트를 병렬 실행 → 오케스트레이터가 결과 종합 → 우선순위 개선 리포트 생성

---

## Phase 0: 컨텍스트 확인

`C:\Users\main\yaksaro-care\_workspace\eval\` 존재 여부 확인.

- 없음 → **초기 실행** → Phase 1부터
- 있고 `01_`, `02_`, `03_` 파일 3개 존재 + 재평가 미요청 → **기존 결과 재활용** → Phase 3으로 바로 이동
- 있고 재평가 요청 → `_workspace\eval\`을 `_workspace\eval_prev\`로 이동 → Phase 1부터

---

## Phase 1: 워크스페이스 준비

`_workspace\eval\` 디렉토리 생성.

사용자에게 알림:
"앱 평가를 시작합니다. UX·기술·제품 3개 에이전트가 병렬로 코드를 분석합니다. 5~10분 소요됩니다."

---

## Phase 2: 병렬 평가 (서브 에이전트)

아래 3개 에이전트를 **단일 메시지에서 동시 호출**한다. 반드시 `model: "opus"`, `run_in_background: true`.

### ux-auditor 프롬프트

```
당신은 약사로 케어 UX/UI 평가 에이전트입니다.
에이전트 정의: C:\Users\main\yaksaro-care\.claude\agents\ux-auditor.md 를 읽고 따른다.
스킬: C:\Users\main\yaksaro-care\.claude\skills\ux-audit\SKILL.md 를 읽고 따른다.

프로젝트 경로: C:\Users\main\yaksaro-care

평가 후 결과를 C:\Users\main\yaksaro-care\_workspace\eval\01_ux-audit.md 에 저장하라.
```

### tech-auditor 프롬프트

```
당신은 약사로 케어 기술 품질 평가 에이전트입니다.
에이전트 정의: C:\Users\main\yaksaro-care\.claude\agents\tech-auditor.md 를 읽고 따른다.
스킬: C:\Users\main\yaksaro-care\.claude\skills\tech-audit\SKILL.md 를 읽고 따른다.

프로젝트 경로: C:\Users\main\yaksaro-care

평가 후 결과를 C:\Users\main\yaksaro-care\_workspace\eval\02_tech-audit.md 에 저장하라.
```

### product-auditor 프롬프트

```
당신은 약사로 케어 제품 완성도 평가 에이전트입니다.
에이전트 정의: C:\Users\main\yaksaro-care\.claude\agents\product-auditor.md 를 읽고 따른다.
스킬: C:\Users\main\yaksaro-care\.claude\skills\product-audit\SKILL.md 를 읽고 따른다.

프로젝트 경로: C:\Users\main\yaksaro-care

평가 후 결과를 C:\Users\main\yaksaro-care\_workspace\eval\03_product-audit.md 에 저장하라.
```

3개 에이전트 완료를 기다린다.

---

## Phase 3: 결과 종합 및 최종 리포트 생성

3개 출력 파일을 읽는다:
- `_workspace\eval\01_ux-audit.md`
- `_workspace\eval\02_tech-audit.md`
- `_workspace\eval\03_product-audit.md`

종합 리포트를 `_workspace\eval\final-evaluation.md`에 생성한다.

### 최종 리포트 구조

```markdown
# 약사로 케어 — 앱 종합 평가 리포트
평가일: {날짜}

## 종합 점수
| 영역 | 점수 | 등급 |
|------|------|------|
| UX/UI | /100 | |
| 기술 품질 | /100 | |
| 제품 완성도 | /100 | |
| **종합** | /100 | |

## 즉시 수정 필요 (Critical)
> 모든 에이전트 결과에서 Critical 이슈만 통합, 중복 제거

## 단기 개선 (1~2주, High)
## 중기 개선 (1개월, Medium)
## 장기 과제 (Low/리팩토링)

## 영역별 핵심 발견

### UX/UI 요약
### 기술 품질 요약  
### 제품 완성도 요약

## 우선순위 액션 플랜 TOP 10
1. [즉시] 문제 — 수정 방법
2. ...

## 잘 된 점 (강점)
## 출시 권고 의견
```

종합 리포트 완성 후 사용자에게 핵심 내용을 요약해서 전달한다.

---

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| 에이전트 1개 실패 | 나머지 2개 결과로 부분 리포트 생성, 누락 명시 |
| 파일 읽기 불가 | "분석 불가" 표기 후 계속 진행 |
| 출력 파일 없음 | 에이전트 재호출 1회 시도 |

---

## 테스트 시나리오

**Should trigger:**
- "앱 평가해줘"
- "현재 상태에서 보완해야 할 것 분석해줘"
- "전체 품질 점검해줘"
- "출시 전 체크리스트 돌려줘"
- "다시 평가해줘"

**Should NOT trigger:**
- "약사로 케어 시장 조사해줘" (→ yaksaro-care-orchestrator)
- "코드 리뷰해줘" (→ code-review 스킬)
- "보안만 점검해줘" (→ security-review 스킬)
