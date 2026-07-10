import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikePrescription, pickNamesHeuristic, cleanCategory } from './ocr-classify.ts'

// 계획서 진리표 — 처방전 판정(오분류 방지)
test('looksLikePrescription: OTC 박스 문구는 처방전 아님', () => {
  assert.equal(looksLikePrescription('타이레놀정500밀리그람 1일 3회 식후 30분 복용'), false)
})
test('looksLikePrescription: 대괄호 9자리 EDI는 처방전', () => {
  assert.equal(looksLikePrescription('[671701890] 아모잘탄정 총투약일수 5 1일투여횟수 3'), true)
})
test('looksLikePrescription: 조제·교부일 어휘는 처방전', () => {
  assert.equal(looksLikePrescription('○○약국 조제 교부일 2026-07-10'), true)
})
test('looksLikePrescription: 건기식 박스는 처방전 아님', () => {
  assert.equal(looksLikePrescription('건강기능식품 비타민C 1000mg 1일 1회'), false)
})
test('looksLikePrescription: 13자리 바코드(대괄호 없음)는 EDI 아님', () => {
  assert.equal(looksLikePrescription('8801234567890 타이레놀'), false)
})
test('looksLikePrescription: 공백 변형 어휘도 매칭', () => {
  assert.equal(looksLikePrescription('1일 투여 횟수 3'), true)
  assert.equal(looksLikePrescription('1회 투약량 1정'), true)
})

// 허가정보 분류 텍스트 정리
test('cleanCategory: 대괄호 코드 접두 제거', () => {
  assert.equal(cleanCategory('[02390]기타의 소화기관용약'), '기타의 소화기관용약')
})
test('cleanCategory: 대괄호 없으면 그대로(trim)', () => {
  assert.equal(cleanCategory('  해열진통제 '), '해열진통제')
})
test('cleanCategory: 빈/undefined → null', () => {
  assert.equal(cleanCategory(undefined), null)
  assert.equal(cleanCategory(''), null)
  assert.equal(cleanCategory('[02390]'), null)
})

// GPT 미사용 폴백 후보 추출
test('pickNamesHeuristic: 한글 제품명만, 단위/숫자줄 제외, 최대 3', () => {
  const raw = [
    '타이레놀',            // OK
    '500mg 24정',          // 단위/숫자 → 제외
    '아세트아미노펜',       // OK
    '효능효과',            // UNIT_RE(효능/효과) → 제외
    '게보린',              // OK
    '펜잘큐',              // OK (4번째 → 잘림)
  ].join('\n')
  const names = pickNamesHeuristic(raw)
  assert.deepEqual(names, ['타이레놀', '아세트아미노펜', '게보린'])
})
test('pickNamesHeuristic: 중복 제거', () => {
  assert.deepEqual(pickNamesHeuristic('부루펜\n부루펜\n부루펜'), ['부루펜'])
})
