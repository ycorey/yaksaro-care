// [STEP 1] 약 성분 → 만성질환(당뇨·고혈압·고지혈증) 보수적 화이트리스트.
//
// 신호는 efcy(효능) 텍스트가 아니라 성분명이다(efcy는 DB 미저장·일부 약만). drugs.ingredient_name(영문)·
// user_medications.ingredient(한글)·drug_ingredients(name_en/name_ko)에서 성분 문자열을 모아 여기에 매칭한다.
//
// 보수 원칙: 단일-질환 확신 성분 위주로 좁게 시작. 다적응증 성분(베타차단제 등)은 ambiguous로 표시해
// 정보 제공을 약화/생략한다. 허용목록에 없으면 추정하지 않는다(단정 금지).

export type Disease = '당뇨' | '고혈압' | '고지혈증'

// match: 소문자 영문 어간 또는 한글 성분의 부분문자열(염·수화물 접미사 무시 위해 어간으로).
export type IngredientRule = { match: string; disease: Disease; ambiguous?: boolean }

export const INGREDIENT_RULES: IngredientRule[] = [
  // ── 당뇨 (제2형) ─────────────────────────────────────────────
  { match: 'metformin',     disease: '당뇨' }, { match: '메트포르민',   disease: '당뇨' },
  { match: 'glimepiride',   disease: '당뇨' }, { match: '글리메피리드', disease: '당뇨' },
  { match: 'gliclazide',    disease: '당뇨' }, { match: '글리클라지드', disease: '당뇨' },
  { match: 'glibenclamide', disease: '당뇨' }, { match: 'glyburide',    disease: '당뇨' },
  { match: 'sitagliptin',   disease: '당뇨' }, { match: '시타글립틴',   disease: '당뇨' },
  { match: 'linagliptin',   disease: '당뇨' }, { match: '리나글립틴',   disease: '당뇨' },
  { match: 'vildagliptin',  disease: '당뇨' }, { match: '빌다글립틴',   disease: '당뇨' },
  { match: 'gemigliptin',   disease: '당뇨' }, { match: 'teneligliptin', disease: '당뇨' },
  { match: 'empagliflozin', disease: '당뇨' }, { match: '엠파글리플로진', disease: '당뇨' },
  { match: 'dapagliflozin', disease: '당뇨' }, { match: '다파글리플로진', disease: '당뇨' },
  { match: 'pioglitazone',  disease: '당뇨' }, { match: '피오글리타존', disease: '당뇨' },

  // ── 고혈압 ───────────────────────────────────────────────────
  { match: 'amlodipine',   disease: '고혈압' }, { match: '암로디핀',   disease: '고혈압' },
  { match: 'losartan',     disease: '고혈압' }, { match: '로사르탄',   disease: '고혈압' },
  { match: 'valsartan',    disease: '고혈압' }, { match: '발사르탄',   disease: '고혈압' },
  { match: 'telmisartan',  disease: '고혈압' }, { match: '텔미사르탄', disease: '고혈압' },
  { match: 'candesartan',  disease: '고혈압' }, { match: '칸데사르탄', disease: '고혈압' },
  { match: 'olmesartan',   disease: '고혈압' }, { match: '올메사르탄', disease: '고혈압' },
  { match: 'irbesartan',   disease: '고혈압' }, { match: 'fimasartan', disease: '고혈압' },
  { match: '피마사르탄',   disease: '고혈압' },
  { match: 'lisinopril',   disease: '고혈압' }, { match: 'ramipril',   disease: '고혈압' },
  { match: 'perindopril',  disease: '고혈압' }, { match: '페린도프릴', disease: '고혈압' },
  { match: 'lacidipine',   disease: '고혈압' }, { match: 'lercanidipine', disease: '고혈압' },
  { match: 'hydrochlorothiazide', disease: '고혈압', ambiguous: true }, // 이뇨제(부종 등과도 겹침)
  { match: 'nifedipine',   disease: '고혈압', ambiguous: true },        // 협심증과도 겹침

  // ── 고지혈증(이상지질혈증) ───────────────────────────────────
  { match: 'atorvastatin', disease: '고지혈증' }, { match: '아토르바스타틴', disease: '고지혈증' },
  { match: 'rosuvastatin', disease: '고지혈증' }, { match: '로수바스타틴',   disease: '고지혈증' },
  { match: 'simvastatin',  disease: '고지혈증' }, { match: '심바스타틴',     disease: '고지혈증' },
  { match: 'pravastatin',  disease: '고지혈증' }, { match: '프라바스타틴',   disease: '고지혈증' },
  { match: 'pitavastatin', disease: '고지혈증' }, { match: '피타바스타틴',   disease: '고지혈증' },
  { match: 'ezetimibe',    disease: '고지혈증' }, { match: '에제티미브',     disease: '고지혈증' },
  { match: 'fenofibrate',  disease: '고지혈증' }, { match: '페노피브레이트', disease: '고지혈증' },
  { match: 'rosuvastatin', disease: '고지혈증' },
]
