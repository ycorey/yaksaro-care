import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeDrugName, drugBaseName, drugSearchPrefix, isExportOnly, hasStrength, matchDrugName,
} from './drug-name-match.ts'

// 후보는 전부 2026-08-31 운영 `drugs.item_name` 실측값이다(가공하지 않음).
const c = (item_name: string, id = item_name) => ({ id, item_name })

// ── 정규화 ────────────────────────────────────────────────────────────
test('단위 표기 흔들림을 흡수한다 (밀리그램/밀리그람/mg/㎎)', () => {
  const want = normalizeDrugName('리바로정2mg')
  for (const v of ['리바로정2밀리그램', '리바로정2밀리그람', '리바로정2㎎', '리바로정2 MG']) {
    assert.equal(normalizeDrugName(v), want, v)
  }
})

test('밀리그램이 그램 규칙에 먼저 잘리지 않는다', () => {
  assert.equal(normalizeDrugName('펜타사서방과립1그램'), '펜타사서방과립1g')
  assert.equal(normalizeDrugName('놀텍정10밀리그램'),   '놀텍정10mg')
})

test('마스터의 끝 공백을 흡수한다 (울트라셋이알세미서방정 )', () => {
  assert.equal(normalizeDrugName('울트라셋이알세미서방정 '), normalizeDrugName('울트라셋이알세미서방정'))
})

test('캅셀/캅슐을 캡슐로 통일한다', () => {
  assert.equal(normalizeDrugName('뮤테란캅셀'), '뮤테란캡슐')
})

test('숫자 뒤 밀→일 오인식만 고친다 (제품명 안의 「일」은 건드리지 않는다)', () => {
  assert.equal(normalizeDrugName('탈리부틴정200일리그램'), normalizeDrugName('탈리부틴정200밀리그램'))
  // 「일」로 시작하는 성분/제품명이 훼손되면 안 된다
  assert.equal(normalizeDrugName('놀텍정10밀리그램(일라프라졸)'), '놀텍정10mg(일라프라졸)')
})

test('선행 급여/비급여 수식어를 뗀다', () => {
  assert.equal(drugSearchPrefix('(비급여)고든구강용해필름5mg(타다라필)'), '고든구강용해필름')
})

// ── base / prefix ────────────────────────────────────────────────────
test('괄호 성분명을 떼고 제품명+함량만 비교한다', () => {
  assert.equal(drugBaseName('콩코르정5밀리그램(비소프롤롤푸마르산염)'), '콩코르정5mg')
  assert.equal(drugBaseName('대웅로수바스타틴정20밀리그램(로수바스타틴칼슘(미분화))'), '대웅로수바스타틴정20mg')
  assert.equal(drugBaseName('크레젯정10/5밀리그램(에제티미브,로수바스타틴)'), '크레젯정10/5mg')
})

test('접두 조회 키는 첫 숫자·괄호 앞까지', () => {
  assert.equal(drugSearchPrefix('놀텍정10밀리그램'),                 '놀텍정')
  assert.equal(drugSearchPrefix('칸데디핀정8/5밀리그램'),            '칸데디핀정')
  assert.equal(drugSearchPrefix('아타칸정16밀리그램(칸데시르탄실렉세틸)'), '아타칸정')
  assert.equal(drugSearchPrefix('콩코르정'),                        '콩코르정')
  assert.equal(drugSearchPrefix('뮤테란캅셀'),                      '뮤테란캡슐')
})

test('접두가 1글자 이하면 조회하지 않는다', () => {
  assert.equal(drugSearchPrefix('정'), null)
  assert.equal(drugSearchPrefix('5mg'), null)
  assert.equal(drugSearchPrefix(''), null)
})

test('수출용/수출명 품목을 식별한다', () => {
  assert.equal(isExportOnly('놀텍정10밀리그램(일라프라졸)(수출용)'), true)
  assert.equal(isExportOnly('고든구강용해필름5mg(타다라필)(수출명: CALIBERI orodispersible film 5mg)'), true)
  assert.equal(isExportOnly('놀텍정10밀리그램(일라프라졸)'), false)
})

