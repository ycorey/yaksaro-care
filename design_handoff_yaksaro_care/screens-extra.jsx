// screens-extra.jsx — 캘린더 + 전달 화면
// Exports: CalendarScreen, ShareScreen

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

// ═══════════════════════════════════════════════════════════════
// CALENDAR SCREEN
// ═══════════════════════════════════════════════════════════════
function CalendarScreen({ onNavigate }) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);

  const todayStr = dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  function prev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  // Calendar grid
  const firstDow = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Sample data — some days with statuses
  const sampleData = {};
  const todayDate = now.getDate();
  for (let d = 1; d < todayDate; d++) {
    const key = dateKey(year, month, d);
    if (d % 7 === 0) sampleData[key] = { status: 'miss', done: 0 };
    else if (d % 5 === 0) sampleData[key] = { status: 'partial', done: 2 };
    else sampleData[key] = { status: 'full', done: 3 };
  }
  // Today: partial
  sampleData[todayStr] = { status: 'partial', done: 1 };

  const fullDays = Object.values(sampleData).filter(d => d.status === 'full').length;
  const partialDays = Object.values(sampleData).filter(d => d.status === 'partial').length;
  const missDays = Object.values(sampleData).filter(d => d.status === 'miss').length;

  function StatusDot({ status }) {
    if (!status) return <span style={{ display: 'block', width: 6, height: 6 }} />;
    const colors = { full: YC.green600, partial: YC.warning, miss: 'transparent' };
    return (
      <span style={{
        display: 'block', width: 6, height: 6, borderRadius: YC.radiusFull,
        background: colors[status] || 'transparent',
        border: status === 'miss' ? `1px solid ${YC.neutral300}` : 'none',
      }} />
    );
  }

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '12px 0 0' }}>
          복약 캘린더
        </h1>

        {/* Month navigation */}
        <YCCard style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={prev} style={{
              width: 36, height: 36, borderRadius: YC.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <LucideIcon name="chevron-left" size={20} color={YC.neutral500} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay }}>
              {year}년 {month}월
            </span>
            <button onClick={next} disabled={isCurrentMonth} style={{
              width: 36, height: 36, borderRadius: YC.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer',
              opacity: isCurrentMonth ? 0.3 : 1,
            }}>
              <LucideIcon name="chevron-right" size={20} color={YC.neutral500} />
            </button>
          </div>

          {/* Weekday header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600, paddingBottom: 4,
                color: i === 0 ? '#E05050' : i === 6 ? YC.blue500 : YC.neutral400,
                fontFamily: YC.fontDisplay,
              }}>{d}</div>
            ))}
          </div>

          {/* Date grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px 0' }}>
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const key = dateKey(year, month, day);
              const isToday = key === todayStr;
              const isFuture = key > todayStr;
              const summary = sampleData[key];
              const dow = i % 7;

              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: YC.radiusFull, fontSize: 14, fontWeight: isToday ? 700 : 500,
                    background: isToday ? YC.green600 : 'transparent',
                    color: isToday ? '#fff' : isFuture ? YC.neutral300 : dow === 0 ? '#E05050' : dow === 6 ? YC.blue500 : YC.neutral800,
                    fontFamily: YC.fontDisplay,
                  }}>
                    {day}
                  </span>
                  <span style={{ marginTop: 2, height: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!isFuture && <StatusDot status={summary?.status} />}
                  </span>
                </div>
              );
            })}
          </div>
        </YCCard>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, paddingLeft: 4 }}>
          {[
            { color: YC.green600, label: '완전 복용' },
            { color: YC.warning, label: '부분 복용' },
            { color: 'transparent', border: YC.neutral300, label: '거름' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: YC.neutral500 }}>
              <span style={{
                width: 8, height: 8, borderRadius: YC.radiusFull,
                background: item.color,
                border: item.border ? `1px solid ${item.border}` : 'none',
              }} />
              {item.label}
            </div>
          ))}
        </div>

        {/* Monthly summary */}
        <YCCard style={{ marginTop: 16, padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.1em', fontFamily: YC.fontDisplay, marginBottom: 12 }}>
            {month}월 복약 요약
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: YC.green600, fontFamily: YC.fontDisplay, margin: 0 }}>{fullDays}</p>
              <p style={{ fontSize: 12, color: YC.neutral500, marginTop: 2 }}>완전 복용</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: YC.warning, fontFamily: YC.fontDisplay, margin: 0 }}>{partialDays}</p>
              <p style={{ fontSize: 12, color: YC.neutral500, marginTop: 2 }}>부분 복용</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 900, color: YC.neutral400, fontFamily: YC.fontDisplay, margin: 0 }}>{missDays}</p>
              <p style={{ fontSize: 12, color: YC.neutral500, marginTop: 2 }}>거름</p>
            </div>
          </div>
        </YCCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARE SCREEN (의사·약사님께 보여주기)
