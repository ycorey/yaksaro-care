// 요청 마감 버킷 분류 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/request-schedule-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketByDue } from '../src/lib/request-schedule.ts'

const TODAY = '2026-07-15'
test('어제 → overdue', () => assert.equal(bucketByDue('2026-07-14', TODAY), 'overdue'))
test('오늘 → today', () => assert.equal(bucketByDue('2026-07-15', TODAY), 'today'))
test('내일 → tomorrow', () => assert.equal(bucketByDue('2026-07-16', TODAY), 'tomorrow'))
test('모레 → thisWeek', () => assert.equal(bucketByDue('2026-07-17', TODAY), 'thisWeek'))
test('+6일 → thisWeek', () => assert.equal(bucketByDue('2026-07-21', TODAY), 'thisWeek'))
test('+7일 → later', () => assert.equal(bucketByDue('2026-07-22', TODAY), 'later'))
test('null → today(누락 방지)', () => assert.equal(bucketByDue(null, TODAY), 'today'))
test('월 경계 넘김 계산', () => assert.equal(bucketByDue('2026-08-02', '2026-07-30'), 'thisWeek'))
