import { test } from 'node:test'
import assert from 'node:assert/strict'
import { licenseToDrugRow } from './drug-license.ts'

// 2026-10-12 상세 API(getDrugPrdtPrmsnDtlInq06) 실측 응답에서 쓰는 필드만 옮겼다
const THERA = {
  ITEM_SEQ: '202602439',
  ITEM_NAME: '테라콘드로이틴1200경구용겔(콘드로이틴설페이트나트륨)',
  ENTP_NAME: '(주)테라젠이텍스',
  ETC_OTC_CODE: '일반의약품',
  MAIN_INGR_ENG: 'Sodium Chondroitin Sulfate',
  EDI_CODE: 'null',          // 상세 API 는 빈 값을 문자열 'null' 로 준다
  CANCEL_NAME: '정상',
}

test('상세 응답 → drugs 행: 전문/일반 구분·성분을 채운다', () => {
  assert.deepEqual(licenseToDrugRow(THERA, '202602439', null), {
    item_seq: '202602439',
    item_name: '테라콘드로이틴1200경구용겔(콘드로이틴설페이트나트륨)',
    entp_name: '(주)테라젠이텍스',
    etc_otc_name: '일반의약품',
    ingredient_name: 'Sodium Chondroitin Sulfate',
    edi_code: null,
    is_canceled: false,
    image_url: null,
  })
})

test("문자열 'null'·알 수 없는 구분은 null, 취소 품목은 is_canceled", () => {
  const row = licenseToDrugRow({ ...THERA, ETC_OTC_CODE: '한약재', ENTP_NAME: 'null', CANCEL_NAME: '취소' }, '202602439', null)
  assert.equal(row.etc_otc_name, null)
  assert.equal(row.entp_name, null)
  assert.equal(row.is_canceled, true)
})

test('이름이 없으면 빈 문자열 — 호출부가 생성을 건너뛴다', () => {
  assert.equal(licenseToDrugRow({ ITEM_SEQ: '202602439' }, '202602439', null).item_name, '')
})
