// screens-settings-add.jsx — 설정 + 약 추가 화면
// Exports: SettingsScreen, AddMedScreen

// ═══════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════════
function SettingsScreen({ onNavigate }) {
  const [fontSize, setFontSize] = React.useState('normal');
  const [alarmEnabled, setAlarmEnabled] = React.useState(true);
  const [alarmTimes, setAlarmTimes] = React.useState({ morning: true, afternoon: true, evening: true, night: true });

  const fontSizes = [
    { key: 'normal', label: '보통' },
    { key: 'large', label: '크게' },
    { key: 'xlarge', label: '아주 크게' },
  ];

  const alarmSlots = [
    { key: 'morning', time: '08:00', label: '아침 알림' },
    { key: 'afternoon', time: '12:30', label: '점심 알림' },
    { key: 'evening', time: '18:30', label: '저녁 알림' },
    { key: 'night', time: '22:00', label: '취침 알림' },
  ];

  function Toggle({ on, onToggle }) {
    return (
      <button onClick={onToggle} style={{
        position: 'relative', width: 48, height: 28, borderRadius: 14,
        background: on ? YC.green600 : YC.neutral300,
        border: 'none', cursor: 'pointer', flexShrink: 0,
        transition: `background 200ms ${YC.ease}`,
      }}>
        <span style={{
          position: 'absolute', top: 2, width: 24, height: 24, borderRadius: 12,
          background: '#fff', boxShadow: YC.shadowSm,
          transform: on ? 'translateX(22px)' : 'translateX(2px)',
          transition: `transform 200ms ${YC.ease}`,
        }} />
      </button>
    );
  }

  function SettingRow({ children }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 0', borderBottom: `1px solid ${YC.neutral100}`,
      }}>
        {children}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <button onClick={() => onNavigate('wallet')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>설정</h1>
        </div>

        {/* Font Size */}
        <section style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay, marginBottom: 10 }}>글자 크기</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {fontSizes.map(f => (
              <button key={f.key} onClick={() => setFontSize(f.key)} style={{
                flex: 1, height: 44, borderRadius: YC.radiusLg, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
                background: fontSize === f.key ? YC.green700 : '#fff',
                color: fontSize === f.key ? '#fff' : YC.neutral700,
                boxShadow: fontSize === f.key ? YC.shadowMd : YC.shadowSm,
                transition: `all 200ms ${YC.ease}`,
              }}>
                {f.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: YC.neutral400, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LucideIcon name="sparkles" size={12} color={YC.neutral400} />
            눈이 편한 크기로 골라보세요. 앱 전체 글자가 함께 커져요.
          </p>
        </section>

        {/* Alarms */}
        <section style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay, marginBottom: 10 }}>복약 알림</p>
          <YCCard style={{ padding: '0 20px' }}>
            <SettingRow>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LucideIcon name="clock" size={20} color={YC.neutral600} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: YC.neutral900, margin: 0 }}>복약 시간 알림</p>
                  <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>약 드실 시간에 알려드려요</p>
                </div>
              </div>
              <Toggle on={alarmEnabled} onToggle={() => setAlarmEnabled(!alarmEnabled)} />
            </SettingRow>
          </YCCard>
        </section>

        {/* Per-slot alarms */}
        <section style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay, marginBottom: 10 }}>시간대별 알림</p>
          <YCCard style={{ padding: '0 20px' }}>
            {alarmSlots.map((slot, i) => (
              <SettingRow key={slot.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: YC.neutral700, fontFamily: 'monospace', width: 48 }}>{slot.time}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: YC.neutral900 }}>{slot.label}</span>
                </div>
                <Toggle on={alarmEnabled && alarmTimes[slot.key]}
                  onToggle={() => setAlarmTimes(prev => ({ ...prev, [slot.key]: !prev[slot.key] }))} />
              </SettingRow>
            ))}
          </YCCard>
          <p style={{ fontSize: 12, color: YC.neutral400, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LucideIcon name="shield" size={12} color={YC.neutral400} />
            알림은 이 휴대폰에서만 동작하고, 약 정보는 다른 곳으로 보내지 않아요.
          </p>
        </section>

        {/* My Info */}
        <section style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay, marginBottom: 10 }}>내 정보</p>
          <YCCard style={{ padding: 0, overflow: 'hidden' }}>
            {[
              { label: '이름', value: '홍길동' },
              { label: '이메일', value: 'user@example.com' },
              { label: '역할', value: '환자·보호자' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: `1px solid ${YC.neutral100}` }}>
                <p style={{ fontSize: 12, color: YC.neutral400, margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: YC.neutral900, margin: '2px 0 0' }}>{item.value}</p>
              </div>
            ))}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <LucideIcon name="check" size={14} color={YC.green600} />
                <span style={{ color: YC.neutral700 }}>건강정보 수집·이용 동의</span>
              </div>
            </div>
          </YCCard>
        </section>

        {/* Account */}
        <section style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay, marginBottom: 10 }}>계정</p>
          <YCCard style={{ padding: 0, overflow: 'hidden' }}>
            <button style={{
              width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left', fontSize: 14, fontWeight: 600, color: YC.error,
            }}>
              로그아웃
            </button>
          </YCCard>
          <p style={{ fontSize: 12, color: YC.neutral400, textAlign: 'center', marginTop: 12 }}>
            계정 삭제·개인정보 열람 요청은 ycorey@gmail.com 으로 문의하세요.
          </p>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD MEDICATION SCREEN (약 추가 — 타입 선택 → 방법 선택 → 폼)
