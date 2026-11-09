import { useId } from "react";
import type { CarShape } from "../data/types";
import { t } from "../i18n";

/** Stylised SVG car illustrations — side profiles per body shape, plus detail views for the gallery. */

type ShapeDef = {
  body: string;
  glass: string[];
  wheels: [number, number];
  r: number;
  head: [number, number];
  tail: [number, number];
  door: string;
  extra?: string; // darker detail (intakes, seats, spoilers)
};

const GROUND = 140;

const SHAPES: Record<CarShape, ShapeDef> = {
  classic911: {
    body: "M40,116 C38,108 40,100 52,97 L132,86 C150,70 170,56 196,52 C222,49 246,50 262,56 C292,68 320,84 350,94 C362,98 366,106 364,118 L330,118 A30,30 0 0 0 270,118 L130,118 A30,30 0 0 0 70,118 Z",
    glass: ["M150,84 C166,68 182,60 198,58 L232,57 L232,84 Z", "M238,57 C252,58 268,66 286,80 L238,84 Z"],
    wheels: [100, 300],
    r: 24,
    head: [50, 100],
    tail: [356, 100],
    door: "M150,88 L240,88 L244,116",
  },
  modern911: {
    body: "M34,118 C32,108 36,100 50,97 L134,84 C154,66 176,54 204,50 C232,47 256,49 274,56 C302,68 330,82 358,92 C370,96 372,108 370,118 L336,118 A31,31 0 0 0 274,118 L130,118 A31,31 0 0 0 68,118 Z",
    glass: ["M154,82 C172,64 190,57 208,56 L246,56 L246,82 Z", "M252,57 C266,59 282,67 298,79 L252,82 Z"],
    wheels: [99, 305],
    r: 25,
    head: [46, 100],
    tail: [362, 98],
    door: "M154,86 L252,86 L256,116",
    extra: "M318,84 L366,90 L366,94 L318,90 Z",
  },
  wedge: {
    body: "M30,112 L36,100 L150,80 L200,58 L262,56 L300,74 L360,82 L372,96 L370,118 L332,118 A32,32 0 0 0 268,118 L132,118 A32,32 0 0 0 68,118 L34,118 Z",
    glass: ["M156,80 L202,62 L240,61 L244,80 Z"],
    wheels: [100, 300],
    r: 25,
    head: [44, 102],
    tail: [366, 98],
    door: "M156,84 L248,84 L252,116",
    extra: "M266,86 L312,84 L308,102 L270,102 Z",
  },
  gt: {
    body: "M34,114 C32,104 38,96 56,94 L170,86 C186,70 204,58 226,56 L262,56 C284,60 304,74 326,88 C350,92 366,98 368,108 L366,118 L332,118 A32,32 0 0 0 268,118 L127,118 A32,32 0 0 0 63,118 L38,118 Z",
    glass: ["M178,86 C192,72 206,64 228,62 L256,62 C272,66 288,76 300,86 Z"],
    wheels: [95, 300],
    r: 25,
    head: [44, 100],
    tail: [362, 102],
    door: "M180,90 L262,90 L266,116",
  },
  sedan: {
    body: "M34,114 L36,96 L60,92 L140,88 L170,62 L262,60 L298,86 L360,90 L366,100 L366,118 L332,118 A30,30 0 0 0 272,118 L130,118 A30,30 0 0 0 70,118 L36,118 Z",
    glass: ["M150,86 L174,66 L214,65 L214,86 Z", "M220,65 L258,64 L284,86 L220,86 Z"],
    wheels: [100, 302],
    r: 24,
    head: [42, 98],
    tail: [362, 98],
    door: "M146,90 L216,90 L218,116 M216,90 L290,90",
    extra: "M342,86 L368,83 L368,89 L342,91 Z",
  },
  hyper: {
    body: "M28,114 C30,104 40,98 64,96 L160,84 C186,66 214,60 240,60 C270,62 300,76 330,84 L366,90 C374,98 374,110 370,118 L333,118 A33,33 0 0 0 267,118 L133,118 A33,33 0 0 0 67,118 L30,118 Z",
    glass: ["M170,84 C192,70 214,65 238,65 C252,66 262,70 270,78 L270,84 Z"],
    wheels: [100, 300],
    r: 26,
    head: [40, 102],
    tail: [366, 96],
    door: "M172,88 L262,88 L266,116",
    extra: "M276,88 L318,88 L314,104 L280,104 Z",
  },
  roadster: {
    body: "M34,112 C34,100 44,94 62,92 L176,86 L186,84 L280,84 C310,84 340,88 360,94 C370,100 370,110 366,118 L331,118 A31,31 0 0 0 269,118 L129,118 A31,31 0 0 0 67,118 L36,118 Z",
    glass: ["M176,86 L196,62 L201,63 L186,86 Z"],
    wheels: [98, 300],
    r: 24,
    head: [46, 98],
    tail: [362, 100],
    door: "M190,90 L262,90 L266,116",
    extra: "M222,84 C222,72 236,70 240,74 L240,84 Z",
  },
};

