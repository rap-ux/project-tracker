// Public preview page — no auth required so you can easily share for feedback.

function BreakerLogo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#0f1623"/>
      <rect width="100" height="100" rx="22" fill="url(#brGrad)" opacity="0.5"/>
      <defs>
        <linearGradient id="brGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e2839" stopOpacity="1"/>
          <stop offset="1" stopColor="#0a0f1a" stopOpacity="1"/>
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* Breaker body */}
      <rect x="38" y="18" width="24" height="64" rx="4" fill="#1c2434" stroke="#2d3649" strokeWidth="1"/>
      {/* ON / OFF guide line */}
      <line x1="50" y1="22" x2="50" y2="28" stroke="rgba(235,241,245,0.25)" strokeWidth="1" strokeLinecap="round"/>
      <line x1="50" y1="72" x2="50" y2="78" stroke="rgba(235,241,245,0.15)" strokeWidth="1" strokeLinecap="round"/>
      {/* Toggle handle — UP = ON */}
      <rect x="42" y="30" width="16" height="22" rx="2" fill="#00BAD6" filter="url(#glow)"/>
      <rect x="44" y="32" width="12" height="18" rx="1" fill="rgba(255,255,255,0.15)"/>
      {/* LED indicator */}
      <circle cx="74" cy="26" r="6" fill="#00BAD6" opacity="0.25"/>
      <circle cx="74" cy="26" r="3" fill="#00BAD6"/>
    </svg>
  );
}

function MonogramLogo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#0f1623"/>
      <rect width="100" height="100" rx="22" fill="url(#monoGrad)" opacity="0.5"/>
      <defs>
        <linearGradient id="monoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e2839" stopOpacity="1"/>
          <stop offset="1" stopColor="#0a0f1a" stopOpacity="1"/>
        </linearGradient>
      </defs>
      {/* SB letterforms */}
      <text x="50" y="63" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900"
        fontSize="44" fill="#EBF1F5" textAnchor="middle" letterSpacing="-3">SB</text>
      {/* Lightning bolt integrated as underline */}
      <path d="M 22 78 L 40 78 L 44 72 L 56 78 L 60 72 L 78 78"
        stroke="#00BAD6" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function PanelLogo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#0f1623"/>
      <rect width="100" height="100" rx="22" fill="url(#panelGrad)" opacity="0.5"/>
      <defs>
        <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e2839" stopOpacity="1"/>
          <stop offset="1" stopColor="#0a0f1a" stopOpacity="1"/>
        </linearGradient>
        <filter id="panelGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* Panel backing */}
      <rect x="16" y="20" width="68" height="60" rx="5" fill="#182033" stroke="#2a3348" strokeWidth="1"/>
      {/* 6 breakers — 3x2 */}
      {[
        { x: 22, y: 28, on: false, up: true  },
        { x: 44, y: 28, on: false, up: true  },
        { x: 66, y: 28, on: false, up: false },
        { x: 22, y: 52, on: false, up: true  },
        { x: 44, y: 52, on: true,  up: true  },
        { x: 66, y: 52, on: false, up: true  },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width="14" height="22" rx="2.5" fill={s.on ? "#00BAD6" : "#2a3348"}
            stroke={s.on ? "#00BAD6" : "#3a4358"} strokeWidth="0.5"
            filter={s.on ? "url(#panelGlow)" : undefined}/>
          <rect x={s.x + 3} y={s.up ? s.y + 3 : s.y + 11} width="8" height="8" rx="1"
            fill={s.on ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.12)"}/>
        </g>
      ))}
    </svg>
  );
}

const LOGOS = [
  { id: "breaker",  name: "Direction 1: Breaker Toggle",     comp: BreakerLogo },
  { id: "monogram", name: "Direction 2: SB Monogram + Bolt", comp: MonogramLogo },
  { id: "panel",    name: "Direction 3: Panel Grid",         comp: PanelLogo },
] as const;

export default function LogoPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Switchboard Logo — Concept Preview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Three directions shown at navbar, app-icon, and full-size. Pick the one that feels right.
          </p>
        </header>

        {LOGOS.map(({ id, name, comp: Logo }) => (
          <section key={id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">{name}</h2>
              <span className="text-xs text-gray-400">#{id}</span>
            </div>

            {/* Size scale */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Size scale</p>
              <div className="flex items-end gap-6">
                {[20, 28, 40, 64, 96, 144].map(s => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <Logo size={s} />
                    <span className="text-[10px] text-gray-400">{s}px</span>
                  </div>
                ))}
              </div>
            </div>

            {/* On dark navbar — next to TWE wordmark */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">In the navbar (dark)</p>
              <div className="px-5 py-2.5 rounded-lg flex items-center gap-3" style={{ backgroundColor: "#101010" }}>
                <img src="/twe-logo.png" alt="TWE" className="h-9 w-auto" />
                <div className="h-6 border-l border-white/15" />
                <Logo size={32} />
                <span className="text-sm font-semibold tracking-wide" style={{ color: "#EBF1F5" }}>Switchboard</span>
              </div>
            </div>

            {/* On light card — product header */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">As a product header (light)</p>
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3 shadow-sm">
                <Logo size={48} />
                <div>
                  <p className="text-lg font-bold text-gray-900">Switchboard</p>
                  <p className="text-xs text-gray-500">Project coordination for Totally Wired Electric</p>
                </div>
              </div>
            </div>

            {/* App icon look — cornered */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">As an app icon</p>
              <div className="flex gap-4 items-center">
                <Logo size={128} />
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Bookmark favicon, PWA icon, App Store shelf</p>
                  <p className="text-gray-400">Would scale down to 32/16 for browser tab</p>
                </div>
              </div>
            </div>
          </section>
        ))}

        <footer className="text-center text-xs text-gray-400 py-6">
          Rendered inline · no assets to swap · one line of code to make any of these live.
        </footer>
      </div>
    </div>
  );
}