// ═══════════════════════════════════════════════════════════════
function AddMedScreen({ onNavigate }) {
  const [step, _setStep] = React.useState('type'); // type, rxMethod, suppMethod, form
  const [stepAnim, setStepAnim] = React.useState('fwd');
  const STEP_DEPTH = { type: 0, rxMethod: 1, suppMethod: 1, form: 2 };
  const setStep = (next) => {
    setStepAnim((STEP_DEPTH[next] ?? 0) >= (STEP_DEPTH[step] ?? 0) ? 'fwd' : 'back');
    _setStep(next);
  };
  const [formTab, setFormTab] = React.useState('prescription');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [doseAmount, setDoseAmount] = React.useState(1);
  const [dosesPerDay, setDosesPerDay] = React.useState(null);
  const [totalDays, setTotalDays] = React.useState(null);

  // Step 1: Type select
  if (step === 'type') {
    return (
      <div key={step} className={`yc-anim-${stepAnim}`} style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <button onClick={() => onNavigate('wallet')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
            </button>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>약 추가</h1>
          </div>
          <p style={{ fontSize: 13, color: YC.neutral400, marginTop: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LucideIcon name="sparkles" size={13} color={YC.neutral400} />
            어떤 약을 추가할까요?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <YCCard onClick={() => setStep('rxMethod')} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, cursor: 'pointer' }}>
              <div style={{ width: 48, height: 48, borderRadius: YC.radiusLg, background: YC.infoBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="pill" size={24} color={YC.blue500} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>처방약 · 일반약</p>
                <p style={{ fontSize: 13, color: YC.neutral400, margin: '4px 0 0' }}>약봉투·QR·건강기록에서 불러오기</p>
              </div>
            </YCCard>

            <YCCard onClick={() => setStep('suppMethod')} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, cursor: 'pointer' }}>
              <div style={{ width: 48, height: 48, borderRadius: YC.radiusLg, background: YC.green50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="leaf" size={24} color={YC.green600} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>영양제 · 보조제</p>
                <p style={{ fontSize: 13, color: YC.neutral400, margin: '4px 0 0' }}>바코드·설명서 촬영 또는 직접 입력</p>
              </div>
            </YCCard>
          </div>
        </div>
      </div>
    );
  }

  // Step 2a: Prescription method
  if (step === 'rxMethod') {
    const methods = [
      { icon: 'file-text', iconBg: YC.green700, color: '#fff', title: '건강기록에서 불러오기', desc: '최근 1년 투약내역을 한 번에', badge: '추천', action: () => { setFormTab('prescription'); setStep('form'); } },
      { icon: 'camera', iconBg: YC.blue500, color: '#fff', title: '약봉투 촬영', desc: '봉투 글씨를 사진으로 읽어요', action: () => onNavigate('ocr') },
      { icon: 'scan', iconBg: '#92600A', color: '#fff', title: '처방전 QR 스캔', desc: 'QR이 있으면 가장 정확해요', action: () => onNavigate('ocr') },
    ];
    return (
      <div key={step} className={`yc-anim-${stepAnim}`} style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <button onClick={() => setStep('type')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
            </button>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>처방약 · 일반약</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {methods.map((m, i) => (
              <YCCard key={i} onClick={m.action} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: YC.radiusLg, background: m.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name={m.icon} size={22} color={m.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{m.title}</p>
                    {m.badge && <YCBadge variant="brand" style={{ fontSize: 10 }}>{m.badge}</YCBadge>}
                  </div>
                  <p style={{ fontSize: 13, color: YC.neutral400, margin: '4px 0 0' }}>{m.desc}</p>
                </div>
              </YCCard>
            ))}
          </div>
          <p style={{ fontSize: 12, color: YC.neutral400, marginTop: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LucideIcon name="shield" size={12} color={YC.neutral400} />
            불러온 내용은 저장 전에 직접 확인·수정할 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  // Step 2b: Supplement method
  if (step === 'suppMethod') {
    const methods = [
      { icon: 'scan', iconBg: YC.green50, color: YC.green600, title: '바코드 스캔', desc: '제품 바코드로 정확히 찾기', action: () => { setFormTab('supplement'); setStep('form'); } },
      { icon: 'camera', iconBg: YC.warningBg, color: '#92600A', title: '설명서 · 라벨 촬영', desc: '성분·섭취방법을 읽어와요', action: () => onNavigate('ocr') },
      { icon: 'file-text', iconBg: YC.infoBg, color: YC.blue500, title: '직접 입력', desc: '브랜드·복용 시간 적기', action: () => { setFormTab('supplement'); setStep('form'); } },
    ];
    return (
      <div key={step} className={`yc-anim-${stepAnim}`} style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
            <button onClick={() => setStep('type')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
            </button>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>영양제 · 보조제</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {methods.map((m, i) => (
              <YCCard key={i} onClick={m.action} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: YC.radiusLg, background: m.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name={m.icon} size={22} color={m.color} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{m.title}</p>
                  <p style={{ fontSize: 13, color: YC.neutral400, margin: '4px 0 0' }}>{m.desc}</p>
                </div>
              </YCCard>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Form
  const tabs = [
    { key: 'prescription', icon: 'pill', label: '처방의약품' },
    { key: 'otc', icon: 'pill', label: '약국 일반약' },
    { key: 'supplement', icon: 'leaf', label: '영양제' },
  ];

  return (
    <div key={step} className={`yc-anim-${stepAnim}`} style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <button onClick={() => setStep(formTab === 'supplement' ? 'suppMethod' : 'rxMethod')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>
            {formTab === 'supplement' ? '영양제 · 보조제' : '처방약 · 일반약'}
          </h1>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: YC.neutral100, borderRadius: YC.radiusMd, marginTop: 16 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFormTab(t.key)} style={{
              flex: 1, height: 40, borderRadius: YC.radiusSm, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: YC.fontDisplay,
              background: formTab === t.key ? '#fff' : 'transparent',
              color: formTab === t.key ? YC.neutral900 : YC.neutral500,
              boxShadow: formTab === t.key ? YC.shadowSm : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <LucideIcon name={t.icon} size={13} color={formTab === t.key ? YC.neutral900 : YC.neutral500} />
              {t.label}
            </button>
          ))}
        </div>

        {/* OCR hint for prescription */}
        {formTab === 'prescription' && (
          <div style={{
            marginTop: 12, background: YC.infoBg, borderRadius: YC.radiusMd,
            padding: '10px 14px', fontSize: 13, color: '#1E5BA8',
          }}>
            처방전 사진이 있으면{' '}
            <button onClick={() => onNavigate('ocr')} style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', color: '#1E5BA8', cursor: 'pointer' }}>
              OCR 자동 입력
            </button>이 더 정확합니다.
          </div>
        )}

        {/* Search field */}
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral700, marginBottom: 8 }}>
            {formTab === 'supplement' ? '영양제 이름 *' : '약 이름 *'}
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', height: 48, border: `1px solid ${YC.neutral200}`,
            borderRadius: YC.radiusMd, padding: '0 14px', background: '#fff',
          }}>
            <LucideIcon name="scan" size={16} color={YC.neutral400} style={{ marginRight: 8 }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={
              formTab === 'supplement' ? '예: 종합비타민, 오메가3' : '예: 타이레놀, 아목시실린'
            } style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 14, color: YC.neutral900,
              background: 'transparent', fontFamily: YC.fontBody,
            }} />
          </div>
        </div>

        {/* Prescription specific fields */}
        {formTab === 'prescription' && (
          <>
            {/* Dose amount */}
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral700, marginBottom: 8 }}>
                1회 투약량 <span style={{ fontWeight: 400, color: YC.neutral400 }}>(정·캡슐·포 수)</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setDoseAmount(Math.max(0.5, (doseAmount || 1) - 0.5))} style={{
                  width: 48, height: 48, borderRadius: YC.radiusMd, background: YC.neutral100,
                  border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 700, color: YC.neutral700,
                }}>−</button>
                <div style={{
                  flex: 1, height: 48, borderRadius: YC.radiusMd, background: YC.neutral100,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay,
                }}>{doseAmount}</div>
                <button onClick={() => setDoseAmount(Math.min(10, (doseAmount || 0) + 0.5))} style={{
                  width: 48, height: 48, borderRadius: YC.radiusMd, background: YC.neutral100,
                  border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 700, color: YC.neutral700,
                }}>+</button>
              </div>
            </div>

            {/* Doses per day */}
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral700, marginBottom: 8 }}>1일 투여횟수</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setDosesPerDay(dosesPerDay === n ? null : n)} style={{
                    height: 48, borderRadius: YC.radiusMd, border: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
                    background: dosesPerDay === n ? YC.green600 : YC.neutral100,
                    color: dosesPerDay === n ? '#fff' : YC.neutral700,
                  }}>{n}회</button>
                ))}
              </div>
            </div>

            {/* Total days */}
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral700, marginBottom: 8 }}>총 투약일수</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[3, 5, 7, 14, 30].map(d => (
                  <button key={d} onClick={() => setTotalDays(totalDays === d ? null : d)} style={{
                    height: 48, borderRadius: YC.radiusMd, border: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
                    background: totalDays === d ? YC.green600 : YC.neutral100,
                    color: totalDays === d ? '#fff' : YC.neutral700,
                  }}>{d}일</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Submit */}
        <YCButton style={{ width: '100%', minHeight: 52, fontSize: 16, marginTop: 24 }}
          onClick={() => onNavigate('wallet')}>
          복약 목록에 추가
        </YCButton>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen, AddMedScreen });