export type Scene = "mountain" | "sunset" | "studio" | "city" | "track" | "none";

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = amount < 0 ? 1 + amount : 1 - amount;
  const t = amount < 0 ? 0 : 255;
  return `#${[r, g, b].map((c) => clamp(t + (c - t) * f).toString(16).padStart(2, "0")).join("")}`;
}

function Backdrop({ scene, id }: { scene: Scene; id: string }) {
  if (scene === "none") return null;
  if (scene === "studio")
    return (
      <>
        <defs>
          <radialGradient id={`${id}-st`} cx="50%" cy="40%" r="75%">
            <stop offset="0" stopColor="#3a3f47" />
            <stop offset="1" stopColor="#0d0f12" />
          </radialGradient>
        </defs>
        <rect width="400" height="160" fill={`url(#${id}-st)`} />
        <rect y="132" width="400" height="28" fill="#15181d" />
      </>
    );
  if (scene === "city")
    return (
      <>
        <defs>
          <linearGradient id={`${id}-ci`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c1424" />
            <stop offset="1" stopColor="#25263a" />
          </linearGradient>
        </defs>
        <rect width="400" height="160" fill={`url(#${id}-ci)`} />
        {[10, 48, 80, 128, 170, 214, 250, 300, 338, 370].map((x, i) => (
          <g key={x}>
            <rect x={x} y={40 + ((i * 37) % 50)} width={30 + (i % 3) * 8} height={120} fill="#141a29" />
            {Array.from({ length: 6 }).map((_, j) => (
              <rect key={j} x={x + 5 + (j % 3) * 8} y={50 + ((i * 37) % 50) + Math.floor(j / 3) * 14} width="4" height="5" fill={(i + j) % 3 ? "#f3c76b" : "#2a3247"} opacity="0.7" />
            ))}
          </g>
        ))}
        <rect y="132" width="400" height="28" fill="#1a1c24" />
        <rect y="132" width="400" height="2" fill="#3b3550" />
      </>
    );
  if (scene === "track")
    return (
      <>
        <rect width="400" height="160" fill="#7aa4c8" />
        <rect y="80" width="400" height="40" fill="#5f8f4e" />
        <rect y="112" width="400" height="48" fill="#3a3c40" />
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={i * 44} y="112" width="22" height="5" fill={i % 2 ? "#e8e6e0" : "#c0262d"} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <rect key={i} x={i * 64 + 10} y={130 + (i % 2) * 8} width="40" height="1.5" fill="#ffffff" opacity="0.25" />
        ))}
      </>
    );
  const sunset = scene === "sunset";
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sunset ? "#2b1f3d" : "#8fb3d1"} />
          <stop offset="0.7" stopColor={sunset ? "#e0875a" : "#dfe8ee"} />
        </linearGradient>
      </defs>
      <rect width="400" height="160" fill={`url(#${id}-sky)`} />
      {sunset && <circle cx="300" cy="92" r="22" fill="#f6c27a" opacity="0.9" />}
      <path d="M0,96 L40,60 L70,78 L110,36 L150,70 L190,44 L230,74 L270,30 L320,72 L360,50 L400,78 L400,130 L0,130 Z" fill={sunset ? "#3b2a44" : "#6d7f92"} />
      {!sunset && <path d="M110,36 L122,48 L114,50 L106,44 Z M270,30 L284,44 L274,46 L264,40 Z" fill="#f4f6f8" />}
      <path d="M0,110 L60,92 L120,104 L190,88 L260,102 L330,90 L400,104 L400,132 L0,132 Z" fill={sunset ? "#2a2232" : "#4f6273"} />
      <rect y="128" width="400" height="32" fill={sunset ? "#1f1a22" : "#3f454c"} />
      <rect y="128" width="400" height="1.5" fill="#ffffff" opacity="0.15" />
    </>
  );
}

function Wheel({ x, r, spin = 0 }: { x: number; r: number; spin?: number }) {
  const cy = 118;
  return (
    <g>
      <circle cx={x} cy={cy} r={r} fill="#0e0f11" />
      <circle cx={x} cy={cy} r={r * 0.64} fill="#a7adb4" />
      <circle cx={x} cy={cy} r={r * 0.6} fill="#7e848b" />
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2 + spin;
        return (
          <path
            key={i}
            d={`M${x},${cy} L${x + Math.cos(a - 0.22) * r * 0.58},${cy + Math.sin(a - 0.22) * r * 0.58} L${x + Math.cos(a + 0.22) * r * 0.58},${cy + Math.sin(a + 0.22) * r * 0.58} Z`}
            fill="#c9ced3"
          />
        );
      })}
      <circle cx={x} cy={cy} r={r * 0.16} fill="#2a2d31" />
    </g>
  );
}

