import { useEffect, useState } from "react";
import { Check, Hash, Percent } from "lucide-react";
import { generationById, variantById, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics, inflationFactor } from "../../data/market";
import { MARKET_TO_ISO } from "../../data/generate";
import { cn, eur, flag, num, pct } from "../../lib/format";
import { Card, Donut } from "../ui";
import { WorldMap, type MarketRegion } from "../WorldMap";

export function ProductionCard({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const rows = (split: Partial<Record<string, number>>) =>
    Object.entries(split)
      .filter(([, share]) => (share ?? 0) > 0)
      .map(([name, share]) => ({ name, share: share!, count: Math.round(variant.production * share!) }));
  const max = Math.max(...rows(variant.body).map((r) => r.count), ...rows(variant.gearbox).map((r) => r.count));
  const Split = ({ title, data }: { title: string; data: ReturnType<typeof rows> }) => (
    <div className="mt-2">
      <div className="mb-1 text-xs font-medium text-ink">
        {title} <span className="font-normal text-muted">(Stück / Anteil)</span>
      </div>
      {data.map((r) => (
        <div key={r.name} className="flex items-center gap-2 py-0.5 text-[13px]">
          <span className="size-1.5 shrink-0 rounded-full bg-rose" />
          <span className="w-24 truncate text-muted">{r.name === "Manual" ? "Schaltgetriebe" : r.name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel-3">
            <span className="block h-full rounded-full bg-gradient-to-r from-rose/60 to-rose" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="w-28 text-right tabular-nums text-muted">
            {num(r.count)} ({pct(r.share, { signed: false, digits: 0 })})
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <Card title="Stückzahl & Seltenheit">
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1.5 text-[13px]">
          <div className="flex items-center gap-2">
            <Hash className="size-3.5 text-muted" />
            <span className="flex-1 text-muted">Produktion gesamt</span>
            <span className="font-medium tabular-nums">{num(variant.production)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Percent className="size-3.5 text-muted" />
            <span className="flex-1 text-muted">Rarity (Perzentil)</span>
            <span className="font-medium tabular-nums">{m.rarityPercentile} %</span>
          </div>
        </div>
        <Donut segments={[{ value: m.rarityScore, color: "var(--color-gold)" }, { value: 100 - m.rarityScore, color: "transparent" }]} size={84} thickness={9}>
          <span className="text-sm font-semibold tabular-nums">{num(variant.production)}</span>
          <span className="text-[10px] text-muted">Stück</span>
        </Donut>
      </div>
      <Split title="Karosserie" data={rows(variant.body)} />
      <Split title="Getriebe" data={rows(variant.gearbox)} />
    </Card>
  );
}

export function SpecsCard({ variant }: { variant: Variant }) {
  const gen = generationById.get(variant.generationId)!;
  const names = gen.variantIds.map((id) => variantById.get(id)!.name);
  const rows: [string, string][] = [
    ["Baujahre", yearsLabel(variant.years)],
    ["Generation", `${gen.name} (${yearsLabel(gen.years)})`],
    ["Varianten", names.length > 1 ? names.join(", ") : variant.name],
    ["Motor", `${num(variant.liters, 1)} l · ${variant.hp} PS`],
    ["Antrieb", variant.drive],
    ["Getriebe", variant.transmission],
    ["Karosserie", Object.keys(variant.body).join(", ")],
    ["Option-Cluster", [...variant.tags, ...variant.options.filter((o) => !o.standard).slice(0, 2).map((o) => o.name.replace(/ \(.+\)$/, ""))].join(", ") || "–"],
  ];
  return (
    <Card title="Baujahre & Varianten">
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function MarketsCard({ variant }: { variant: Variant }) {
  const [hover, setHover] = useState<MarketRegion | null>(null);
  const shares = Object.fromEntries(variant.markets.map((m) => [m.country, m.share])) as Partial<Record<MarketRegion, number>>;
  const flagFor = (country: string) => (MARKET_TO_ISO[country] ? flag(MARKET_TO_ISO[country]) : country === "Rest Europa" ? "🇪🇺" : "🌍");
  return (
    <Card title="Märkte / Auslieferung" sub="(Erstauslieferung)">
      <div className="grid grid-cols-[minmax(0,1fr)_168px] items-center gap-3">
        <div>
          <WorldMap shares={shares} highlight={hover} />
          <p className="mt-1 text-[10px] leading-snug text-faint">Erstauslieferungsland laut Werksdaten; Intensität = Anteil an der Produktion</p>
        </div>
        <ul className="space-y-1 text-[13px]">
          {variant.markets.map((m) => (
            <li
              key={m.country}
              onMouseEnter={() => setHover(m.country as MarketRegion)}
              onMouseLeave={() => setHover(null)}
              className={cn("flex items-center gap-2 rounded px-1 py-0.5", hover === m.country && "bg-panel-3")}
            >
              <span className="w-5 text-center">{flagFor(m.country)}</span>
              <span className="flex-1 whitespace-nowrap text-muted">{m.country}</span>
              <span className="tabular-nums">{num(m.share, 1)} %</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function PriceOptionsCard({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [variant.id]);
  const impact = variant.options.filter((o) => !o.standard && selected.has(o.name)).reduce((f, o) => f * (1 + o.impact), 1);
  const year = variant.years[0];
  return (
    <Card title="Neupreis & Optionen">
      <dl className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Neupreis (DE, {year})</dt>
          <dd className="tabular-nums">{eur(variant.newPrice)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Inflationsbereinigt (2026)</dt>
          <dd className="tabular-nums">~ {eur(Math.round((variant.newPrice * inflationFactor(year)) / 1000) * 1000)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Marktwert vs. Neupreis (real)</dt>
          <dd className="tabular-nums text-gold-2">× {num(m.value / (variant.newPrice * inflationFactor(year)), 1)}</dd>
        </div>
      </dl>
      <div className="mt-3 mb-1 text-xs font-medium text-ink">Wesentliche Optionen (Auswahl)</div>
      <ul className="space-y-1">
        {variant.options.map((o) => {
          const checked = o.standard || selected.has(o.name);
          return (
            <li key={o.name}>
              <button
                disabled={o.standard}
                onClick={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(o.name)) n.delete(o.name);
                    else n.add(o.name);
                    return n;
                  })
                }
                className="flex w-full items-center gap-2 text-left text-[13px] disabled:cursor-default"
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", checked ? "border-ink/70 bg-ink/80 text-black" : "border-line-2")}>
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn("flex-1", o.standard ? "text-muted" : "text-ink")}>{o.name}</span>
                {!o.standard && <span className={cn("text-xs tabular-nums", o.impact >= 0 ? "text-up" : "text-down")}>{pct(o.impact, { digits: 0 })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-[13px]">
        <span className="text-muted">Wert mit Auswahl</span>
        <span className="font-semibold tabular-nums">
          {eur(Math.round((m.value * impact) / 1000) * 1000)} {impact !== 1 && <span className={cn("ml-1 text-xs", impact > 1 ? "text-up" : "text-down")}>{pct(impact - 1)}</span>}
        </span>
      </div>
    </Card>
  );
}
