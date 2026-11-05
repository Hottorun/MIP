/** Deterministic PRNG helpers so the generated market data is identical on every load. */

export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export type Rng = {
  next(): number; // [0, 1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // inclusive
  normal(mean?: number, sd?: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T extends string>(weights: Partial<Record<T, number>>): T;
  chance(p: number): boolean;
  poisson(lambda: number): number;
};

export function rng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const r: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    normal(mean = 0, sd = 1) {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mean + sd * s;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted(weights) {
      const entries = Object.entries(weights) as [string, number][];
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [k, w] of entries) {
        x -= w;
        if (x <= 0) return k as never;
      }
      return entries[entries.length - 1][0] as never;
    },
    chance: (p) => next() < p,
    poisson(lambda) {
      if (lambda <= 0) return 0;
      if (lambda > 30) return Math.max(0, Math.round(r.normal(lambda, Math.sqrt(lambda))));
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
  };
  return r;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
