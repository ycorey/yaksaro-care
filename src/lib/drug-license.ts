// 식약처 허가정보 상세(getDrugPrdtPrmsnDtlInq06) 응답 → drugs 행. 순수 함수만 둔다(단위 테스트용 —
// drug-master.ts 는 admin 클라이언트를 import 해서 node --test 로 못 읽는다).

export type LicenseDetail = {
  ITEM_SEQ?: string
  ITEM_NAME?: string
  ENTP_NAME?: string
  ETC_OTC_CODE?: string
  MAIN_INGR_ENG?: string
  EDI_CODE?: string
  CANCEL_NAME?: string
}

// 상세 API 는 빈 값을 문자열 'null' 로 준다
const val = (s: unknown): string | null =>
  typeof s === 'string' && s.trim() && s.trim() !== 'null' ? s.trim() : null

/** 허가정보 상세 → drugs 행. 컬럼 의미는 scripts/etl-drugs-license.mjs 적재와 같게 맞춘다. */
export function licenseToDrugRow(lic: LicenseDetail, itemSeq: string, imageUrl: string | null) {
  const kind = val(lic.ETC_OTC_CODE)
  return {
    item_seq:        itemSeq,
    item_name:       val(lic.ITEM_NAME) ?? '',           // 사용자 입력이 아니라 허가정보 값
    entp_name:       val(lic.ENTP_NAME),
    etc_otc_name:    kind === '전문의약품' || kind === '일반의약품' ? kind : null,
    ingredient_name: val(lic.MAIN_INGR_ENG),
    edi_code:        val(lic.EDI_CODE),
    is_canceled:     !!val(lic.CANCEL_NAME) && val(lic.CANCEL_NAME) !== '정상',
    image_url:       imageUrl,
  }
}