test('함량 유무를 판정한다', () => {
  assert.equal(hasStrength('리바로정2밀리그램'), true)
  assert.equal(hasStrength('콩코르정'), false)
  assert.equal(hasStrength('소론도정(프레드니솔론)'), false)
})

// ── 자동 채택해도 되는 케이스 ─────────────────────────────────────────
test('괄호 성분명만 다른 유일 후보는 채택한다 (소론도정)', () => {
  const r = matchDrugName('소론도정', [c('소론도정(프레드니솔론)')])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '소론도정(프레드니솔론)')
})

test('함량까지 일치하면 같은 계열이 여럿이어도 채택한다 (놀텍정10밀리그램)', () => {
  const r = matchDrugName('놀텍정10밀리그램', [
    c('놀텍정10밀리그램(일라프라졸)'),
    c('놀텍정20밀리그램(수출용)'),
    c('놀텍정10밀리그램(일라프라졸)(수출용)'),
  ])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '놀텍정10밀리그램(일라프라졸)')
})

test('OCR 오인식(밀→일)이어도 함량이 맞으면 채택한다 (탈리부틴정200일리그램)', () => {
  const r = matchDrugName('탈리부틴정200일리그램', [c('탈리부틴정200밀리그램(트리메부틴말레산염)')])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '탈리부틴정200밀리그램(트리메부틴말레산염)')
})

test('괄호 성분명의 오탈자는 무시하고 함량으로 맞춘다 (아타칸정16밀리그램)', () => {
  const r = matchDrugName('아타칸정16밀리그램(칸데시르탄실렉세틸)', [
    c('아타칸정16밀리그램(칸데사르탄실렉세틸)'),
    c('아타칸정8밀리그램(칸데사르탄실렉세틸)'),
    c('아타칸정32밀리그램(칸데사르탄실렉세틸)'),
  ])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '아타칸정16밀리그램(칸데사르탄실렉세틸)')
})

// ⚠️ 이 테스트는 원래 `unique` 를 단언했다 — base 정확일치만 보면 맨이름 품목이 유일해 보인다.
// 그러나 같은 계열에 농도 변형이 함께 살아 있으면, OCR 이 `1.5%` 를 흘렸을 때
// **다른 농도가 사용자의 약으로 기록된다.** 자동 채택보다 사용자 선택이 옳다.
test('함량 없는 질의: 계열에 농도 변형이 함께 있으면 채택하지 않는다 (레보클점안액)', () => {
  const r = matchDrugName('레보클점안액', [
    c('레보클점안액(레보플록사신수화물)'),
    c('레보클점안액1.5%(레보플록사신수화물)'),
  ])
  assert.equal(r.kind, 'ambiguous')
  assert.equal(r.options.length, 2)
})

test('마스터 끝 공백 때문에 정확일치가 깨지지 않는다 (울트라셋이알세미서방정)', () => {
  const r = matchDrugName('울트라셋이알세미서방정', [c('울트라셋이알세미서방정 ')])
  assert.equal(r.kind, 'unique')
})

test('기존 통과 케이스: 이름 그대로 유일하게 존재하면 채택한다 (코대원정)', () => {
  const r = matchDrugName('코대원정', [c('코대원정')])
  assert.equal(r.kind, 'unique')
})

// ── 모호해서 자동 채택하면 안 되는 케이스 (계율) ───────────────────────
test('함량만 다른 후보가 여럿이면 절대 고르지 않는다 (콩코르정 5mg/2.5mg)', () => {
  const r = matchDrugName('콩코르정', [
    c('콩코르정5밀리그램(비소프롤롤푸마르산염)'),
    c('콩코르정2.5밀리그램(비소프롤롤푸마르산염)'),
  ])
  assert.equal(r.kind, 'ambiguous')
  assert.equal(r.match, null)
  assert.equal(r.options.length, 2)
})

