// MIP medallion: gold double ring with a gauge whose needle points up like a rising price.
const GOLD = "#C3A46B";
const TICKS = [180, 210, 240, 270, 300, 330, 360];

export function LogoMark({ size = 34, withText = false, className }: { size?: number; withText?: boolean; className?: string }) {
  const cy = withText ? 70 : 82;
  const rad = (a: number) => (a * Math.PI) / 180;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" className={className} aria-hidden="true">
      <circle cx="70" cy="70" r="70" fill="#111317" />
      <circle cx="70" cy="70" r="62" fill="none" stroke={GOLD} strokeWidth="2" />
      <circle cx="70" cy="70" r="55" fill="none" stroke={GOLD} strokeWidth="0.9" />
      <g transform={`translate(70 ${cy})`} stroke={GOLD} strokeLinecap="round">
        <path d="M-42 0 A42 42 0 0 1 42 0" fill="none" strokeWidth="1.2" />
        {TICKS.map((a) => (
          <line key={a} x1={34 * Math.cos(rad(a))} y1={34 * Math.sin(rad(a))} x2={39 * Math.cos(rad(a))} y2={39 * Math.sin(rad(a))} strokeWidth="1.8" />
        ))}
        <line x1="-3.5" y1="5" x2="19" y2="-27" stroke="#C0392B" strokeWidth="3.4" />
        <circle r="5" fill={GOLD} stroke="none" />
        <circle r="1.8" fill="#111317" stroke="none" />
      </g>
      {withText && (
        <text x="70" y="104" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="20" letterSpacing="5" fill={GOLD}>
          MIP
        </text>
      )}
    </svg>
  );
}