export function CarSide({ shape, color, id }: { shape: CarShape; color: string; id: string }) {
  const s = SHAPES[shape];
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(color, 0.28)} />
          <stop offset="0.45" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -0.45)} />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fb4c6" />
          <stop offset="1" stopColor="#1d2733" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy={GROUND - 1} rx="176" ry="7" fill="#000" opacity="0.45" />
      {s.wheels.map((x) => (
        <circle key={x} cx={x} cy={118} r={s.r + 2.5} fill="#050506" />
      ))}
      <path d={s.body} fill={`url(#${id}-paint)`} stroke={shade(color, -0.55)} strokeWidth="0.8" />
      <path d={s.body} fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1" transform="translate(0,1.2)" clipPath="none" />
      {s.glass.map((g) => (
        <path key={g} d={g} fill={`url(#${id}-glass)`} stroke="#0b0d10" strokeWidth="1" />
      ))}
      {s.extra && <path d={s.extra} fill={shade(color, -0.6)} opacity="0.85" />}
      <path d={s.door} fill="none" stroke={shade(color, -0.55)} strokeWidth="0.9" />
      <rect x={s.head[0] - 6} y={s.head[1] - 3} width="12" height="6" rx="3" fill="#f6f1d6" stroke="#0b0d10" strokeWidth="0.6" />
      <rect x={s.tail[0] - 5} y={s.tail[1] - 2.5} width="10" height="5" rx="1.5" fill="#c4161c" stroke="#0b0d10" strokeWidth="0.6" />
      {s.wheels.map((x, i) => (
        <Wheel key={x} x={x} r={s.r} spin={i * 0.7} />
      ))}
    </g>
  );
}

type Props = {
  shape: CarShape;
  color: string;
  scene?: Scene;
  view?: "side" | "wheel" | "interior" | "badge";
  label?: string;
  className?: string;
};

export function CarArt({ shape, color, scene = "studio", view = "side", label, className }: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={label ?? t("Fahrzeugillustration", "Car illustration")}>
      {view === "side" && (
        <>
          <Backdrop scene={scene} id={id} />
          <CarSide shape={shape} color={color} id={id} />
        </>
      )}
      {view === "wheel" && (
        <>
          <rect width="400" height="160" fill={shade(color, -0.35)} />
          <circle cx="200" cy="80" r="92" fill={shade(color, -0.65)} />
          <g transform="translate(200,80) scale(3.1) translate(-100,-118)">
            <Wheel x={100} r={24} spin={0.3} />
          </g>
          <circle cx="200" cy="80" r="40" fill="none" stroke="#e8e4da" strokeOpacity="0.25" strokeWidth="0.8" />
        </>
      )}
      {view === "interior" && (
        <>
          <rect width="400" height="160" fill="#16120f" />
          <rect y="0" width="400" height="58" fill="#0d0b09" />
          {[130, 200, 270].map((x, i) => (
            <g key={x}>
              <circle cx={x} cy="44" r={i === 1 ? 26 : 20} fill="#0a0a0a" stroke="#6b6359" strokeWidth="2" />
              <line x1={x} y1="44" x2={x + Math.cos(-0.8 + i) * 16} y2={44 + Math.sin(-0.8 + i) * 16} stroke="#e7672a" strokeWidth="1.6" />
              <circle cx={x} cy="44" r="2" fill="#bbb" />
            </g>
          ))}
          <circle cx="200" cy="118" r="56" fill="none" stroke="#1d1a17" strokeWidth="14" />
          <circle cx="200" cy="118" r="56" fill="none" stroke="#3a332c" strokeWidth="2" />
          <rect x="146" y="112" width="108" height="12" rx="6" fill="#1d1a17" />
          <circle cx="200" cy="118" r="16" fill="#26211c" stroke={color} strokeWidth="2" />
        </>
      )}
      {view === "badge" && (
        <>
          <defs>
            <linearGradient id={`${id}-bd`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={shade(color, 0.2)} />
              <stop offset="1" stopColor={shade(color, -0.5)} />
            </linearGradient>
          </defs>
          <rect width="400" height="160" fill={`url(#${id}-bd)`} />
          <path d="M0,120 C120,96 280,96 400,120" stroke="#fff" strokeOpacity="0.15" strokeWidth="1.5" fill="none" />
          <text x="200" y="92" textAnchor="middle" fontFamily="'Brush Script MT', 'Snell Roundhand', cursive" fontSize="44" fill="#f2efe8" fillOpacity="0.92" fontStyle="italic">
            {label ?? ""}
          </text>
        </>
      )}
    </svg>
  );
}

export const GALLERY: { scene: Scene; view: Props["view"]; readonly caption: string }[] = [
  { scene: "mountain", view: "side", get caption() { return t("Seitenansicht · Alpenpass", "Side view · Alpine pass"); } },
  { scene: "studio", view: "side", caption: "Studio" },
  { scene: "none", view: "interior", caption: "Cockpit" },
  { scene: "none", view: "wheel", get caption() { return t("Felge", "Wheel"); } },
  { scene: "none", view: "badge", get caption() { return t("Schriftzug", "Badge"); } },
  { scene: "sunset", view: "side", get caption() { return t("Küstenstraße", "Coast road"); } },
  { scene: "city", view: "side", get caption() { return t("Stadt bei Nacht", "City at night"); } },
  { scene: "track", view: "side", get caption() { return t("Rennstrecke", "Race track"); } },
];
