export type UserRole = 'patient' | 'pharmacist'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  phone: string | null
  created_at: string
}

// 약국 (B2B)
export type Pharmacy = {
  id: string
  owner_id: string
  name: string
  license_number: string | null
  address: string | null
  phone: string | null
  subscription_status: 'trial' | 'active' | 'expired'
  created_at: string
}

// 의약품 마스터 (식약처 API 미러)
export type Drug = {
  id: string
  item_seq: string        // 식약처 품목코드
  item_name: string       // 제품명
  entp_name: string       // 제조사
  ingredient_name: string // 주성분명
  ingredient_code: string // 성분코드 (DUR 매칭용)
  etc_otc_name: '전문의약품' | '일반의약품'
  chart: string | null    // 성상
  form_code_name: string | null
  updated_at: string
}

// 건강기능식품 마스터
export type Supplement = {
  id: string
  product_seq: string     // 식약처 제품일련번호
  product_name: string
  company_name: string
  main_function: string | null
  caution: string | null
  updated_at: string
}

// 사용자 복약 프로필 (핵심 테이블)
export type UserMedication = {
  id: string
  user_id: string
  drug_id: string | null
  supplement_id: string | null
  custom_name: string | null  // OCR 미매칭 시 수동 입력
  dose: string | null
  frequency: string | null
  started_at: string | null
  ended_at: string | null
  source: 'ocr' | 'manual' | 'pharmacy'
  deleted_at: string | null
  created_at: string
  // join
  drug?: Drug
  supplement?: Supplement
}

// 처방전 (OCR 원본)
export type Prescription = {
  id: string
  user_id: string
  image_path: string      // Supabase Storage private
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed'
  ocr_raw: Record<string, unknown> | null  // GPT-4o Vision 원본 응답
  created_at: string
}

// 약물 상호작용 캐시 (DUR)
export type Interaction = {
  id: string
  drug_a_id: string
  drug_b_id: string
  severity: 'contraindicated' | 'warning' | 'monitor' | 'ok'
  description: string | null
  source: 'dur_api' | 'ruleset'
  updated_at: string
}

// 약국-환자 연결 (약사가 환자 복약 조회)
export type PharmacyPatient = {
  id: string
  pharmacy_id: string
  patient_id: string
  consent_given: boolean
  connected_at: string
}

// API 응답용 상호작용 결과
export type InteractionResult = {
  drug_a: string
  drug_b: string
  severity: Interaction['severity']
  description: string | null
}