test('후보 3건도 마찬가지 (크레스토정)', () => {
  const r = matchDrugName('크레스토정', [
    c('크레스토정10밀리그램(로수바스타틴칼슘)'),
    c('크레스토정5밀리그램(로수바스타틴칼슘)'),
    c('크레스토정20밀리그램(로수바스타틴칼슘)'),
  ])
  assert.equal(r.kind, 'ambiguous')
  assert.equal(r.options.length, 3)
})

test('복합제 함량 조합이 여럿이면 고르지 않는다 (로수젯정)', () => {
  const r = matchDrugName('로수젯정', [
    c('로수젯정10/10밀리그램'), c('로수젯정10/20밀리그램'),
    c('로수젯정10/2.5밀리그램'), c('로수젯정10/5밀리그램'),
  ])
  assert.equal(r.kind, 'ambiguous')
})

test('제형 표기만 고쳐 후보를 찾아도 함량이 여럿이면 고르지 않는다 (뮤테란캅셀)', () => {
  const r = matchDrugName('뮤테란캅셀', [
    c('뮤테란캡슐100밀리그램(아세틸시스테인)'),
    c('뮤테란캡슐200밀리그램(아세틸시스테인)'),
  ])
  assert.equal(r.kind, 'ambiguous')
  assert.equal(r.options.length, 2)
})

test('같은 base 가 2건이면(제조사 중복 등) 고르지 않는다', () => {
  const r = matchDrugName('리바로정2밀리그램', [
    c('리바로정2밀리그램(피타바스타틴칼슘수화물)', 'a'),
    c('리바로정2밀리그램(피타바스타틴칼슘수화물)', 'b'),
    c('리바로정4밀리그램(피타바스타틴칼슘수화물)', 'c'),
  ])
  assert.equal(r.kind, 'ambiguous')
  assert.deepEqual(r.options.map(o => o.id), ['a', 'b'])
})

// ── 매칭 포기 ────────────────────────────────────────────────────────
test('후보가 없으면 none — custom_name 폴백(퇴행 아님)', () => {
  assert.equal(matchDrugName('더 파르마 카르니틴', []).kind, 'none')
  assert.equal(matchDrugName('아연이 보강된 활력 비타민 R 제텐·씨 정', []).kind, 'none')
})

test('수출용만 남으면 none', () => {
  const r = matchDrugName('고든구강용해필름5mg', [
    c('고든구강용해필름5mg(타다라필)(수출명: CALIBERI orodispersible film 5mg)'),
  ])
  assert.equal(r.kind, 'none')
})

test('빈 입력은 none', () => {
  assert.equal(matchDrugName('', [c('콩코르정5밀리그램(비소프롤롤푸마르산염)')]).kind, 'none')
  assert.equal(matchDrugName(null, [c('콩코르정5밀리그램(비소프롤롤푸마르산염)')]).kind, 'none')
})

// ── 함량 없는 질의 + 계열 다수 → 채택 금지 (2026-08-31 실측으로 추가) ──
// base 정확일치만 보면 유일해 보이지만, 같은 계열에 함량 변형이 함께 살아 있으면
// 그 "유일"은 OCR 이 함량을 흘렸을 때 **다른 함량을 붙이는** 경로가 된다.
test('함량 없는 질의: 계열에 함량 변형이 함께 있으면 ambiguous', () => {
  const pool = [
    c('코자정(로사르탄칼륨)'),
    c('코자정100밀리그램(로사르탄칼륨)'),
  ]
  const r = matchDrugName('코자정', pool)
  assert.equal(r.kind, 'ambiguous')
  assert.equal(r.options.length, 2)
})

test('함량 없는 질의: 계열이 하나뿐이면 그대로 unique', () => {
  const r = matchDrugName('소론도정', [c('소론도정(프레드니솔론)')])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '소론도정(프레드니솔론)')
})

test('질의에 함량이 있으면 계열이 여럿이어도 그 함량으로 좁혀 unique', () => {
  const r = matchDrugName('놀텍정10밀리그램', [
    c('놀텍정10밀리그램(일라프라졸)'),
    c('놀텍정20밀리그램(일라프라졸)'),
  ])
  assert.equal(r.kind, 'unique')
  assert.equal(r.match?.item_name, '놀텍정10밀리그램(일라프라졸)')
})
