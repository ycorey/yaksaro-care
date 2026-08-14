# UTM 규약 — 유입 채널 태깅

채널을 늘리기 전에 **어디서 왔는지 구분되게** 만들어 두는 문서. 링크에 태그를 붙이지
않으면 방문자 수는 늘어도 뭐가 먹혔는지 알 수 없고, 그러면 안 먹히는 채널을 계속하게 된다.

---

## 1. 규칙 (3줄)

1. **소문자 + 언더스코어만.** GA4 는 대소문자를 구분해서 `Blog` 와 `blog` 가 서로 다른 채널로 쪼개진다. 한글·띄어쓰기도 금지.
2. **아래 표에 있는 값만 쓴다.** 새 채널이 생기면 링크를 만들기 전에 표에 먼저 적는다. (`naver_cafe` / `navercafe` / `cafe` 를 섞어 쓰면 한 채널이 3개로 갈라진다.)
3. **랜딩(`yaksaro.co.kr`)에 태그를 건다.** 앱(`care.yaksaro.co.kr`)으로 직접 보내지 않는다 — 이유는 §3.

## 2. 값 표

### `utm_source` — 어디서 왔나

| 값 | 채널 |
|---|---|
| `blog` | ISTP약사의 약이야기 (네이버 블로그) |
| `naver_cafe` | 네이버 카페 (간병·요양·부모님) |
| `mom_cafe` | 지역 맘카페 |
| `instagram` | 인스타그램 |
| `danggeun` | 당근 동네생활 |
| `kakao` | 카카오톡 공유·채널 |
| `qr` | 약국 QR 포스터 *(서버가 자동 부착 — 손으로 쓸 일 없음)* |

### `utm_medium` — 어떤 형태로

| 값 | 형태 |
|---|---|
| `post` | 본문 글 |
| `comment` | 댓글·답글 |
| `profile` | 프로필/소개란 고정 링크 |
| `reels` | 릴스·숏폼 |
| `story` | 인스타 스토리 |
| `dm` | 1:1 메시지 |
| `pharmacy_poster` | 약국 인쇄물 *(서버 자동)* |

### `utm_campaign` — 무슨 앵글로

| 값 | 앵글 |
|---|---|
| `parent_meds` | "부모님 약 정리" (자녀 타겟) |
| `silver_wallet` | "내 약 지갑" (복용자 본인 타겟) |
| `pharmacy_b2b` | 약국 대상 |

---

## 3. 왜 앱이 아니라 랜딩에 태그를 거는가

랜딩과 앱은 **서로 다른 Vercel 프로젝트**라 Vercel Analytics 가 분리돼 있다.
앱 링크에 직접 태그를 걸면 랜딩의 설명을 건너뛰게 되고, 랜딩에만 걸면 앱 쪽에서
유입이 전부 `referrer: yaksaro.co.kr` 하나로 뭉쳐 버린다.

그래서 `landing-deploy/analytics.js` 가 **랜딩에 들어온 UTM 을 앱 링크(`care.yaksaro.co.kr`)로
그대로 넘긴다.** 랜딩 한 곳에만 태그를 걸면 블로그 → 랜딩 → 앱 → 가입이 하나로 이어진다.

> GA4 는 앱과 측정 ID 가 같고(`G-C1K0LNGYR6`) 서브도메인 쿠키를 공유해 원래 세션이
> 이어진다. 위 전달 코드가 메우는 건 **Vercel Analytics 쪽 단절**이다.

---

## 4. 복붙용 링크

```
# 블로그 본문
https://yaksaro.co.kr/?utm_source=blog&utm_medium=post&utm_campaign=parent_meds

# 네이버 카페 본문 / 댓글
https://yaksaro.co.kr/?utm_source=naver_cafe&utm_medium=post&utm_campaign=parent_meds
https://yaksaro.co.kr/?utm_source=naver_cafe&utm_medium=comment&utm_campaign=parent_meds

# 맘카페
https://yaksaro.co.kr/?utm_source=mom_cafe&utm_medium=post&utm_campaign=parent_meds

# 인스타 (프로필 고정 링크 / 릴스)
https://yaksaro.co.kr/?utm_source=instagram&utm_medium=profile&utm_campaign=parent_meds
https://yaksaro.co.kr/?utm_source=instagram&utm_medium=reels&utm_campaign=parent_meds

# 당근 동네생활
https://yaksaro.co.kr/?utm_source=danggeun&utm_medium=post&utm_campaign=parent_meds

# 환자용 상세 페이지로 바로 보낼 때 (경로만 바뀌고 태그는 동일)
https://yaksaro.co.kr/patient.html?utm_source=blog&utm_medium=post&utm_campaign=parent_meds
```

**약국 QR 은 손댈 필요 없다.** `/store/[store_id]` 라우트가 착지 URL 에
`utm_source=qr&utm_medium=pharmacy_poster` 를 서버에서 붙인다 — 이미 인쇄돼 나간
QR 포스터도 그대로 잡힌다.

---

## 5. 어디서 확인하나

| 보고 싶은 것 | 위치 |
|---|---|
| 랜딩에 몇 명 왔나 · 채널별 | Vercel → **landing-deploy** → Analytics → UTM Parameters |
| 앱까지 넘어온 사람 · 채널별 | Vercel → **yaksaro-care** → Analytics → UTM Parameters |
| 가입·첫 약 등록까지 간 사람 | GA4(`G-C1K0LNGYR6`) → 획득 → `sign_up` · `first_drug_added` 이벤트 |

두 프로젝트를 **따로** 봐야 한다. 랜딩 방문자 수와 앱 방문자 수의 차이가 곧 이탈 지점이다.

---

## 6. 주의

- **UTM 은 소급 적용되지 않는다.** 이미 올린 글의 링크를 지금 바꿔도 그 전 유입은 영영 미분류다.
- **`utm_` 외의 파라미터는 분석에 남지 않는다.** `lib/analytics.ts` 의 `ALLOWED_QUERY_KEYS`
  화이트리스트가 나머지를 전부 잘라낸다(환자 UUID·약국명 유출 차단). 커스텀 파라미터를
  추적 용도로 붙여도 조용히 사라지니 UTM 5종 안에서 해결할 것.
- **랜딩 수정은 자동 배포가 아니다.** `landing-deploy/` 는 Vercel CLI 수동 배포다.
  UTM 전달 코드를 바꿨으면 배포해야 실제로 동작한다.
