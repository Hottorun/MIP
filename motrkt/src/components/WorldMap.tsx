import type { ReactElement } from "react";

/** Dot-matrix world map (equirectangular, 64×28 cells) with market regions highlighted by share. */

// Land as column ranges per row (row 0 ≈ 78°N … row 27 ≈ 56°S; col 0 = 180°W, 5.625° per column).
const LAND: [number, number][][] = [
  [[11, 19], [21, 28], [42, 48]],
  [[10, 20], [21, 28], [44, 56]],
  [[2, 7], [8, 20], [22, 27], [34, 37], [37, 63]],
  [[2, 8], [8, 21], [23, 26], [28, 28], [33, 37], [37, 62]],
  [[7, 14], [18, 21], [31, 31], [33, 35], [36, 60]],
  [[7, 22], [30, 31], [32, 39], [39, 57]],
  [[9, 20], [31, 39], [39, 55], [57, 57]],
  [[9, 20], [30, 37], [39, 55], [56, 57]],
  [[10, 19], [30, 32], [34, 35], [36, 39], [40, 55], [56, 56]],
  [[10, 18], [30, 37], [37, 42], [42, 54]],
  [[10, 15], [17, 17], [29, 38], [38, 41], [43, 54]],
  [[11, 15], [17, 18], [29, 38], [38, 41], [44, 47], [48, 53]],
  [[13, 16], [29, 39], [40, 40], [45, 46], [49, 51], [53, 53]],
  [[15, 17], [29, 40], [45, 45], [49, 50], [53, 53]],
  [[18, 21], [30, 40], [46, 46], [50, 50]],
  [[18, 23], [32, 40], [49, 53]],
  [[18, 24], [33, 39], [50, 55], [56, 58]],
  [[18, 25], [33, 39], [51, 53], [56, 58]],
  [[19, 25], [33, 39], [55, 57]],
  [[19, 24], [34, 38], [40, 40], [52, 58]],
  [[20, 24], [34, 37], [40, 40], [51, 58]],
  [[20, 23], [34, 37], [51, 58]],
  [[20, 22], [34, 36], [52, 57]],
  [[20, 22], [55, 57], [61, 61]],
  [[20, 21], [56, 56], [61, 62]],
  [[20, 21], [61, 61]],
  [[20, 21]],
  [],
];

export type MarketRegion = "Deutschland" | "USA" | "UK" | "Japan" | "Rest Europa" | "Naher Osten";

function regionOf(c: number, r: number): MarketRegion | null {
  if (c >= 30 && c <= 31 && r >= 4 && r <= 5) return "UK";
  if (c >= 33 && c <= 34 && r >= 5 && r <= 6) return "Deutschland";
  if (c >= 56 && c <= 57 && r >= 6 && r <= 8) return "Japan";
  if ((c >= 9 && c <= 20 && r >= 6 && r <= 10) || (c >= 2 && c <= 8 && r >= 2 && r <= 3)) return "USA";
  if (c >= 37 && c <= 42 && r >= 9 && r <= 12) return "Naher Osten";
  if (c >= 30 && c <= 39 && r >= 2 && r <= 8) return "Rest Europa";
  return null;
}

export function WorldMap({ shares, highlight }: { shares: Partial<Record<MarketRegion, number>>; highlight?: MarketRegion | null }) {
  const max = Math.max(1, ...Object.values(shares).map((v) => v ?? 0));
  const dots: ReactElement[] = [];
  LAND.forEach((ranges, r) =>
    ranges.forEach(([a, b]) => {
      for (let c = a; c <= b; c++) {
        const region = regionOf(c, r);
        const share = region ? shares[region] ?? 0 : 0;
        const active = region && share > 0;
        const strong = highlight && region === highlight;
        dots.push(
          <circle
            key={`${r}-${c}`}
            cx={c * 6 + 3}
            cy={r * 6 + 3}
            r={active ? 2.2 : 1.6}
            fill={active ? "var(--color-gold)" : "var(--color-line-2)"}
            opacity={active ? (strong ? 1 : 0.35 + 0.65 * (share / max)) : 0.9}
          />,
        );
      }
    }),
  );
  return (
    <svg viewBox="0 0 384 168" className="h-auto w-full" role="img" aria-label="Weltkarte der Erstauslieferungen">
      {dots}
    </svg>
  );
}
