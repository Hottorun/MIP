import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, GitCompare, LayoutGrid, List, Search, Star, X } from "lucide-react";
import { brands, modelById, models, variantById, variantShortTitle, variantTitle, variants, yearsLabel } from "../data/db";
import { AS_OF, WEEK, getSeries } from "../data/generate";
import { getMetrics, rebase } from "../data/market";
import type { Variant } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, num, pct } from "../lib/format";
import { CarImage } from "../components/CarImage";
import { BrandEmblem, ChartTooltipBox, Delta, Empty, Modal, Pill, ScoreBar, Segmented, Sparkline, axisProps } from "../components/ui";

type SortKey = "value" | "change12m" | "cagr5" | "rarity" | "liquidity" | "year" | "name";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "value", label: "Marktwert" },
  { value: "change12m", label: "12M" },
  { value: "cagr5", label: "CAGR 5J" },
  { value: "rarity", label: "Rarity" },
  { value: "liquidity", label: "Liquidität" },
  { value: "year", label: "Bauzeit" },
];
const ERAS = [
  { id: "pre70", label: "Vor 1970", test: (y: number) => y < 1970 },
  { id: "70s80s", label: "1970–1989", test: (y: number) => y >= 1970 && y < 1990 },
  { id: "90s", label: "1990–2004", test: (y: number) => y >= 1990 && y < 2005 },
  { id: "modern", label: "Ab 2005", test: (y: number) => y >= 2005 },
];
const TAGS = ["Turbo", "Leichtbau", "Allrad", "Hybrid"];
const COMPARE_COLORS = ["#d4a24c", "#5f8fd6", "#4fc48c", "#c2416b"];
const MAX_COMPARE = 4;

function sortValue(v: Variant, key: SortKey): number | string {
  const m = getMetrics(v.id);
  switch (key) {
    case "value":
      return m.value;
    case "change12m":
      return m.change12m;
    case "cagr5":
      return m.cagr5;
    case "rarity":
      return m.rarityScore;
    case "liquidity":
      return m.liquidity;
    case "year":
      return v.years[0];
    case "name":
      return variantTitle(v);
  }
}

