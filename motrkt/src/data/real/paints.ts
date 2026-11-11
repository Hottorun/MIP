import data from "./paints.json";
import type { Variant } from "../types";

/**
 * Factory colour charts (Porsche Classic "Farbinformation" PDFs), built by hand from the scans and overview lists:
 * which paints the works offered, per series and model year. Hex values are approximations, see `measured`.
 */
export type PaintKind = "uni" | "metallic" | "perl" | "sonder";

export type PaintColor = {
  code?: string;
  name: string;
  kind: PaintKind;
  hex: string;
  /** Hex measured on the scanned chart (corrected for the aged paper); otherwise estimated from the name. */
  measured?: boolean;
  /** Model years the colour was offered, when the chart lists them per year. */
  years?: number[];
};

export type Palette = {
  id: string;
  series: string;
  /** Model years the chart covers. */
  years: [number, number];
  title: string;
  source: string;
  alsoSources?: string[];
  note?: string;
  perYear?: boolean;
  confidence?: "medium";
  colors: PaintColor[];
};

const D = data as unknown as { palettes: Palette[]; scope: Record<string, string[]>; notes: Record<string, string> };
const byId = new Map(D.palettes.map((p) => [p.id, p]));

/** Remark for a single variant where the charts do not tell the whole story. */
export const paintNote = (v: Variant): string | undefined => D.notes[v.id];

/** Model years a variant spans (build years; open-ended production runs up to this year). */
function window(v: Variant): [number, number] {
  return [v.years[0], v.years[1] ?? new Date().getFullYear()];
}

const overlaps = (ys: number[], [a, b]: [number, number]) => ys.some((y) => y >= a && y <= b);

export type PaintChartPart = { palette: Palette; colors: PaintColor[] };

/** The charts that apply to this variant's build years, each with the colours offered in those years. */
export function paintChart(v: Variant): PaintChartPart[] {
  const ids = D.scope[v.id] ?? D.scope[v.generationId] ?? [];
  const w = window(v);
  return ids
    .map((id) => byId.get(id)!)
    .filter((p) => p.years[0] <= w[1] && p.years[1] >= w[0])
    .map((p) => ({ palette: p, colors: p.colors.filter((c) => !c.years || overlaps(c.years, w)) }))
    .filter((x) => x.colors.length > 0);
}

/** Every colour offered for the variant, one per name (for pickers and demo data). */
export function paintsOfVariant(v: Variant): PaintColor[] {
  const seen = new Map<string, PaintColor>();
  for (const part of paintChart(v)) for (const c of part.colors) if (!seen.has(c.name)) seen.set(c.name, c);
  return [...seen.values()];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-zäöüß]/g, "")
    .replace(/metallic|metalleffekt|perlcolor/g, "");

/** The chart entry matching a named colour (e.g. the launch colour), if the chart lists it. */
export function findPaint(v: Variant, name: string): PaintColor | undefined {
  const n = norm(name);
  if (!n) return undefined;
  const hits = paintChart(v).flatMap((p) => p.colors.filter((c) => norm(c.name) === n));
  // Same name under several codes (Indischrot 027, later 80K): the one offered in the launch year.
  return hits.find((c) => !c.years || c.years.includes(v.years[0])) ?? hits[0];
}
