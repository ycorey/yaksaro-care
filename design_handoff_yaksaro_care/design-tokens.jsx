// design-tokens.jsx — 약사로케어 Design Tokens & Shared Components
// Exports: YC (token object), NavBar, TabBar, YCCard, YCButton, YCBadge, LogoMark, LucideIcon

const YC = {
  // Primary
  green600: '#0E6E54',
  green700: '#084B3A',
  green50: '#E3F2EB',
  green100: '#C8E6D5',
  // Accent
  lime300: '#D9F25C',
  // Secondary
  blue500: '#4A8FCC',
  // Neutrals (warm green-tinted)
  neutral900: '#13261F',
  neutral800: '#1E3A2F',
  neutral700: '#2D4A3E',
  neutral600: '#3D4A44',
  neutral500: '#5A6B62',
  neutral400: '#8A9890',
  neutral300: '#C8CBC3',
  neutral200: '#E2E4DE',
  neutral100: '#F0F1EC',
  neutral50: '#FAFAF5',
  // Page bg (user preference: keep warm beige)
  pageBg: '#EFEBE2',
  // Semantic
  warning: '#E8A817',
  warningBg: '#FEF9E7',
  error: '#C9423F',
  errorBg: '#FEF2F2',
  info: '#4A8FCC',
  infoBg: '#EFF6FF',
  success: '#0E6E54',
  successBg: '#E3F2EB',
  // Radii
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 22,
  radiusFull: 9999,
  // Shadows (green-tinted)
  shadowSm: '0 1px 2px rgba(19,38,31,0.06), 0 1px 3px rgba(19,38,31,0.10)',
  shadowMd: '0 4px 6px rgba(19,38,31,0.07), 0 2px 4px rgba(19,38,31,0.06)',
  shadowLg: '0 10px 15px rgba(19,38,31,0.10), 0 4px 6px rgba(19,38,31,0.05)',
  // Font families
  fontDisplay: "'Paperlogy', -apple-system, sans-serif",
  fontBody: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
  // Transitions
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

// ── Lucide Icon Component ─────────────────────
// Renders common icons as inline SVG. Using a curated subset.
const ICON_PATHS = {
  home: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8','M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  wallet: ['M21 12V7H5a2 2 0 0 1 0-4h14v4','M3 5v14a2 2 0 0 0 2 2h16v-5','M18 12a1 1 0 0 0 0 2 1 1 0 0 0 0-2z'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  calendar: ['M8 2v4','M16 2v4','M21 8H3','M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  send: ['m22 2-7 20-4-9-9-4Z','m22 2-11 11'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z','M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  image: ['M21 3H3v18h18V3z','m21 15-5-5L5 21','M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  plus: ['M12 5v14','M5 12h14'],
  check: ['M20 6 9 17l-5-5'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-left': ['m15 18-6-6 6-6'],
  x: ['M18 6 6 18','M6 6l12 12'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z','M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  pill: ['m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z','m8.5 8.5 7 7'],
  leaf: ['M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 20 .5 20 .5s-1 8-4 13c-2 3-5 6.5-5 6.5z','M10.7 13.8s3-2.5 4.3-5.8'],
  scan: ['M7 3H3v4','M17 3h4v4','M7 21H3v-4','M17 21h4v-4'],
  clock: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z','M12 6v6l4 2'],
  'alert-triangle': ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z','M12 9v4','M12 17h.01'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2','M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  'file-text': ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z','M14 2v4a2 2 0 0 0 2 2h4','M10 9H8','M16 13H8','M16 17H8'],
  store: ['m2 7 10-5 10 5','M4 7v14','M20 7v14','M2 21h20','M2 11h20','M6 11v4','M10 11v4','M14 11v4','M18 11v4'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'],
  sparkles: ['m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z','M5 3v4','M19 17v4','M3 5h4','M17 19h4'],
};

function LucideIcon({ name, size = 20, color = 'currentColor', strokeWidth = 1.8, style = {}, filled = false }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ── Logo Mark ─────────────────────
function LogoMark({ size = 32, variant = 'badge' }) {
  if (variant === 'badge') {
    return (
      <div style={{
        width: size, height: size, borderRadius: size * 0.22,
        background: YC.green600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 100 100" fill="none">
          <path d="M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78" stroke={YC.neutral50} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78" stroke={YC.lime300} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" />
        </svg>
      </div>
    );
  }
  // inline variant
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
      <path d="M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78" stroke={YC.green600} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78" stroke={YC.lime300} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" />
    </svg>
  );
}

// ── Logo Wordmark ─────────────────
function LogoWordmark({ size = 16 }) {
  return (
    <span style={{ fontFamily: YC.fontDisplay, fontWeight: 700, fontSize: size, color: YC.neutral900, letterSpacing: '-0.02em' }}>
      약사<span style={{ color: YC.green600 }}>로</span>케어
    </span>
  );
}

// ── Bottom Tab Bar ─────────────────
function TabBar({ active, onNavigate }) {
  const tabs = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'wallet', label: '약지갑', icon: 'wallet' },
    { id: 'today', label: '오늘복약', icon: 'heart' },
    { id: 'calendar', label: '캘린더', icon: 'calendar' },
    { id: 'share', label: '전달', icon: 'send' },
  ];
  return (
    <nav style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 64,
      background: '#fff',
      borderTop: `1px solid ${YC.neutral200}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      zIndex: 50,
    }}>
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => onNavigate(t.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <LucideIcon name={t.icon} size={22}
              color={isActive ? YC.green600 : YC.neutral400}
              strokeWidth={isActive ? 2.2 : 1.5}
              filled={isActive && t.icon === 'heart'} />
            <span style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              color: isActive ? YC.green600 : YC.neutral400,
              fontFamily: YC.fontDisplay, lineHeight: 1,
            }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Card ─────────────────
function YCCard({ children, style = {}, variant = 'default', onClick, ...rest }) {
  const base = {
    background: variant === 'brand' ? YC.green50 : variant === 'dark' ? YC.green600 : '#fff',
    borderRadius: YC.radiusMd,
    border: variant === 'brand' ? `1px solid #89CCB3` : variant === 'dark' ? 'none' : `1px solid ${YC.neutral200}`,
    boxShadow: variant === 'dark' ? YC.shadowMd : YC.shadowSm,
    padding: '16px 20px',
    cursor: onClick ? 'pointer' : 'default',
    transition: `all 150ms ${YC.ease}`,
    ...style,
  };
  return <div style={base} onClick={onClick} {...rest}>{children}</div>;
}

// ── Button ─────────────────
function YCButton({ children, variant = 'primary', size = 'md', style = {}, icon, ...rest }) {
  const sizeMap = { sm: { h: 36, px: 14, fs: 13 }, md: { h: 44, px: 20, fs: 15 }, lg: { h: 52, px: 24, fs: 17 } };
  const s = sizeMap[size] || sizeMap.md;
  const variants = {
    primary: { bg: YC.green600, color: '#fff', border: 'none' },
    secondary: { bg: YC.green50, color: YC.green600, border: 'none' },
    outline: { bg: '#fff', color: YC.neutral700, border: `1px solid ${YC.neutral200}` },
    ghost: { bg: 'transparent', color: YC.neutral600, border: 'none' },
  };
  const v = variants[variant] || variants.primary;
  return (
    <button style={{
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs,
      fontWeight: 700, fontFamily: YC.fontDisplay,
      background: v.bg, color: v.color, border: v.border,
      borderRadius: YC.radiusMd, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      transition: `all 150ms ${YC.ease}`,
      WebkitTapHighlightColor: 'transparent',
      ...style,
    }} {...rest}>
      {icon && <LucideIcon name={icon} size={s.fs + 1} color={v.color} />}
      {children}
    </button>
  );
}

// ── Badge ─────────────────
function YCBadge({ children, variant = 'default', style = {} }) {
  const variants = {
    default: { bg: YC.neutral100, color: YC.neutral600 },
    brand: { bg: YC.green50, color: YC.green600 },
    lime: { bg: YC.lime300, color: YC.neutral900 },
    warning: { bg: YC.warningBg, color: '#92600A' },
    error: { bg: YC.errorBg, color: YC.error },
    info: { bg: YC.infoBg, color: '#1E5BA8' },
  };
  const v = variants[variant] || variants.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: YC.radiusSm,
      fontSize: 12, fontWeight: 600, fontFamily: YC.fontDisplay,
      background: v.bg, color: v.color, lineHeight: 1.4,
      ...style,
    }}>{children}</span>
  );
}

// ── Section Header ─────────────────
function SectionHeader({ icon, iconColor, label, count, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      {icon && <span style={{
        width: 10, height: 10, borderRadius: YC.radiusFull,
        background: iconColor || YC.green600, flexShrink: 0,
      }} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: YC.neutral600, fontFamily: YC.fontDisplay }}>
        {label}
        {count != null && <span style={{ fontWeight: 400, color: YC.neutral400, marginLeft: 4 }}>({count}종)</span>}
      </span>
    </div>
  );
}

Object.assign(window, {
  YC, LucideIcon, LogoMark, LogoWordmark,
  TabBar, YCCard, YCButton, YCBadge, SectionHeader,
});
