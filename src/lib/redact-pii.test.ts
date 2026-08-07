import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redactPii, hasResidualRrn } from './redact-pii.ts'

// 실제 처방전 OCR 출력에 가까운 형태 (CLOVA는 줄 단위로 텍스트를 이어붙인다)
const SAMPLE = [
  '건강보험 처방전',
  '요양기관기호 12345678',
  '환자 성명 홍길동',
  '주민등록번호 900101-1234567',
  '발행 의료기관 세브란스병원 내과',
  '전화 010-1234-5678',
  '[671701890] 타이레놀정500밀리그람 1 3 5',
  '조제약국 개화약국',
].join('\n')

test('주민등록번호를 마스킹한다 (하이픈·공백·무구분자·부분마스킹)', () => {
  for (const rrn of ['900101-1234567', '900101 - 1234567', '9001011234567', '900101-1******']) {
    const out = redactPii(`주민등록번호 ${rrn}`)
    assert.ok(out.includes('[주민번호]'), `마스킹 실패: ${rrn}`)
    assert.ok(!out.includes('1234567'), `원문 잔존: ${rrn}`)
  }
})

test('환자 실명·생년월일·전화번호를 마스킹한다', () => {
  const out = redactPii(SAMPLE)
  assert.ok(!out.includes('홍길동'), '실명이 남았다')
  assert.ok(!out.includes('010-1234-5678'), '전화번호가 남았다')
  assert.ok(out.includes('[이름]') && out.includes('[전화번호]'))
  assert.equal(redactPii('생년월일 1990.01.01').includes('1990.01.01'), false)
})

test('약품 식별에 필요한 값은 보존한다 — 마스킹이 파싱을 망가뜨리면 안 된다', () => {
  const out = redactPii(SAMPLE)
  assert.ok(out.includes('671701890'), 'EDI 9자리 코드가 지워졌다')
  assert.ok(out.includes('타이레놀정500밀리그람'), '약품명이 지워졌다')
  assert.ok(out.includes('12345678'), '요양기관기호 8자리가 지워졌다')
  assert.ok(out.includes('세브란스병원') && out.includes('내과'), '병원·진료과가 지워졌다')
  assert.ok(out.includes('개화약국'), '약국명이 지워졌다')
  assert.ok(out.includes('1 3 5'), '용법 숫자가 지워졌다')
})

test('plainDigits=false 면 EAN-13 상품 바코드를 보존한다', () => {
  const barcode = '8801234567890'  // 7번째 자리가 4라 RRN 패턴과 형태가 겹친다
  assert.ok(redactPii(barcode, { plainDigits: false }).includes(barcode))
  assert.ok(!redactPii(barcode).includes(barcode), '처방전 경로에서는 마스킹되어야 한다')
  // 구분자가 있으면 바코드 경로에서도 주민번호로 보고 마스킹한다
  assert.ok(redactPii('900101-1234567', { plainDigits: false }).includes('[주민번호]'))
})

test('hasResidualRrn: 마스킹 후 잔존 여부를 판정한다', () => {
  assert.equal(hasResidualRrn(redactPii(SAMPLE)), false)
  assert.equal(hasResidualRrn('주민 900101-1234567'), true)
  assert.equal(hasResidualRrn('요양기관기호 12345678'), false, '8자리를 오탐하면 안 된다')
  assert.equal(hasResidualRrn('[671701890] 타이레놀'), false, '9자리 EDI를 오탐하면 안 된다')
})

test('정규식 lastIndex 누수가 없다 — 같은 입력을 반복 판정해도 결과가 같다', () => {
  const s = '주민 900101-1234567'
  assert.equal(hasResidualRrn(s), true)
  assert.equal(hasResidualRrn(s), true)
  assert.equal(hasResidualRrn(s), true)
})