export default function Models() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { watchlist, toggleWatch, toast } = useStore();
  const brandId = params.get("marke") ?? "";
  const modelId = params.get("modell") ?? "";
  const effectiveBrand = brandId || (modelId ? modelById.get(modelId)?.brandId ?? "" : "");

  const [query, setQuery] = useState("");
  const [era, setEra] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("value");
  const [desc, setDesc] = useState(true);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const setFilter = (next: { marke?: string; modell?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const eraDef = ERAS.find((e) => e.id === era);
    const list = variants.filter((v) => {
      if (effectiveBrand && v.brandId !== effectiveBrand) return false;
      if (modelId && v.modelId !== modelId) return false;
      if (eraDef && !eraDef.test(v.years[0])) return false;
      if (tags.length && !tags.every((t) => v.tags.includes(t))) return false;
      if (q && !variantTitle(v).toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const x = sortValue(a, sort);
      const y = sortValue(b, sort);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return desc ? -c : c;
    });
  }, [effectiveBrand, modelId, era, tags, query, sort, desc]);

  const brandModels = models.filter((m) => !effectiveBrand || m.brandId === effectiveBrand);

  const toggleCompare = (id: string) => {
    setCompare((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= MAX_COMPARE) {
        toast(`Maximal ${MAX_COMPARE} Fahrzeuge vergleichen`, "info");
        return c;
      }
      return [...c, id];
    });
  };

  const headerSort = (key: SortKey) => {
    if (sort === key) setDesc((d) => !d);
    else {
      setSort(key);
      setDesc(key !== "name");
    }
  };

  return (
    <div className={cn("space-y-4", compare.length > 0 && "pb-20")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Modelle & Varianten</h1>
          <p className="text-sm text-muted">
            {filtered.length} von {variants.length} Varianten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            options={[
              { value: "grid", label: <LayoutGrid className="size-3.5" /> },
              { value: "table", label: <List className="size-3.5" /> },
            ]}
            value={view}
            onChange={(v) => setView(v as "grid" | "table")}
          />
        </div>
      </div>

      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={cn("chip", !effectiveBrand && "chip-active")} onClick={() => setFilter({ marke: "", modell: "" })}>
            Alle Marken
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              className={cn("chip", effectiveBrand === b.id && "chip-active")}
              onClick={() => setFilter({ marke: effectiveBrand === b.id ? "" : b.id, modell: "" })}
            >
              <BrandEmblem brandId={b.id} size={14} /> {b.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-56 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 focus-within:border-gold/60">
            <Search className="size-3.5 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Variante suchen …" className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Leeren">
                <X className="size-3.5 text-muted" />
              </button>
            )}
          </div>
          <select
            className="input h-8 w-48 py-0"
            value={modelId}
            onChange={(e) => setFilter({ modell: e.target.value, marke: e.target.value ? modelById.get(e.target.value)!.brandId : effectiveBrand })}
            aria-label="Modell"
          >
            <option value="">Alle Modelle</option>
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {effectiveBrand ? "" : `${brands.find((b) => b.id === m.brandId)!.name} `}
                {m.name}
              </option>
            ))}
          </select>
          <select className="input h-8 w-36 py-0" value={era} onChange={(e) => setEra(e.target.value)} aria-label="Epoche">
            <option value="">Alle Epochen</option>
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            {TAGS.map((t) => (
              <button key={t} className={cn("chip", tags.includes(t) && "chip-active")} onClick={() => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}>
                {t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            Sortieren
            <select className="input h-8 w-32 py-0" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sortierung">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn h-8 px-2" onClick={() => setDesc((d) => !d)} aria-label="Richtung umkehren">
              {desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>Keine Varianten für diese Filter.</Empty>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((v) => (
            <VariantCard
              key={v.id}
              v={v}
              watched={watchlist.includes(v.id)}
              compared={compare.includes(v.id)}
              onWatch={() => toggleWatch(v.id)}
              onCompare={() => toggleCompare(v.id)}
              onOpen={() => navigate(`/markt/${v.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table-base table-hover">
            <thead>
              <tr>
                <th />
                <SortTh label="Fahrzeug" k="name" sort={sort} desc={desc} onSort={headerSort} />
                <SortTh label="Bauzeit" k="year" sort={sort} desc={desc} onSort={headerSort} />
                <th className="text-right">Stückzahl</th>
                <SortTh label="Marktwert" k="value" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label="12M" k="change12m" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label="CAGR 5J" k="cagr5" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label="Rarity" k="rarity" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label="Liquidität" k="liquidity" sort={sort} desc={desc} onSort={headerSort} right />
                <th>5J</th>
                <th>Einschätzung</th>
                <th>Vergl.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const m = getMetrics(v.id);
                return (
                  <tr key={v.id} onClick={() => navigate(`/markt/${v.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleWatch(v.id)} aria-label="Watchlist" className={watchlist.includes(v.id) ? "text-gold" : "text-faint hover:text-ink"}>
                        <Star className={cn("size-3.5", watchlist.includes(v.id) && "fill-current")} />
                      </button>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <BrandEmblem brandId={v.brandId} size={16} />
                        {variantTitle(v)}
                      </span>
                    </td>
                    <td className="text-muted">{yearsLabel(v.years)}</td>
                    <td className="text-right tabular-nums text-muted">{num(v.production)}</td>
                    <td className="text-right font-medium tabular-nums">{eur(m.value)}</td>
                    <td className="text-right">
                      <Delta value={m.change12m} />
                    </td>
                    <td className="text-right tabular-nums">{pct(m.cagr5)}</td>
                    <td className="text-right tabular-nums">{m.rarityScore}</td>
                    <td className="text-right tabular-nums">{m.liquidity}</td>
                    <td>
                      <Sparkline values={getSeries(v.id).slice(-260).filter((_, i) => i % 4 === 0).map((p) => p.value)} width={80} height={22} />
                    </td>
                    <td>
                      <RecPill code={m.recommendation.code} label={m.recommendation.label} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="accent-[var(--color-gold)]" checked={compare.includes(v.id)} onChange={() => toggleCompare(v.id)} aria-label="Vergleichen" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 lg:pl-64">
          <div className="panel animate-fade-in flex w-full max-w-4xl flex-wrap items-center gap-2 px-4 py-2.5 shadow-2xl shadow-black/60">
            <GitCompare className="size-4 text-gold" />
            <span className="text-sm text-muted">
              Vergleich ({compare.length}/{MAX_COMPARE})
            </span>
            {compare.map((id, i) => (
              <span key={id} className="chip text-ink">
                <span className="size-2 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                {variantShortTitle(variantById.get(id)!)}
                <button onClick={() => toggleCompare(id)} aria-label="Entfernen">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <div className="ml-auto flex gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setCompare([])}>
                Leeren
              </button>
              <button className="btn btn-gold" disabled={compare.length < 2} onClick={() => setCompareOpen(true)}>
                Vergleichen
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title="Variantenvergleich" wide>
        <CompareView ids={compare} />
      </Modal>
    </div>
  );
}

function RecPill({ code, label }: { code: "BUY" | "HOLD" | "WATCH"; label: string }) {
  return <Pill tone={code === "BUY" ? "up" : code === "HOLD" ? "gold" : "neutral"}>{label}</Pill>;
}

function SortTh({ label, k, sort, desc, onSort, right }: { label: string; k: SortKey; sort: SortKey; desc: boolean; onSort: (k: SortKey) => void; right?: boolean }) {
  return (
    <th className={cn(right && "text-right")}>
      <button className={cn("inline-flex items-center gap-0.5 hover:text-ink", sort === k && "text-gold-2")} onClick={() => onSort(k)}>
        {label}
        {sort === k && (desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
}

function VariantCard({
  v,
  watched,
  compared,
  onWatch,
  onCompare,
  onOpen,
}: {
  v: Variant;
  watched: boolean;
  compared: boolean;
  onWatch: () => void;
  onCompare: () => void;
  onOpen: () => void;
}) {
  const m = getMetrics(v.id);
  const spark = getSeries(v.id)
    .slice(-260)
    .filter((_, i) => i % 3 === 0)
    .map((p) => p.value);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn("panel group cursor-pointer overflow-hidden transition-colors hover:border-gold/50", compared && "border-gold/60")}
    >
      <div className="relative">
        <CarImage variant={v} scene="studio" className="block aspect-[5/2] w-full" label={variantTitle(v)} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWatch();
          }}
          className={cn("absolute top-2 right-2 rounded-full bg-black/40 p-1.5 backdrop-blur", watched ? "text-gold" : "text-ink/70 hover:text-ink")}
          aria-label={watched ? "Von Watchlist entfernen" : "Zur Watchlist"}
        >
          <Star className={cn("size-4", watched && "fill-current")} />
        </button>
        <div className="absolute top-2 left-2">
          <RecPill code={m.recommendation.code} label={m.recommendation.label} />
        </div>
      </div>
      <div className="space-y-2 px-3.5 pt-2.5 pb-3">
        <div className="flex items-start gap-2">
          <BrandEmblem brandId={v.brandId} size={18} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium group-hover:text-gold-2">{variantTitle(v)}</div>
            <div className="text-xs text-muted">
              {yearsLabel(v.years)} · {num(v.production)} Stk. · {v.hp} PS
            </div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-lg font-semibold tabular-nums">{eur(m.value)}</div>
            <div className="flex gap-3 text-xs">
              <span>
                <span className="text-muted">12M </span>
                <Delta value={m.change12m} arrow={false} />
              </span>
              <span>
                <span className="text-muted">CAGR </span>
                <span className="tabular-nums">{pct(m.cagr5)}</span>
              </span>
            </div>
          </div>
          <Sparkline values={spark} width={96} height={32} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>Rarity</span>
            <span className="tabular-nums">{m.rarityScore}/100</span>
          </div>
          <ScoreBar value={m.rarityScore} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="accent-[var(--color-gold)]" checked={compared} onChange={onCompare} />
          Vergleichen
        </label>
      </div>
    </div>
  );
}

function CompareView({ ids }: { ids: string[] }) {
  const from = AS_OF - 260 * WEEK;
  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    ids.forEach((id) => {
      for (const p of rebase(getSeries(id), from)) {
        const row = rows.get(p.t) ?? { t: p.t };
        row[id] = p.value;
        rows.set(p.t, row);
      }
    });
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [ids, from]);

  const ticks = useMemo(() => {
    if (!data.length) return [];
    const out: number[] = [];
    for (let y = new Date(data[0].t).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= data[data.length - 1].t; y++) out.push(Date.UTC(y, 0, 1));
    return out;
  }, [data]);

  const metricRows: { label: string; get: (v: Variant) => React.ReactNode }[] = [
    { label: "Marktwert", get: (v) => eur(getMetrics(v.id).value) },
    { label: "12M", get: (v) => <Delta value={getMetrics(v.id).change12m} /> },
    { label: "CAGR 5J", get: (v) => pct(getMetrics(v.id).cagr5) },
    { label: "Volatilität 1J", get: (v) => pct(getMetrics(v.id).vol1y, { signed: false }) },
    { label: "Max. Drawdown 5J", get: (v) => <span className="text-down">{pct(getMetrics(v.id).maxDD5)}</span> },
    { label: "Rarity", get: (v) => `${getMetrics(v.id).rarityScore}/100` },
    { label: "Liquidität", get: (v) => `${getMetrics(v.id).liquidity}/100` },
    { label: "Stückzahl", get: (v) => num(v.production) },
    { label: "Leistung", get: (v) => `${v.hp} PS` },
    { label: "Neupreis", get: (v) => `${eur(v.newPrice)} (${v.years[0]})` },
    { label: "Einschätzung", get: (v) => <RecPill code={getMetrics(v.id).recommendation.code} label={getMetrics(v.id).recommendation.label} /> },
  ];
  const vs = ids.map((id) => variantById.get(id)!);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs text-muted">Wertentwicklung 5 Jahre (indexiert, Start = 100)</div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(t) => date(t, "year")} {...axisProps} />
              <YAxis {...axisProps} width={44} domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <ChartTooltipBox
                      title={date(payload[0].payload.t)}
                      rows={payload.map((p) => ({
                        label: variantShortTitle(variantById.get(String(p.dataKey))!),
                        value: num(Number(p.value), 1),
                        color: String(p.color),
                      }))}
                    />
                  ) : null
                }
              />
              <Legend formatter={(id) => <span className="text-xs text-muted">{variantShortTitle(variantById.get(String(id))!)}</span>} />
              {ids.map((id, i) => (
                <Line key={id} dataKey={id} stroke={COMPARE_COLORS[i]} dot={false} strokeWidth={1.8} isAnimationActive={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th />
              {vs.map((v, i) => (
                <th key={v.id} className="text-right">
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                    {variantShortTitle(v)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((r) => (
              <tr key={r.label}>
                <td className="text-muted">{r.label}</td>
                {vs.map((v) => (
                  <td key={v.id} className="text-right tabular-nums">
                    {r.get(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
