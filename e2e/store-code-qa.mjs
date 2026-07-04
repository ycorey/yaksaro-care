// 약국 코드 정규화 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/store-code-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoreCode } from '../src/lib/store-code.ts'

test('대문자 → 소문자', () => assert.equal(normalizeStoreCode('K7M2NPQR'), 'k7m2npqr'))
test('앞뒤 공백 제거', () => assert.equal(normalizeStoreCode('  k7m2npqr  '), 'k7m2npqr'))
// 하이픈은 코드의 일부일 수 있으므로 보존한다(예: 수동 지정 코드 yc-jl2zm4)
test('하이픈 보존', () => assert.equal(normalizeStoreCode('yc-jl2zm4'), 'yc-jl2zm4'))
test('하이픈 코드 대문자·공백 관대 해석', () => assert.equal(normalizeStoreCode('  YC-JL2ZM4 '), 'yc-jl2zm4'))
test('내부 공백은 제거(구분자로 간주)', () => assert.equal(normalizeStoreCode('yc jl2zm4'), 'ycjl2zm4'))
test('붙여넣은 전체 URL에서 코드만 추출(하이픈 포함)', () =>
  assert.equal(normalizeStoreCode('https://care.yaksaro.co.kr/store/yc-jl2zm4'), 'yc-jl2zm4'))
test('쿼리·해시 붙은 URL에서도 코드만', () =>
  assert.equal(normalizeStoreCode('care.yaksaro.co.kr/store/k7m2npqr?x=1#y'), 'k7m2npqr'))
test('빈 입력 → 빈 문자열', () => assert.equal(normalizeStoreCode(''), ''))
test('null/undefined 안전', () => assert.equal(normalizeStoreCode(undefined), ''))
