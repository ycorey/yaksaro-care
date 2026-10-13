import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidGtin13, normalizeBarcode } from './barcode.ts'

// 약가마스터 실제 표준코드(대효갈근 포장 2종) — 체크섬이 맞는 값
const REAL = '8800628000107'

test('EAN-13 체크섬', () => {
  assert.equal(isValidGtin13(REAL), true)
  assert.equal(isValidGtin13('8800628000114'), true)
  assert.equal(isValidGtin13('8800628000108'), false)  // 마지막 자리 오독
  assert.equal(isValidGtin13('880062800010'), false)   // 12자리
})

test('1D 바코드는 숫자만 남긴다', () => {
  assert.equal(normalizeBarcode(REAL), REAL)
  assert.equal(normalizeBarcode(` ${REAL}\n`), REAL)
})

test('GS1 DataMatrix: AI(01) GTIN-14 → 13자리', () => {
  assert.equal(normalizeBarcode(`010${REAL}1727123110ABC`), REAL)
  assert.equal(normalizeBarcode(`]d2010${REAL}21SERIAL`), REAL)
})

test('묶음 GTIN-14(포장표시자 1~8)는 표준코드가 아니다', () => {
  assert.equal(normalizeBarcode(`011${REAL}`), null)
})

test('체크섬이 틀린 오독은 버린다', () => {
  assert.equal(normalizeBarcode('8800628000108'), null)
  assert.equal(normalizeBarcode('hello'), null)
})
