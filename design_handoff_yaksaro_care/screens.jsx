// screens.jsx — 약사로케어 5 Core Screens
// Exports: LandingScreen, HomeScreen, WalletScreen, TodayScreen, OcrScreen

// ═══════════════════════════════════════════════════════════════
// 1. LANDING SCREEN
// ═══════════════════════════════════════════════════════════════
function LandingScreen({ onNavigate }) {
  // null | { provider: 'kakao'|'google', phase: 'loading'|'success' }
  const [login, setLogin] = React.useState(null);

  function startLogin(provider) {
    if (login) return;
    setLogin({ provider, phase: 'loading' });
    setTimeout(() => setLogin({ provider, phase: 'success' }), 1100);
    setTimeout(() => onNavigate('home'), 1900);
  }

  return (
    <div style={{ height: '100%', background: YC.pageBg, fontFamily: YC.fontBody, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
        </header>

        {/* Hero */}
        <section style={{ paddingTop: 22, paddingBottom: 18 }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: YC.neutral900, marginBottom: 8, fontFamily: YC.fontBody, lineHeight: 1.45 }}>
            병원 갈 때 무슨 약 먹는지 기억나시나요?
          </p>
          <h1 style={{ fontWeight: 900, color: YC.neutral900, fontFamily: YC.fontDisplay, lineHeight: 1.18, letterSpacing: '-0.03em', margin: 0 }}>
            <span style={{ fontSize: 40 }}>이제 드시는 약,</span><br/>
            <span style={{ fontSize: 33 }}>3초 만에 보여주세요.</span>
          </h1>
          <p style={{ fontSize: 15, color: YC.neutral500, lineHeight: 1.5, marginTop: 14, fontFamily: YC.fontBody, whiteSpace: 'nowrap' }}>
            한 곳에 담아두는 디지털 약 지갑,{' '}
            <span style={{ fontWeight: 800, fontSize: 18, color: YC.neutral800, fontFamily: YC.fontDisplay }}>약사<span style={{ color: YC.green600 }}>로</span>케어</span>
          </p>
        </section>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => startLogin('kakao')} disabled={!!login} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '16px 16px', borderRadius: YC.radiusMd, border: 'none',
            cursor: login ? 'default' : 'pointer',
            background: '#FEE500', color: '#191919', fontSize: 15, fontWeight: 700, fontFamily: YC.fontDisplay,
            opacity: login && login.provider !== 'kakao' ? 0.45 : 1,
            transition: `opacity 200ms ${YC.ease}`,
          }}>
            {login && login.provider === 'kakao' ? (
              <><span className="yc-spin" style={{ width: 18, height: 18, border: '2.5px solid rgba(25,25,25,0.25)', borderTopColor: '#191919', borderRadius: '50%', display: 'inline-block' }} /> 로그인 중...</>
            ) : (
              <><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M12 3C6.477 3 2 6.477 2 10.545c0 2.55 1.523 4.797 3.834 6.205L4.75 20.25a.3.3 0 0 0 .434.327l4.383-2.9A11.28 11.28 0 0 0 12 17.818c5.523 0 10-3.476 10-7.773S17.523 3 12 3Z" fill="#191919"/></svg>
            카카오톡으로 바로 시작하기</>
            )}
          </button>
          <button onClick={() => startLogin('google')} disabled={!!login} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 16px', borderRadius: YC.radiusMd,
            cursor: login ? 'default' : 'pointer',
            background: '#fff', color: YC.neutral900, fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
            border: `1px solid ${YC.neutral200}`, boxShadow: YC.shadowSm,
            opacity: login && login.provider !== 'google' ? 0.45 : 1,
            transition: `opacity 200ms ${YC.ease}`,
          }}>
            {login && login.provider === 'google' ? (
              <><span className="yc-spin" style={{ width: 18, height: 18, border: `2.5px solid ${YC.neutral200}`, borderTopColor: YC.neutral700, borderRadius: '50%', display: 'inline-block' }} /> 로그인 중...</>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335"/></svg>
            구글 아이디로 시작하기</>
            )}
          </button>

          {/* Trust footer — directly under Google button */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 2px 0' }}>
            <LucideIcon name="shield" size={13} color={YC.neutral400} style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: YC.neutral400, lineHeight: 1.45, margin: 0 }}>
              민감 개인정보는 즉시 비식별화 후 파기 · 복약 기록·참고 서비스이며 의학적 판단을 대체하지 않습니다.
            </p>
          </div>
        </div>

        {/* Compact Preview — 3 rows */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, justifyContent: 'flex-start' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.05em', fontFamily: YC.fontDisplay }}>
            내 약 지갑은 이렇게 정리됩니다
          </p>

          {/* Prescription — compact row */}
          <YCCard style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: YC.radiusSm, background: YC.infoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LucideIcon name="store" size={18} color={YC.blue500} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>서울내과 처방약</p>
              <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>아모잘탄, 리피토, 트라젠타 외 2종</p>
            </div>
            <YCBadge variant="info" style={{ fontSize: 11 }}>5종</YCBadge>
          </YCCard>

          {/* Supplement — compact row */}
          <YCCard variant="brand" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: YC.radiusSm, background: '#fff', border: `1px solid #89CCB3`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LucideIcon name="leaf" size={18} color={YC.green600} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: YC.green700, fontFamily: YC.fontDisplay, margin: 0 }}>상시 영양제</p>
              <p style={{ fontSize: 12, color: YC.green600, margin: '2px 0 0' }}>종합비타민, 오메가3, 유산균, 홍삼정</p>
            </div>
            <YCBadge variant="brand" style={{ fontSize: 11 }}>4종</YCBadge>
          </YCCard>

          {/* OTC — compact chips */}
          <YCCard style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: YC.radiusSm, background: YC.neutral100, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LucideIcon name="pill" size={18} color={YC.neutral500} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: YC.neutral700, fontFamily: YC.fontDisplay, margin: 0 }}>약국 일반약</p>
              <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>타이레놀, 훼스탈, 판콜에이</p>
            </div>
          </YCCard>
        </section>
      </div>

      {/* Login success overlay */}
      {login && login.phase === 'success' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: `linear-gradient(160deg, ${YC.green600}, ${YC.green700})`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
          animation: 'yc-fade-in 300ms ease',
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'yc-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LucideIcon name="check" size={32} color={YC.green600} strokeWidth={3} />
            </div>
          </div>
          <p style={{ fontSize: 19, fontWeight: 800, color: '#fff', fontFamily: YC.fontDisplay, margin: 0 }}>
            로그인 완료
          </p>
          <p style={{ fontSize: 14, color: '#A8D5B8', margin: 0 }}>
            내 약 지갑을 불러오는 중...
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2. HOME SCREEN
// ═══════════════════════════════════════════════════════════════
function HomeScreen({ onNavigate }) {
  const now = new Date();
  const h = now.getHours();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
  const greet = h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후에요' : '좋은 저녁이에요';

  // Dose slots (matches today timeline) — morning checked by demo, rest computed live
  const SLOTS = [
    { key: 'morning', label: '아침', h: 8, m: 0 },
    { key: 'afternoon', label: '점심', h: 12, m: 30 },
    { key: 'evening', label: '저녁', h: 19, m: 0 },
  ];
  const doneKeys = ['morning'];
  const doneCount = doneKeys.length;
  const totalSlots = SLOTS.length;
  const nowMin = h * 60 + now.getMinutes();
  const fmtTime = s => `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`;
  const fmtElapsed = mins => {
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return hh > 0 ? (mm > 0 ? `${hh}시간 ${mm}분 지났어요` : `${hh}시간 지났어요`) : `${mm}분 지났어요`;
  };
  // Overdue: a pending slot whose time passed by 30+ min
  const overdue = SLOTS.filter(s => !doneKeys.includes(s.key))
    .map(s => ({ s, elapsed: nowMin - (s.h * 60 + s.m) }))
    .find(o => o.elapsed >= 30) || null;
  // Next pending upcoming slot
  const nextSlot = SLOTS.find(s => !doneKeys.includes(s.key) && (s.h * 60 + s.m) > nowMin);
  const allDone = doneCount >= totalSlots;

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
          <button onClick={() => onNavigate('settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <LucideIcon name="settings" size={22} color={YC.neutral400} />
          </button>
        </div>

        {/* Date + Greeting */}
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 14, color: YC.neutral500, margin: 0 }}>{dateStr}</p>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '4px 0 0', letterSpacing: '-0.02em' }}>
            {greet}
          </h1>
        </div>

        {/* Notification Card — overdue / next / done */}
        <div onClick={() => onNavigate('today')} style={{
          marginTop: 20, borderRadius: YC.radiusLg, padding: 20, cursor: 'pointer',
          background: allDone
            ? `linear-gradient(135deg, ${YC.green600}, ${YC.green700})`
            : overdue
              ? `linear-gradient(135deg, #C77A12, #9A5A06)`
              : `linear-gradient(135deg, ${YC.green600}, ${YC.green700})`,
          boxShadow: overdue ? '0 8px 24px rgba(199,122,18,0.28)' : '0 8px 24px rgba(14,110,84,0.25)',
        }}>
          {allDone ? (
            <React.Fragment>
              <p style={{ fontSize: 13, color: '#A8D5B8', fontWeight: 600, margin: 0, fontFamily: YC.fontDisplay }}>오늘 복약 완료</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0 0', fontFamily: YC.fontDisplay, lineHeight: 1.25, display: 'flex', alignItems: 'center', gap: 8 }}>
                모두 챙기셨어요 <LucideIcon name="check" size={22} color="#fff" strokeWidth={3} />
              </p>
              <p style={{ fontSize: 13, color: '#A8D5B8', marginTop: 12, margin: '12px 0 0' }}>오늘의 {totalSlots}번 복약을 모두 완료했습니다</p>
            </React.Fragment>
          ) : overdue ? (
            <React.Fragment>
              <p style={{ fontSize: 13, color: '#FBE6C2', fontWeight: 600, margin: 0, fontFamily: YC.fontDisplay }}>잊지 않으셨죠?</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0 0', fontFamily: YC.fontDisplay, lineHeight: 1.25 }}>
                {overdue.s.label} 약 드실 시간이에요
              </p>
              <p style={{ fontSize: 13, color: '#FBE6C2', margin: '6px 0 0' }}>{fmtTime(overdue.s)} · {fmtElapsed(overdue.elapsed)}</p>
              <div style={{ marginTop: 14, background: 'rgba(120,70,5,0.45)', borderRadius: 8, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 8, background: '#FCD089', width: `${(doneCount / totalSlots) * 100}%`, transition: 'width 300ms' }} />
              </div>
              <p style={{ fontSize: 13, color: '#FBE6C2', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                오늘 {totalSlots}번 중 {doneCount}번 챙김
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p style={{ fontSize: 13, color: '#A8D5B8', fontWeight: 600, margin: 0, fontFamily: YC.fontDisplay }}>다음 복약 시간</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0 0', fontFamily: YC.fontDisplay, lineHeight: 1.25 }}>
                {nextSlot ? (() => {
                  const diff = (nextSlot.h * 60 + nextSlot.m) - nowMin;
                  const dh = Math.floor(diff / 60), dm = diff % 60;
                  return `${nextSlot.label} 약 · ${dh > 0 ? dh + '시간 ' : ''}${dm}분 후`;
                })() : '오늘 복약을 챙겨보세요'}
              </p>
              <div style={{ marginTop: 16, background: 'rgba(13,61,34,0.5)', borderRadius: 8, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 8, background: '#4CAF7D', width: `${(doneCount / totalSlots) * 100}%`, transition: 'width 300ms' }} />
              </div>
              <p style={{ fontSize: 13, color: '#A8D5B8', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <LucideIcon name="leaf" size={14} color="#A8D5B8" />
                오늘 {totalSlots}번 중 {doneCount}번 챙김
              </p>
            </React.Fragment>
          )}
        </div>

        {/* 2x2 Grid */}
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral500, fontFamily: YC.fontDisplay, marginBottom: 12 }}>무엇을 도와드릴까요</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { id: 'wallet', icon: 'wallet', iconColor: YC.blue500, iconBg: YC.infoBg, title: '내 약지갑', desc: '처방·영양제를 묶음으로 보관해요', stat: '약 8종' },
              { id: 'today', icon: 'heart', iconColor: YC.green600, iconBg: YC.green50, title: '오늘 복약', desc: '시간대별로 약을 체크해요', stat: `${doneCount} / ${totalSlots} 챙김` },
              { id: 'calendar', icon: 'calendar', iconColor: '#E8A817', iconBg: YC.warningBg, title: '복약 캘린더', desc: '날짜별 복용 기록을 봐요', stat: null },
              { id: 'share', icon: 'send', iconColor: YC.green600, iconBg: YC.green50, title: '의사·약사 보여주기', desc: '진료·조제 시 한 화면으로', stat: null },
            ].map(item => (
              <YCCard key={item.id} onClick={() => onNavigate(item.id)} style={{ padding: 16, cursor: 'pointer' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: YC.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.iconBg, marginBottom: 12,
                }}>
                  <LucideIcon name={item.icon} size={20} color={item.iconColor} filled={item.icon === 'heart'} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0, lineHeight: 1.3 }}>{item.title}</p>
                <p style={{ fontSize: 12, color: YC.neutral500, margin: '4px 0 0', lineHeight: 1.4 }}>{item.desc}</p>
                {item.stat && <p style={{ fontSize: 12, fontWeight: 700, color: YC.green600, margin: '8px 0 0', fontFamily: YC.fontDisplay }}>{item.stat}</p>}
              </YCCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. WALLET SCREEN
// ═══════════════════════════════════════════════════════════════

// Single medication row — photo + name(ingredient) + dosage + category + efficacy toggle + edit/delete
function MedRow({ med, isLast }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // view | edit | confirmDelete | deleted
  const hasDetail = med.efcy || med.useMethod || med.atpn;

  if (mode === 'deleted') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
        borderBottom: isLast ? 'none' : `1px solid ${YC.neutral100}`, background: YC.neutral50,
      }}>
        <LucideIcon name="check" size={15} color={YC.neutral400} />
        <span style={{ fontSize: 13, color: YC.neutral400 }}>{med.name} 삭제됨</span>
        <button onClick={() => setMode('view')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: YC.green600 }}>되돌리기</button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px',
      borderBottom: isLast ? 'none' : `1px solid ${YC.neutral100}`,
    }}>
      {/* Photo / initial */}
      <div style={{
        width: 44, height: 44, borderRadius: YC.radiusFull, background: YC.infoBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <LucideIcon name="pill" size={20} color={YC.blue500} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {mode === 'edit' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{med.name}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['1회량', '1일 횟수', '총 일수'].map((lbl, idx) => (
                <label key={lbl} style={{ flex: 1, fontSize: 11, color: YC.neutral400 }}>
                  {lbl}
                  <input defaultValue={['1', '1', '14'][idx]} inputMode="numeric" style={{
                    width: '100%', border: `1px solid ${YC.neutral300}`, borderRadius: 8,
                    padding: '6px 8px', fontSize: 13, marginTop: 2, fontFamily: YC.fontBody,
                  }} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
              <button onClick={() => setMode('view')} style={{
                flex: 1, height: 40, borderRadius: 8, background: YC.blue500, color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
              }}>저장</button>
              <button onClick={() => setMode('view')} style={{
                flex: 1, height: 40, borderRadius: 8, background: '#fff', color: YC.neutral600,
                border: `1px solid ${YC.neutral300}`, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: YC.fontDisplay,
              }}>취소</button>
            </div>
          </div>
        ) : (
          <React.Fragment>
            <p style={{ fontSize: 16, fontWeight: 700, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0, lineHeight: 1.3 }}>
              {med.name}
              {med.ingredient && <span style={{ fontSize: 13, fontWeight: 400, color: YC.neutral400, marginLeft: 4 }}>({med.ingredient})</span>}
            </p>
            <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>{med.sub}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: YC.blue500, margin: '6px 0 0' }}>{med.dosage}</p>

            {/* Category badges */}
            {(med.category || med.classType) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {med.category && <YCBadge variant="info" style={{ fontSize: 11 }}>{med.category}</YCBadge>}
                {med.classType && <YCBadge style={{ fontSize: 11 }}>{med.classType}</YCBadge>}
              </div>
            )}

            {med.hasWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <LucideIcon name="alert-triangle" size={13} color={YC.warning} />
                <span style={{ fontSize: 12, color: '#92600A', fontWeight: 600 }}>알려진 상호작용 정보가 있습니다</span>
              </div>
            )}

            {/* Efficacy toggle */}
            {hasDetail && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setOpen(o => !o)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  fontSize: 13, fontWeight: 600, color: YC.blue500, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <LucideIcon name="info" size={14} color={YC.blue500} />
                  {open ? '닫기' : '이 약은 어떤 약인가요?'}
                  <LucideIcon name="chevron-right" size={13} color={YC.blue500} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: `transform 200ms ${YC.ease}` }} />
                </button>
                {open && (
                  <div style={{ background: YC.infoBg, borderRadius: 10, padding: '12px 14px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {med.efcy && <p style={{ fontSize: 13, color: YC.neutral700, lineHeight: 1.55, margin: 0 }}><span style={{ fontWeight: 700 }}>효능·효과 </span>{med.efcy}</p>}
                    {med.useMethod && <p style={{ fontSize: 13, color: YC.neutral700, lineHeight: 1.55, margin: 0 }}><span style={{ fontWeight: 700 }}>복용법 </span>{med.useMethod}</p>}
                    {med.atpn && <p style={{ fontSize: 13, color: YC.neutral700, lineHeight: 1.55, margin: 0 }}><span style={{ fontWeight: 700 }}>주의사항 </span>{med.atpn}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Edit / Delete */}
            {mode === 'confirmDelete' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 13, color: YC.neutral500 }}>삭제할까요?</span>
                <button onClick={() => setMode('deleted')} style={{
                  fontSize: 13, fontWeight: 700, color: YC.error, padding: '4px 12px', borderRadius: 8,
                  background: YC.errorBg, border: 'none', cursor: 'pointer',
                }}>예, 삭제</button>
                <button onClick={() => setMode('view')} style={{
                  fontSize: 13, color: YC.neutral500, padding: '4px 12px', borderRadius: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                }}>아니오</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <button onClick={() => setMode('edit')} style={{ fontSize: 13, color: YC.neutral500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>수정</button>
                <button onClick={() => setMode('confirmDelete')} style={{ fontSize: 13, color: YC.neutral500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>삭제</button>
              </div>
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

function WalletScreen({ onNavigate }) {
  const [expandedRx, setExpandedRx] = React.useState('seoul');
  const prescriptions = [
    {
      id: 'seoul', hospital: '서울내과', date: '2026-05-28', count: 5, expiry: '6월 11일 · D-8', expired: false,
      meds: [
        { name: '아모잘탄정 5/50mg', ingredient: '암로디핀/로사르탄', sub: '한미약품', dosage: '1회 1정 · 1일 1회 · 14일분', category: '고혈압약', classType: '전문의약품', hasWarning: false, efcy: '본태성 고혈압 치료에 사용합니다.', useMethod: '1일 1회, 1회 1정을 복용합니다.', atpn: '갑작스러운 중단은 피하고 약사와 상담하세요.' },
        { name: '리피토정 10mg', ingredient: '아토르바스타틴', sub: '한국화이자', dosage: '1회 1정 · 1일 1회 · 14일분', category: '고지혈증약', classType: '전문의약품', hasWarning: false, efcy: '혈중 콜레스테롤 수치를 낮추는 데 사용합니다.', useMethod: '1일 1회, 저녁 식사 후 복용을 권장합니다.', atpn: '근육통이 지속되면 약사·의사와 상담하세요.' },
        { name: '트라젠타정 5mg', ingredient: '리나글립틴', sub: '베링거인겔하임', dosage: '1회 1정 · 1일 1회 · 14일분', category: '당뇨병약', classType: '전문의약품', hasWarning: true, efcy: '제2형 당뇨병의 혈당 조절에 사용합니다.', useMethod: '1일 1회, 매일 같은 시간에 복용합니다.', atpn: '다른 당뇨약과 함께 복용 시 주의가 필요할 수 있습니다.' },
        { name: '아스피린프로텍트 100mg', ingredient: '아세틸살리실산', sub: '바이엘코리아', dosage: '1회 1정 · 1일 1회 · 14일분', category: '항혈소판제', classType: '전문의약품', hasWarning: false, efcy: '혈전 생성을 억제하는 데 사용합니다.', useMethod: '1일 1회, 충분한 물과 함께 복용합니다.', atpn: '위장 장애가 있으면 약사와 상담하세요.' },
        { name: '란스톤엘에프디티정', ingredient: '란소프라졸', sub: '태극제약', dosage: '1회 1정 · 1일 1회 · 14일분', category: '위산분비억제제', classType: '전문의약품', hasWarning: false, efcy: '위산 분비를 줄여 위·식도 질환에 사용합니다.', useMethod: '1일 1회, 식전 복용을 권장합니다.', atpn: '장기 복용 시 약사와 상담하세요.' },
      ],
    },
  ];
  const supplements = [
    { name: '종합비타민', sub: '뉴트리원' },
    { name: '오메가3', sub: '고려은단' },
    { name: '유산균', sub: '종근당건강' },
    { name: '홍삼정', sub: '정관장' },
  ];
  const otc = ['타이레놀', '훼스탈', '판콜에이'];

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onNavigate('settings')} style={{
              width: 40, height: 40, borderRadius: YC.radiusMd, background: YC.neutral100,
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LucideIcon name="settings" size={18} color={YC.neutral500} />
            </button>
            <YCButton size="sm" icon="plus" onClick={() => onNavigate('addmed')}>추가</YCButton>
          </div>
        </div>

        {/* Section title */}
        <div style={{ marginTop: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>내 약지갑</h1>
          <p style={{ fontSize: 13, color: YC.neutral400, margin: '2px 0 0' }}>종류별로 나눠서 한눈에</p>
        </div>

        {/* Meal Checks Quick */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          {[
            { label: '아침', time: '08:00', done: true },
            { label: '점심', time: '12:30', done: false },
            { label: '저녁', time: '19:00', done: false },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: YC.radiusMd,
              background: s.done ? YC.green50 : '#fff',
              border: `1px solid ${s.done ? '#89CCB3' : YC.neutral200}`,
            }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: s.done ? YC.green600 : YC.neutral400, fontFamily: YC.fontDisplay, margin: 0 }}>
                {s.done && <LucideIcon name="check" size={12} color={YC.green600} style={{ marginRight: 2 }} />}
                {s.label}
              </p>
              <p style={{ fontSize: 11, color: s.done ? YC.green600 : YC.neutral400, margin: '2px 0 0' }}>{s.time}</p>
            </div>
          ))}
        </div>

        {/* Category: Prescription */}
        <div style={{ marginTop: 24 }}>
          <SectionHeader icon iconColor={YC.blue500} label="처방약 · 일반약" count={prescriptions.reduce((s, g) => s + g.meds.length, 0) + otc.length} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prescriptions.map(rx => (
              <YCCard key={rx.id} style={{ padding: 0, overflow: 'hidden' }}>
                <button onClick={() => setExpandedRx(expandedRx === rx.id ? null : rx.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <LucideIcon name="store" size={16} color={YC.blue500} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay }}>{rx.hospital}</span>
                    </div>
                    <p style={{ fontSize: 12, color: YC.neutral400, margin: '4px 0 0' }}>
                      {rx.date} · {rx.count}종
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <YCBadge variant="info" style={{ fontSize: 11 }}>{rx.expiry}</YCBadge>
                    <LucideIcon name="chevron-right" size={16} color={YC.neutral400}
                      style={{ transform: expandedRx === rx.id ? 'rotate(90deg)' : 'none', transition: `transform 200ms ${YC.ease}` }} />
                  </div>
                </button>
                {expandedRx === rx.id && (
                  <div style={{ borderTop: `1px solid ${YC.neutral100}` }}>
                    {rx.meds.map((m, i) => (
                      <MedRow key={i} med={m} isLast={i === rx.meds.length - 1} />
                    ))}
                  </div>
                )}
              </YCCard>
            ))}

            {/* OTC */}
            <YCCard style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <LucideIcon name="pill" size={16} color={YC.neutral500} />
                <span style={{ fontSize: 13, fontWeight: 700, color: YC.neutral500, fontFamily: YC.fontDisplay }}>약국 일반약</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {otc.map(n => <YCBadge key={n}><LucideIcon name="pill" size={12} />{n}</YCBadge>)}
              </div>
            </YCCard>
          </div>
        </div>

        {/* Category: Supplements */}
        <div style={{ marginTop: 24 }}>
          <SectionHeader icon iconColor={YC.green600} label="영양제 · 보조제" count={supplements.length} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {supplements.map((s, i) => (
              <YCCard key={i} variant="brand" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: YC.radiusFull, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  border: `1px solid #89CCB3`,
                }}>
                  <LucideIcon name="leaf" size={18} color={YC.green600} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: YC.green700, fontFamily: YC.fontDisplay, margin: 0 }}>{s.name}</p>
                  <p style={{ fontSize: 12, color: YC.green600, margin: '2px 0 0' }}>{s.sub}</p>
                </div>
              </YCCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. TODAY SCREEN
// ═══════════════════════════════════════════════════════════════
function TodayScreen({ onNavigate }) {
  const [slots, setSlots] = React.useState([
    { meal: 'morning', label: '아침', time: '08:00', checked: true, checkedAt: '오전 8:12' },
    { meal: 'afternoon', label: '점심', time: '12:30', checked: false, checkedAt: null },
    { meal: 'evening', label: '저녁', time: '19:00', checked: false, checkedAt: null },
  ]);
  const [justChecked, setJustChecked] = React.useState(null);
  const [celebrate, setCelebrate] = React.useState(false);
  const medCount = 8;
  const doneCount = slots.filter(s => s.checked).length;
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();

  function toggleCheck(meal) {
    setSlots(prev => {
      const next = prev.map(s =>
        s.meal === meal ? {
          ...s,
          checked: !s.checked,
          checkedAt: !s.checked ? `${now.getHours() >= 12 ? '오후' : '오전'} ${now.getHours() > 12 ? now.getHours() - 12 : now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` : null,
        } : s
      );
      const wasChecking = !prev.find(s => s.meal === meal).checked;
      if (wasChecking) {
        setJustChecked(meal);
        setTimeout(() => setJustChecked(cur => cur === meal ? null : cur), 700);
        // All complete → celebrate
        if (next.every(s => s.checked)) {
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 2800);
        }
      }
      return next;
    });
  }

  const confetti = React.useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      left: 6 + (i * 5.6) % 88,
      delay: (i % 6) * 110,
      dur: 1700 + (i % 4) * 350,
      color: [YC.green600, YC.lime300, YC.blue500, YC.warning][i % 4],
      rot: (i * 47) % 360,
      size: 8 + (i % 3) * 3,
    })), []);

  // Find overdue slot
  const overdueSlot = slots.find(s => !s.checked && curMin >= (parseInt(s.time) * 60 + parseInt(s.time.split(':')[1])) + 30);

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80, position: 'relative' }}>
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '12px 0 0' }}>
          오늘 복약
        </h1>

        {/* Overdue Banner */}
        {overdueSlot && (
          <div style={{
            marginTop: 16, borderRadius: YC.radiusLg, padding: '16px 20px',
            background: YC.warningBg, border: `1px solid ${YC.warning}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#7A5A00', fontFamily: YC.fontDisplay, margin: 0 }}>
                {overdueSlot.label} 약 드실 시간이 지났어요
              </p>
              <p style={{ fontSize: 13, color: '#92600A', margin: '4px 0 0' }}>{overdueSlot.time}</p>
            </div>
            <YCButton size="sm" onClick={() => toggleCheck(overdueSlot.meal)}>지금 먹기</YCButton>
          </div>
        )}

        {/* Summary */}
        <p style={{ fontSize: 14, color: YC.neutral500, margin: '16px 0 12px' }}>
          오늘 {doneCount}/{slots.length} 챙김
        </p>

        {/* Timeline */}
        <YCCard style={{ padding: 0, overflow: 'hidden' }}>
          {slots.map((s, i) => {
            const slotMin = parseInt(s.time) * 60 + parseInt(s.time.split(':')[1]);
            const isNext = !s.checked && slots.findIndex(x => !x.checked) === i;
            return (
              <div key={s.meal} style={{
                display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px',
                borderBottom: i < slots.length - 1 ? `1px solid ${YC.neutral100}` : 'none',
                borderLeft: isNext ? `4px solid ${YC.green600}` : '4px solid transparent',
                background: isNext ? YC.green50 + '40' : s.checked ? 'transparent' : 'transparent',
                opacity: s.checked ? 0.55 : 1,
                transition: `all 200ms ${YC.ease}`,
              }}>
                {/* Time */}
                <div style={{ width: 48, flexShrink: 0, paddingTop: 2 }}>
                  <p style={{ fontSize: 12, color: YC.neutral400, margin: 0 }}>{s.time}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: YC.neutral700, fontFamily: YC.fontDisplay, margin: '2px 0 0' }}>{s.label}</p>
                </div>
                {/* Node */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6 }}>
                  <span className={justChecked === s.meal ? 'yc-check-pop' : undefined} style={{
                    width: 12, height: 12, borderRadius: YC.radiusFull,
                    background: s.checked ? YC.green600 : isNext ? '#fff' : YC.neutral200,
                    border: isNext ? `2px solid ${YC.green600}` : 'none',
                    boxShadow: isNext ? `0 0 0 4px ${YC.green50}` : 'none',
                  }} />
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: YC.neutral900, margin: 0 }}>약 {medCount}개</p>
                  {s.checked ? (
                    <button onClick={() => toggleCheck(s.meal)} className={justChecked === s.meal ? 'yc-checked-flash' : undefined} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4,
                      fontSize: 14, color: YC.green600, fontWeight: 600,
                    }}>
                      <LucideIcon name="check" size={14} color={YC.green600} style={{ marginRight: 4 }} />
                      {justChecked === s.meal ? '쪼아요! 복용 완료' : `${s.checkedAt} 복용`}
                      {justChecked !== s.meal && <span style={{ color: YC.neutral400, fontWeight: 400, marginLeft: 6 }}>· 되돌리기</span>}
                    </button>
                  ) : (
                    <YCButton
                      variant={isNext ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => toggleCheck(s.meal)}
                      style={{ marginTop: 8, width: '100%', minHeight: 44 }}
                    >
                      지금 먹기
                    </YCButton>
                  )}
                </div>
              </div>
            );
          })}
        </YCCard>

        {doneCount === slots.length && (
          <div style={{
            marginTop: 16, borderRadius: YC.radiusLg, padding: '16px 20px', textAlign: 'center',
            background: YC.green50, border: `1px solid #89CCB3`,
          }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: YC.green600, fontFamily: YC.fontDisplay, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <LucideIcon name="check" size={18} color={YC.green600} strokeWidth={3} />
              오늘 복약 모두 완료!
            </p>
            <p style={{ fontSize: 13, color: YC.green700, margin: '4px 0 0' }}>매일 챙기는 습관, 잘하고 계세요</p>
          </div>
        )}

        <p style={{ fontSize: 11, color: YC.neutral400, textAlign: 'center', lineHeight: 1.6, marginTop: 24, paddingBottom: 20 }}>
          이 앱은 복약 정보 기록·참고 서비스입니다.<br/>의학적 진단·처방을 대체하지 않습니다.
        </p>
      </div>

      {/* Completion celebration overlay */}
      {celebrate && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
          background: 'rgba(250,250,245,0.86)', backdropFilter: 'blur(2px)',
          animation: 'yc-fade-in 250ms ease',
        }}
        onClick={() => setCelebrate(false)}>
          {/* Confetti */}
          {confetti.map((c, i) => (
            <span key={i} className="yc-confetti" style={{
              position: 'absolute', top: -20, left: `${c.left}%`,
              width: c.size, height: c.size * 1.4, background: c.color, borderRadius: 2,
              transform: `rotate(${c.rot}deg)`,
              animationDelay: `${c.delay}ms`, animationDuration: `${c.dur}ms`,
            }} />
          ))}
          {/* Badge */}
          <div style={{
            width: 104, height: 104, borderRadius: '50%',
            background: `linear-gradient(150deg, ${YC.green600}, ${YC.green700})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(14,110,84,0.35)',
            animation: 'yc-pop 480ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <LucideIcon name="check" size={52} color="#fff" strokeWidth={3} />
          </div>
          <div style={{ textAlign: 'center', animation: 'yc-fade-screen 400ms ease 120ms both' }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0, letterSpacing: '-0.02em' }}>
              오늘 복약 끝!
            </p>
            <p style={{ fontSize: 15, color: YC.neutral500, margin: '6px 0 0' }}>
              세 번 모두 잘 챙기셨어요 👏
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. OCR SCREEN
// ═══════════════════════════════════════════════════════════════
function OcrScreen({ onNavigate }) {
  const [phase, setPhase] = React.useState('idle'); // idle, scanning, result
  const [excluded, setExcluded] = React.useState(new Set());
  const [scanStep, setScanStep] = React.useState(0);

  const scanSteps = [
    { icon: 'camera', label: '처방전 이미지 인식' },
    { icon: 'scan', label: '글자 읽어오는 중 (OCR)' },
    { icon: 'sparkles', label: 'AI로 약품명 정제' },
    { icon: 'shield', label: '개인정보 비식별화' },
  ];

  function startScan() {
    setScanStep(0);
    setPhase('scanning');
  }

  React.useEffect(() => {
    if (phase !== 'scanning') return;
    let step = 0;
    const iv = setInterval(() => {
      step += 1;
      if (step >= scanSteps.length) {
        clearInterval(iv);
        setTimeout(() => setPhase('result'), 650);
      } else {
        setScanStep(step);
      }
    }, 850);
    return () => clearInterval(iv);
  }, [phase]);

  const resultMeds = [
    { name: '아모잘탄정 5/50mg', ingredient: '암로디핀/로사르탄', edi: '645702381', dosage: '1회 1정 · 1일 1회 · 14일분', category: '고혈압약', classType: '전문의약품' },
    { name: '리피토정 10mg', ingredient: '아토르바스타틴', edi: '657800120', dosage: '1회 1정 · 1일 1회 · 14일분', category: '고지혈증약', classType: '전문의약품' },
    { name: '트라젠타정 5mg', ingredient: '리나글립틴', edi: '670500240', dosage: '1회 1정 · 1일 1회 · 14일분', category: '당뇨병약', classType: '전문의약품' },
    { name: '아스피린프로텍트 100mg', ingredient: '아세틸살리실산', edi: '670600370', dosage: '1회 1정 · 1일 1회 · 14일분', category: '항혈소판제', classType: '전문의약품' },
    { name: '란스톤엘에프디티정', ingredient: '란소프라졸', edi: '645800190', dosage: '1회 1정 · 1일 1회 · 14일분', category: '위산분비억제제', classType: '전문의약품' },
  ];

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12 }}>
          <button onClick={() => onNavigate('wallet')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <LucideIcon name="chevron-left" size={22} color={YC.neutral700} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>처방전 촬영</h1>
        </div>

        {/* Upload Area (idle) */}
        {phase === 'idle' && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              border: `2px dashed ${YC.neutral300}`, borderRadius: YC.radiusLg, padding: '48px 20px',
              textAlign: 'center', background: '#fff',
            }}>
              <LucideIcon name="camera" size={40} color={YC.neutral400} />
              <p style={{ fontSize: 15, fontWeight: 600, color: YC.neutral700, marginTop: 12, fontFamily: YC.fontDisplay }}>처방전 사진을 올려주세요</p>
              <p style={{ fontSize: 13, color: YC.neutral400, marginTop: 4 }}>카메라 촬영 또는 사진 선택</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <YCButton icon="camera" style={{ width: '100%' }} onClick={startScan}>
                카메라 촬영
              </YCButton>
              <YCButton variant="outline" icon="image" style={{ width: '100%' }} onClick={startScan}>
                사진 선택
              </YCButton>
            </div>
          </div>
        )}

        {/* Scanning — animated */}
        {phase === 'scanning' && (
          <div style={{ marginTop: 20 }}>
            {/* Document with scan beam */}
            <div style={{
              position: 'relative', borderRadius: YC.radiusLg, overflow: 'hidden',
              background: '#fff', border: `1px solid ${YC.neutral200}`, boxShadow: YC.shadowMd,
              height: 220, padding: '20px 22px',
            }}>
              {/* Fake prescription lines */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ height: 13, width: '46%', background: YC.neutral200, borderRadius: 4 }} />
                <div style={{ height: 9, width: '30%', background: YC.neutral100, borderRadius: 4, marginBottom: 6 }} />
                {[68, 80, 73, 84, 62].map((w, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: YC.neutral200 }} />
                    <div style={{ height: 11, width: `${w}%`, background: YC.neutral100, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
              {/* Scan beam */}
              <div className="yc-scanbeam" style={{
                position: 'absolute', left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, transparent, ${YC.green600}, transparent)`,
                boxShadow: `0 0 16px 4px ${YC.green600}99`,
              }} />
              {/* Corner brackets */}
              {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],i) => (
                <div key={i} style={{
                  position: 'absolute', [v]: 10, [h]: 10, width: 20, height: 20,
                  [`border${v[0].toUpperCase()+v.slice(1)}`]: `2.5px solid ${YC.green600}`,
                  [`border${h[0].toUpperCase()+h.slice(1)}`]: `2.5px solid ${YC.green600}`,
                  borderRadius: 3,
                }} />
              ))}
            </div>

            {/* Title */}
            <p style={{ fontSize: 17, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, textAlign: 'center', marginTop: 20, lineHeight: 1.4 }}>
              처방전을 안전하게<br/>읽어오고 있습니다
            </p>

            {/* Step progress */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {scanSteps.map((s, i) => {
                const done = i < scanStep;
                const active = i === scanStep;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                    borderRadius: YC.radiusMd,
                    background: active ? YC.green50 : 'transparent',
                    opacity: done || active ? 1 : 0.4,
                    transition: `all 300ms ${YC.ease}`,
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? YC.green600 : active ? '#fff' : YC.neutral100,
                      border: active ? `2px solid ${YC.green600}` : 'none',
                    }}>
                      {done
                        ? <LucideIcon name="check" size={16} color="#fff" strokeWidth={3} />
                        : active
                          ? <span className="yc-spin" style={{ width: 15, height: 15, border: `2px solid ${YC.green100}`, borderTopColor: YC.green600, borderRadius: '50%', display: 'inline-block' }} />
                          : <LucideIcon name={s.icon} size={15} color={YC.neutral400} />}
                    </div>
                    <span style={{
                      fontSize: 14, fontWeight: done || active ? 700 : 500,
                      color: done ? YC.green600 : active ? YC.neutral900 : YC.neutral400,
                      fontFamily: YC.fontDisplay,
                    }}>{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Privacy note */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
              <LucideIcon name="shield" size={13} color={YC.neutral400} />
              <span style={{ fontSize: 12, color: YC.neutral400, lineHeight: 1.5, textAlign: 'center' }}>
                민감한 개인정보는 읽어오는 즉시 비식별화 후 파기됩니다
              </span>
            </div>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              background: '#fff', borderRadius: YC.radiusLg, padding: '16px 20px', marginBottom: 12,
              border: `1px solid ${YC.neutral200}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.15em', margin: 0, fontFamily: YC.fontDisplay }}>약사로 케어</p>
                  <p style={{ fontSize: 17, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '4px 0 0' }}>
                    읽어온 처방전이 맞으신가요?
                  </p>
                </div>
                <button onClick={() => setPhase('idle')} style={{
                  background: YC.neutral100, border: 'none', borderRadius: YC.radiusSm,
                  padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: YC.neutral500,
                }}>재촬영</button>
              </div>
            </div>

            <div style={{ background: YC.neutral100, borderRadius: YC.radiusMd, padding: '14px 20px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LucideIcon name="store" size={16} color={YC.green600} />
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.1em', margin: 0 }}>발행 병원 / 조제 약국</p>
                  <p style={{ fontSize: 17, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '2px 0 0' }}>서울내과의원</p>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.1em', fontFamily: YC.fontDisplay, marginBottom: 10 }}>
              추출된 약품 목록 ({resultMeds.length - excluded.size}/{resultMeds.length}종 선택)
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resultMeds.map((med, i) => {
                const excl = excluded.has(i);
                return (
                  <YCCard key={i} style={{
                    padding: '14px 16px', opacity: excl ? 0.35 : 1,
                    border: excl ? `1px solid ${YC.neutral100}` : `1px solid ${YC.neutral200}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: YC.radiusFull, background: YC.infoBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <LucideIcon name="pill" size={20} color={YC.blue500} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: YC.neutral400, fontFamily: 'monospace', margin: 0 }}>[{med.edi}]</p>
                        <p style={{ fontSize: 17, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '2px 0 0', lineHeight: 1.25 }}>{med.name}</p>
                        <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>({med.ingredient})</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: YC.blue500, margin: '6px 0 0' }}>{med.dosage}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          <YCBadge variant="info" style={{ fontSize: 11 }}>{med.category}</YCBadge>
                          <YCBadge style={{ fontSize: 11 }}>{med.classType}</YCBadge>
                        </div>
                      </div>
                      <button onClick={() => {
                        const next = new Set(excluded);
                        next.has(i) ? next.delete(i) : next.add(i);
                        setExcluded(next);
                      }} style={{
                        background: excl ? YC.neutral100 : YC.errorBg,
                        border: 'none', borderRadius: YC.radiusFull,
                        padding: '4px 10px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, color: excl ? YC.neutral400 : YC.error,
                      }}>
                        {excl ? '제외됨' : '제외'}
                      </button>
                    </div>
                  </YCCard>
                );
              })}
            </div>

            {/* Confirm button */}
            <div style={{ position: 'sticky', bottom: 70, marginTop: 20, padding: '12px 0' }}>
              <YCButton style={{ width: '100%', minHeight: 52, fontSize: 16, boxShadow: '0 4px 16px rgba(14,110,84,0.25)' }}
                onClick={() => onNavigate('wallet')}>
                <LucideIcon name="check" size={18} color="#fff" />
                확인 완료 — 내 약 지갑에 저장하기 ({resultMeds.length - excluded.size}종)
              </YCButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LandingScreen, HomeScreen, WalletScreen, TodayScreen, OcrScreen });