// ═══════════════════════════════════════════════════════════════
function ShareScreen({ onNavigate }) {
  const [showDoctorView, setShowDoctorView] = React.useState(false);

  const rxMeds = [
    { name: '아모잘탄정 5/50mg', ingredient: '암로디핀/로사르탄', dosage: '1회 1정 · 1일 1회' },
    { name: '리피토정 10mg', ingredient: '아토르바스타틴', dosage: '1회 1정 · 1일 1회' },
    { name: '트라젠타정 5mg', ingredient: '리나글립틴', dosage: '1회 1정 · 1일 1회' },
    { name: '아스피린프로텍트 100mg', ingredient: '아세틸살리실산', dosage: '1회 1정 · 1일 1회' },
    { name: '란스톤엘에프디티정', ingredient: '란소프라졸', dosage: '1회 1정 · 1일 1회' },
  ];
  const suppMeds = [
    { name: '종합비타민', dosage: '1일 1회' },
    { name: '오메가3', dosage: '1일 1회' },
    { name: '유산균', dosage: '1일 1회' },
    { name: '홍삼정', dosage: '1일 2회' },
  ];
  const otcMeds = [
    { name: '타이레놀', dosage: '필요 시' },
    { name: '훼스탈', dosage: '필요 시' },
  ];
  const totalCount = rxMeds.length + suppMeds.length + otcMeds.length;

  // Doctor view modal
  if (showDoctorView) {
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 100, background: '#fff',
        overflowY: 'auto', fontFamily: YC.fontBody,
      }}>
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10, background: '#fff',
          borderBottom: `1px solid ${YC.neutral100}`, padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: YC.neutral400, letterSpacing: '0.15em', margin: 0, fontFamily: YC.fontDisplay }}>약사로 케어</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '2px 0 0' }}>
              현재 복용 중인 약 {totalCount}종
            </p>
          </div>
          <button onClick={() => setShowDoctorView(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700, color: YC.green600, padding: '8px 12px', borderRadius: YC.radiusMd,
          }}>
            <LucideIcon name="x" size={20} color={YC.green600} /> 닫기
          </button>
        </div>

        <div style={{ padding: '32px 20px 40px', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {/* 1. Prescription */}
          <section>
            <p style={{
              fontSize: 12, fontWeight: 900, color: YC.blue500, letterSpacing: '0.1em',
              marginBottom: 20, paddingBottom: 12, borderBottom: `2px solid ${YC.infoBg}`,
              fontFamily: YC.fontDisplay,
            }}>
              1. 현재 복용 중인 병원 처방약 전체 목록
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: YC.neutral400, marginBottom: 16 }}>
              <LucideIcon name="store" size={14} color={YC.neutral400} style={{ marginRight: 4 }} />
              서울내과
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {rxMeds.map((m, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${YC.neutral100}`, paddingBottom: 16 }}>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#000', fontFamily: YC.fontDisplay, lineHeight: 1.2 }}>{m.name}</p>
                  {m.ingredient && <p style={{ fontSize: 14, color: YC.neutral400, marginTop: 4 }}>({m.ingredient})</p>}
                  <p style={{ fontSize: 16, fontWeight: 600, color: YC.neutral500, marginTop: 4 }}>{m.dosage}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Supplements */}
          <section>
            <p style={{
              fontSize: 12, fontWeight: 900, color: YC.green600, letterSpacing: '0.1em',
              marginBottom: 20, paddingBottom: 12, borderBottom: `2px solid ${YC.green50}`,
              fontFamily: YC.fontDisplay,
            }}>
              2. 함께 복용 중인 상시 영양제
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {suppMeds.map((m, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${YC.neutral100}`, paddingBottom: 16 }}>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#000', fontFamily: YC.fontDisplay, lineHeight: 1.2 }}>
                    <LucideIcon name="leaf" size={22} color={YC.green600} style={{ marginRight: 6 }} />
                    {m.name}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: YC.neutral500, marginTop: 4 }}>{m.dosage}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 3. OTC */}
          <section>
            <p style={{
              fontSize: 12, fontWeight: 900, color: YC.neutral500, letterSpacing: '0.1em',
              marginBottom: 20, paddingBottom: 12, borderBottom: `2px solid ${YC.neutral100}`,
              fontFamily: YC.fontDisplay,
            }}>
              3. 최근 복용한 약국 일반약
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {otcMeds.map((m, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${YC.neutral100}`, paddingBottom: 16 }}>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#000', fontFamily: YC.fontDisplay, lineHeight: 1.2 }}>
                    <LucideIcon name="pill" size={22} color={YC.neutral500} style={{ marginRight: 6 }} />
                    {m.name}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: YC.neutral500, marginTop: 4 }}>{m.dosage}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <p style={{ padding: '0 20px 32px', fontSize: 11, color: YC.neutral400, textAlign: 'center', lineHeight: 1.6 }}>
          약사로 케어 · 복약 정보 기록 서비스<br/>의학적 진단·처방을 대체하지 않습니다
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: YC.pageBg, fontFamily: YC.fontBody, paddingBottom: 80 }}>
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <button onClick={() => onNavigate('landing')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <LogoMark size={24} variant="badge" />
            <LogoWordmark size={13} />
          </button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: '12px 0 0' }}>
          의사·약사님께 보여주기
        </h1>
        <p style={{ fontSize: 14, color: YC.neutral500, margin: '4px 0 0' }}>현재 복용 중인 약 목록을 보여주세요</p>

        {/* CTA */}
        <YCButton
          variant="primary"
          icon="send"
          onClick={() => setShowDoctorView(true)}
          style={{ width: '100%', minHeight: 52, fontSize: 16, marginTop: 20, boxShadow: '0 4px 16px rgba(14,110,84,0.25)' }}
        >
          의사·약사님께 보여주기
        </YCButton>

        {/* Preview list */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Rx */}
          <YCCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: YC.infoBg, borderBottom: `1px solid ${YC.blue500}22` }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#1E5BA8', letterSpacing: '0.1em', fontFamily: YC.fontDisplay, margin: 0 }}>
                <LucideIcon name="store" size={13} color="#1E5BA8" style={{ marginRight: 4 }} />
                처방약
              </p>
            </div>
            {rxMeds.map((m, i) => (
              <div key={i} style={{
                padding: '12px 20px',
                borderBottom: i < rxMeds.length - 1 ? `1px solid ${YC.neutral100}` : 'none',
              }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{m.name}</p>
                {m.ingredient && <p style={{ fontSize: 12, color: YC.neutral400, margin: '2px 0 0' }}>({m.ingredient})</p>}
                <p style={{ fontSize: 12, color: YC.blue500, fontWeight: 600, margin: '2px 0 0' }}>{m.dosage}</p>
              </div>
            ))}
          </YCCard>

          {/* Supplements */}
          <YCCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: YC.green50, borderBottom: `1px solid ${YC.green600}22` }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: YC.green700, letterSpacing: '0.1em', fontFamily: YC.fontDisplay, margin: 0 }}>
                <LucideIcon name="leaf" size={13} color={YC.green700} style={{ marginRight: 4 }} />
                개인 영양제
              </p>
            </div>
            {suppMeds.map((m, i) => (
              <div key={i} style={{
                padding: '12px 20px',
                borderBottom: i < suppMeds.length - 1 ? `1px solid ${YC.neutral100}` : 'none',
              }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{m.name}</p>
                <p style={{ fontSize: 12, color: YC.green600, fontWeight: 600, margin: '2px 0 0' }}>{m.dosage}</p>
              </div>
            ))}
          </YCCard>

          {/* OTC */}
          <YCCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: YC.warningBg, borderBottom: `1px solid ${YC.warning}22` }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#8A5712', letterSpacing: '0.1em', fontFamily: YC.fontDisplay, margin: 0 }}>
                <LucideIcon name="pill" size={13} color="#8A5712" style={{ marginRight: 4 }} />
                약국 일반약
              </p>
            </div>
            {otcMeds.map((m, i) => (
              <div key={i} style={{
                padding: '12px 20px',
                borderBottom: i < otcMeds.length - 1 ? `1px solid ${YC.neutral100}` : 'none',
              }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: YC.neutral900, fontFamily: YC.fontDisplay, margin: 0 }}>{m.name}</p>
                <p style={{ fontSize: 12, color: '#92600A', fontWeight: 600, margin: '2px 0 0' }}>{m.dosage}</p>
              </div>
            ))}
          </YCCard>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CalendarScreen, ShareScreen });
