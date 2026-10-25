export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="PMOS BIOGRAPH mark">
      <rect width="40" height="40" rx="11" fill="#101C40" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="#26356A" />
      <g stroke="#5E6FB0" strokeWidth="1.2" strokeLinecap="round">
        <line x1="12" y1="26" x2="20" y2="13" />
        <line x1="20" y1="13" x2="29" y2="24" />
        <line x1="12" y1="26" x2="29" y2="24" />
        <line x1="20" y1="13" x2="20" y2="31" strokeDasharray="1.5 2.5" />
      </g>
      <circle cx="20" cy="13" r="3.4" fill="#43C6B6" />
      <circle cx="12" cy="26" r="2.7" fill="#A99BFF" />
      <circle cx="29" cy="24" r="2.7" fill="#F0C27A" />
      <circle cx="20" cy="31" r="1.7" fill="#9CC5A1" />
    </svg>
  );
}

export function Wordmark({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-none">
        <div className={`text-[19px] font-extrabold tracking-[-0.02em] ${dark ? 'text-white' : 'text-ink'}`}>
          PM<span className="text-teal-bright">O</span>S
        </div>
        <div className={`mt-1 font-mono text-[9.5px] uppercase tracking-[0.28em] ${dark ? 'text-slate-400' : 'text-ink-mute'}`}>
          Biograph
        </div>
      </div>
    </div>
  );
}
