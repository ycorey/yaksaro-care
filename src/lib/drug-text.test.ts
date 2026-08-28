import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitSentences, groupCautions, orderedCautions } from './drug-text.ts'

// 페니라민정 실제 주의사항 원문(운영 e약은요, 2026-08-28)
const ATPN = '이 약에 과민증 환자, 녹내장, 전립선비대 등 하부요로폐색(닫혀서 막힘)성 질환, 미숙아 및 신생아는 이 약을 복용하지 마십시오. 이 약을 복용하기 전에 3세 미만 유아, 임부 및 수유부, 고령자, 안내압(눈내부 압력) 상승, 갑상샘기능항진, 협착(좁아짐)성 소화성궤양 또는 유문십이지장 폐색, 순환계질환, 고혈압 등 심혈관 질환, 기관지염, 기관지확장증 및 천식, 간질, 간질환, 뇌졸증, 중증(심한 증상) 관상동맥부전, 발작 환자 또는 경험자는 의사 또는 약사와 상의하십시오. 이 약은 복용 후 졸음을 유발할 수 있으므로 운전 및 기계조작 시 주의하십시오.'

test('종결어미 기준으로 문장을 나눈다', () => {
  const s = splitSentences(ATPN)
  assert.equal(s.length, 3)
  assert.match(s[0], /복용하지 마십시오\.$/)
  assert.match(s[1], /상의하십시오\.$/)
  assert.match(s[2], /주의하십시오\.$/)
})

test('재조립하면 원문과 같다 — 누락·변조 0', () => {
  const s = splitSentences(ATPN)
  assert.equal(s.join(' '), ATPN)
})

test('용량 표기의 소수점에서 자르지 않는다', () => {
  const t = '만 7~12세 소아는 1회 권장용량을 4~6시간마다 복용합니다. 1일 5회(75 mg/kg)를 초과하여 복용하지 않습니다.'
  const s = splitSentences(t)
  assert.equal(s.length, 2)
  assert.ok(s[1].includes('75 mg/kg'))
})

test('비율 표기(3.0~3.7)에서 자르지 않는다', () => {
  const s = splitSentences('이 약은 엑스(3.0~3.7→1)를 함유합니다. 보관에 주의합니다.')
  assert.equal(s.length, 2)
  assert.ok(s[0].includes('3.0~3.7'))
})

test('어미로 금기·상담·주의를 가른다', () => {
  const g = groupCautions(splitSentences(ATPN))
  assert.equal(g.prohibit.length, 1)
  assert.equal(g.consult.length, 1)
  assert.equal(g.caution.length, 1)
  assert.match(g.prohibit[0], /복용하지 마십시오/)
})

test('금기 문장이 맨 앞으로 온다', () => {
  const ordered = orderedCautions(ATPN)
  assert.match(ordered[0], /복용하지 마십시오/)
  assert.equal(ordered.length, 3)
})

test('분리에 실패하면 원문을 통째로 돌려준다', () => {
  const one = '마침표가 없는 한 덩어리 텍스트'
  assert.deepEqual(orderedCautions(one), [one])
})

test('빈 값은 빈 배열', () => {
  assert.deepEqual(splitSentences(''), [])
  assert.deepEqual(splitSentences(null), [])
  assert.deepEqual(orderedCautions(undefined), [])
})

test('반복 호출이 같은 결과를 낸다', () => {
  for (let i = 0; i < 3; i++) assert.equal(splitSentences(ATPN).length, 3)
})
