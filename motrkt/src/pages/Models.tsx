import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, GitCompare, Search, Star, X } from "lucide-react";
import { MODEL_CATEGORIES, brandById, brands, generationById, genName, modelById, modelName, models, variantById, variantName, variantShortTitle, variantTitle, variants, yearsLabel } from "../data/db";
import { AS_OF, WEEK, getSeries } from "../data/generate";
import { getMetrics, rebase } from "../data/market";
import type { ModelCategory, Variant } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, num, pct } from "../lib/format";
import { CarImage } from "../components/CarImage";
import { ChartTooltipBox, Delta, Empty, Modal, Pill, Segmented, axisProps, Money } from "../components/ui";
import { t } from "../i18n";
import { tr } from "../i18n/terms";

type SortKey = "series" | "value" | "change12m" | "cagr5" | "rarity" | "liquidity" | "year" | "name";
const SORTS: { value: SortKey; readonly label: string }[] = [
  { value: "series", get label() { return t("Modellreihe", "Model series"); } },
  { value: "value", get label() { return t("Marktwert", "Market value"); } },
  { value: "change12m", label: "12M" },
  { value: "cagr5", get label() { return t("CAGR 5J", "CAGR 5Y"); } },
  { value: "year", get label() { return t("Bauzeit", "Build years"); } },
];
const ERAS = [
  { id: "pre70", get label() { return t("Vor 1970", "Before 1970"); }, test: (y: number) => y < 1970 },
  { id: "70s80s", label: "1970–1989", test: (y: number) => y >= 1970 && y < 1990 },
  { id: "90s", label: "1990–2004", test: (y: number) => y >= 1990 && y < 2005 },
  { id: "modern", get label() { return t("Ab 2005", "From 2005"); }, test: (y: number) => y >= 2005 },
];
const TAGS = ["Turbo", "Leichtbau", "Allrad", "Hybrid"];
const COMPARE_COLORS = ["#8b6232", "#3f5e4a", "#9a3b2c", "#4d6378"];
const MAX_COMPARE = 4;

/** Section of the model list: one per generation for models with several (911: 964 … 992), else one per model. */
type Section = { key: string; title: string; sub: string; category: ModelCategory; items: Variant[] };

/** One line per model family, shown above its first section in the model list. */
const CATEGORY_INTRO: Record<ModelCategory, string> = {
  get heck() { return t("356, 911 und ihre Ableger: der Motor sitzt hinter der Hinterachse.", "356, 911 and their offshoots: the engine sits behind the rear axle."); },
  get mittel() { return t("Boxster, Cayman und 718: der Motor sitzt vor der Hinterachse.", "Boxster, Cayman and 718: the engine sits ahead of the rear axle."); },
  get front() { return t("924, 944, 968 und 928: Frontmotor, Getriebe an der Hinterachse (Transaxle).", "924, 944, 968 and 928: front engine, gearbox at the rear axle (transaxle)."); },
  get super() { return t("959, Carrera GT und 918 Spyder: Technikträger in Kleinserie.", "959, Carrera GT and 918 Spyder: technology flagships built in small numbers."); },
  get motorsport() {
    return t(
      "Rennwagen, die Porsche an Kundenteams und Privatfahrer verkauft hat, vom 550 Spyder bis zum 963.",
      "Race cars Porsche sold to customer teams and privateers, from the 550 Spyder to the 963.",
    );
  },
};

function sectionOf(v: Variant) {
  const model = modelById.get(v.modelId)!;
  if (model.generationIds.length > 1) {
    const gen = generationById.get(v.generationId)!;
    return { key: gen.id, title: `${modelName(model)} (${genName(gen)})`, sub: yearsLabel(gen.years), order: models.indexOf(model) * 100 + model.generationIds.indexOf(gen.id) };
  }
  return { key: model.id, title: modelName(model), sub: "", order: models.indexOf(model) * 100 };
}

function groupSections(list: Variant[]): Section[] {
  const map = new Map<string, Section & { order: number }>();
  for (const v of list) {
    const s = sectionOf(v);
    if (!map.has(s.key)) {
      const brand = brandById.get(v.brandId)!;
      map.set(s.key, { key: s.key, title: `${brand.name} ${s.title}`, sub: s.sub, category: modelById.get(v.modelId)!.category, order: s.order, items: [] });
    }
    map.get(s.key)!.items.push(v);
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

/** Catalog order: generations in build order, within each standard models first, special models last. */
const seriesIndex = new Map(variants.map((v, i) => [v.id, i]));
/** Sorts that read naturally ascending (A→Z, oldest first, catalog order). */
const ASCENDING: SortKey[] = ["series", "name", "year"];

function sortValue(v: Variant, key: SortKey): number | string {
  const m = getMetrics(v.id);
  // Without a measured value there is nothing to rank: such variants go to the end.
  if (!v.measured && (key === "value" || key === "change12m" || key === "cagr5" || key === "liquidity")) return -Infinity;
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
    case "series":
      return seriesIndex.get(v.id)!;
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
  const generationId = params.get("generation") ?? "";
  const variantId = params.get("variante") ?? "";
  const category = (params.get("kategorie") ?? "") as ModelCategory | "";
  const effectiveBrand = brandId || (modelId ? modelById.get(modelId)?.brandId ?? "" : "");

  const [query, setQuery] = useState("");
  const [era, setEra] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("series");
  const [desc, setDesc] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const setFilter = (next: { marke?: string; modell?: string; generation?: string; variante?: string; kategorie?: string }) => {
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
      if (category && modelById.get(v.modelId)!.category !== category) return false;
      if (generationId && v.generationId !== generationId) return false;
      if (variantId && v.id !== variantId) return false;
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
  }, [effectiveBrand, modelId, generationId, variantId, category, era, tags, query, sort, desc]);
  const sections = useMemo(() => groupSections(filtered), [filtered]);
  // Family headings ("Mittelmotor") only when the list spans more than one family.
  const showCategories = new Set(sections.map((s) => s.category)).size > 1;
  const categoryHead = (s: Section, i: number) => showCategories && (i === 0 || sections[i - 1].category !== s.category);
  const selectedModel = modelId ? modelById.get(modelId) : undefined;
  const modelGenerations = selectedModel && selectedModel.generationIds.length > 1 ? selectedModel.generationIds.map((id) => generationById.get(id)!) : [];
  // Variants of the chosen generation (or of a single-generation model), in catalog order: e.g. 964 → Carrera 2, Carrera 4, Carrera RS …
  const variantGenId = generationId || (selectedModel?.generationIds.length === 1 ? selectedModel.generationIds[0] : "");
  const subVariants = variantGenId ? generationById.get(variantGenId)!.variantIds.map((id) => variantById.get(id)!) : [];

  const brandModels = models.filter((m) => !effectiveBrand || m.brandId === effectiveBrand);

  const toggleCompare = (id: string) => {
    setCompare((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= MAX_COMPARE) {
        toast(t(`Maximal ${MAX_COMPARE} Fahrzeuge vergleichen`, `Compare up to ${MAX_COMPARE} cars`), "info");
        return c;
      }
      return [...c, id];
    });
  };

  const headerSort = (key: SortKey) => {
    if (sort === key) setDesc((d) => !d);
    else {
      setSort(key);
      setDesc(!ASCENDING.includes(key));
    }
  };

  return (
    <div className={cn("space-y-8", compare.length > 0 && "pb-24")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">{t("Modelle", "Models")}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {t(`${filtered.length} von ${variants.length} Varianten`, `${filtered.length} of ${variants.length} variants`)}
          </p>
        </div>
        <Segmented
          options={[
            { value: "grid", label: t("Galerie", "Gallery") },
            { value: "table", label: t("Liste", "List") },
          ]}
          value={view}
          onChange={(v) => setView(v as "grid" | "table")}
        />
      </div>

      <div className="space-y-4 border-y border-line py-5">
        {brands.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button className={cn("chip", !effectiveBrand && "chip-active")} onClick={() => setFilter({ marke: "", modell: "", generation: "", variante: "" })}>
              {t("Alle Marken", "All brands")}
            </button>
            {brands.map((b) => (
              <button
                key={b.id}
                className={cn("chip", effectiveBrand === b.id && "chip-active")}
                onClick={() => setFilter({ marke: effectiveBrand === b.id ? "" : b.id, modell: "", generation: "", variante: "" })}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            className={cn("chip", !modelId && !category && "chip-active")}
            onClick={() => setFilter({ modell: "", generation: "", variante: "", kategorie: "" })}
          >
            {t("Alle Modelle", "All models")}
          </button>
          {/* Models grouped by family; the family label filters the whole family. */}
          {MODEL_CATEGORIES.map((c) => {
            const familyModels = brandModels.filter((m) => m.category === c.id);
            if (familyModels.length === 0) return null;
            const familyActive = category === c.id && !modelId;
            return (
              <div key={c.id} role="group" aria-label={c.label} className="flex flex-wrap items-center gap-1.5 border-l border-line pl-4">
                <button
                  className={cn(
                    "mr-1 rounded-full px-1 text-[11.5px] tracking-[0.1em] uppercase transition-colors hover:text-ink",
                    familyActive ? "font-semibold text-ink" : "text-muted",
                  )}
                  aria-pressed={familyActive}
                  title={t(`Alle ${c.label}-Modelle zeigen`, `Show all ${c.label.toLowerCase()} models`)}
                  onClick={() => setFilter({ kategorie: familyActive ? "" : c.id, modell: "", generation: "", variante: "" })}
                >
                  {c.label}
                </button>
                {familyModels.map((m) => (
                  <button
                    key={m.id}
                    className={cn("chip", modelId === m.id && "chip-active")}
                    onClick={() =>
                      setFilter({ modell: modelId === m.id ? "" : m.id, marke: modelId === m.id ? effectiveBrand : m.brandId, generation: "", variante: "", kategorie: "" })
                    }
                  >
                    {effectiveBrand || brands.length === 1 ? "" : `${brands.find((b) => b.id === m.brandId)!.name} `}
                    {modelName(m)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        {modelGenerations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] text-muted">Generation</span>
            <button className={cn("chip", !generationId && "chip-active")} onClick={() => setFilter({ generation: "", variante: "" })}>
              {t("Alle", "All")}
            </button>
            {modelGenerations.map((g) => (
              <button key={g.id} className={cn("chip", generationId === g.id && "chip-active")} onClick={() => setFilter({ generation: generationId === g.id ? "" : g.id, variante: "" })}>
                {genName(g)} <span className="text-faint">{yearsLabel(g.years)}</span>
              </button>
            ))}
          </div>
        )}
        {subVariants.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] text-muted">{t("Variante", "Variant")}</span>
            <button className={cn("chip", !variantId && "chip-active")} onClick={() => setFilter({ variante: "" })}>
              {t("Alle", "All")}
            </button>
            {subVariants.map((v) => (
              <button key={v.id} className={cn("chip", variantId === v.id && "chip-active")} onClick={() => setFilter({ variante: variantId === v.id ? "" : v.id })}>
                {variantName(v)}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
          <div className="flex w-60 items-center gap-2 border-b border-line-2 pb-1 focus-within:border-ink">
            <Search className="size-4 text-muted" strokeWidth={1.5} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Variante suchen", "Search variants")} className="min-w-0 flex-1 bg-transparent focus:outline-none" />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t("Suche leeren", "Clear search")}>
                <X className="size-3.5 text-muted" />
              </button>
            )}
          </div>
          <select className="border-b border-line-2 pb-1 focus:border-ink focus:outline-none" value={era} onChange={(e) => setEra(e.target.value)} aria-label={t("Epoche", "Era")}>
            <option value="">{t("Alle Epochen", "All eras")}</option>
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => (
              <button key={tag} className={cn("chip", tags.includes(tag) && "chip-active")} onClick={() => setTags((ts) => (ts.includes(tag) ? ts.filter((x) => x !== tag) : [...ts, tag]))}>
                {tr(tag)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-muted">
            {t("Sortiert nach", "Sorted by")}
            <select className="border-b border-line-2 pb-1 text-ink focus:border-ink focus:outline-none" value={sort} onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key);
                setDesc(!ASCENDING.includes(key));
              }} aria-label={t("Sortierung", "Sort order")}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="p-1 text-ink" onClick={() => setDesc((d) => !d)} aria-label={desc ? t("Aufsteigend sortieren", "Sort ascending") : t("Absteigend sortieren", "Sort descending")}>
              {desc ? <ArrowDown className="size-4" strokeWidth={1.5} /> : <ArrowUp className="size-4" strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>{t("Keine Varianten für diese Filter.", "No variants match these filters.")}</Empty>
      ) : view === "grid" ? (
        <div className="space-y-14">
          {sections.map((s, i) => (
            <section key={s.key} aria-label={s.title}>
              {categoryHead(s, i) && <CategoryHeading category={s.category} first={i === 0} />}
              <SectionHeading section={s} />
              <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {s.items.map((v) => (
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
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base table-hover">
            <thead>
              <tr>
                <th />
                <SortTh label={t("Fahrzeug", "Car")} k="name" sort={sort} desc={desc} onSort={headerSort} />
                <SortTh label={t("Bauzeit", "Built")} k="year" sort={sort} desc={desc} onSort={headerSort} />
                <th className="text-right">{t("Stückzahl", "Units")}</th>
                <SortTh label={t("Marktwert", "Market value")} k="value" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label="12M" k="change12m" sort={sort} desc={desc} onSort={headerSort} right />
                <SortTh label={t("CAGR 5J", "CAGR 5Y")} k="cagr5" sort={sort} desc={desc} onSort={headerSort} right />
                <th>{t("Einschätzung", "Assessment")}</th>
                <th>{t("Vergl.", "Comp.")}</th>
              </tr>
            </thead>
            <tbody>
              {sections.flatMap((s, i) => [
                ...(categoryHead(s, i)
                  ? [
                      <tr key={`c-${s.category}`} className="pointer-events-none">
                        <td colSpan={9} className={cn("pb-1 text-[11.5px] tracking-[0.1em] text-muted uppercase", i > 0 ? "pt-12" : "pt-4")}>
                          {MODEL_CATEGORIES.find((c) => c.id === s.category)!.label}
                        </td>
                      </tr>,
                    ]
                  : []),
                <tr key={`h-${s.key}`} className="pointer-events-none">
                  <td colSpan={9} className="pt-6 pb-2 font-serif text-[17px] font-bold text-ink">
                    {s.title} {s.sub && <span className="ml-2 font-sans text-[13px] text-muted">{s.sub}</span>}
                  </td>
                </tr>,
                ...s.items.map((v) => {
                const m = getMetrics(v.id);
                return (
                  <tr key={v.id} onClick={() => navigate(`/markt/${v.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleWatch(v.id)} aria-label="Watchlist" className={watchlist.includes(v.id) ? "text-gold" : "text-faint hover:text-ink"}>
                        <Star className={cn("size-3.5", watchlist.includes(v.id) && "fill-current")} />
                      </button>
                    </td>
                    <td className="font-serif font-bold">{variantTitle(v)}</td>
                    <td className="text-muted">{yearsLabel(v.years)}</td>
                    <td className="text-right tabular-nums text-muted">{num(v.production)}</td>
                    <td className="text-right">
                      {v.measured ? <Money value={m.value} /> : <span className="text-[13px] text-faint" title={t("Zu wenige Belege für einen Marktwert", "Too few records for a market value")}>{t("keine Daten", "no data")}</span>}
                    </td>
                    <td className="text-right">{v.measured ? <Delta value={m.change12m} /> : <span className="text-faint">–</span>}</td>
                    <td className="text-right tabular-nums">{v.measured ? pct(m.cagr5) : <span className="text-faint">–</span>}</td>
                    <td>{v.measured ? <RecPill code={m.recommendation.code} label={m.recommendation.label} /> : null}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="accent-[var(--color-gold)]" checked={compare.includes(v.id)} onChange={() => toggleCompare(v.id)} aria-label={t("Vergleichen", "Compare")} />
                    </td>
                  </tr>
                );
              }),
              ])}
            </tbody>
          </table>
        </div>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5">
          <div className="animate-fade-in flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-[3px] border border-line bg-panel px-5 py-3 shadow-[0_20px_50px_-20px_rgba(58,42,29,0.4)]">
            <GitCompare className="size-4 text-muted" strokeWidth={1.5} />
            <span className="text-[14px] text-muted">
              {t("Vergleich", "Comparison")} ({compare.length}/{MAX_COMPARE})
            </span>
            {compare.map((id, i) => (
              <span key={id} className="chip text-ink">
                <span className="size-2 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
                {variantShortTitle(variantById.get(id)!)}
                <button onClick={() => toggleCompare(id)} aria-label={t("Entfernen", "Remove")}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <div className="ml-auto flex gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setCompare([])}>
                {t("Leeren", "Clear")}
              </button>
              <button className="btn btn-gold" disabled={compare.length < 2} onClick={() => setCompareOpen(true)}>
                {t("Vergleichen", "Compare")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} title={t("Variantenvergleich", "Variant comparison")} wide>
        <CompareView ids={compare} />
      </Modal>
    </div>
  );
}

function CategoryHeading({ category, first }: { category: ModelCategory; first: boolean }) {
  const label = MODEL_CATEGORIES.find((c) => c.id === category)!.label;
  return (
    <div className={cn("mb-8", !first && "pt-10")}>
      <h2 className="font-display text-[34px] leading-tight sm:text-[40px]">{label}</h2>
      <p className="mt-1 text-[14px] text-muted">{CATEGORY_INTRO[category]}</p>
    </div>
  );
}

function SectionHeading({ section }: { section: Section }) {
  return (
    <div className="mb-5 flex items-baseline gap-3 border-b border-line pb-2">
      <h3 className="font-serif text-[24px] leading-tight font-bold text-ink">{section.title}</h3>
      {section.sub && <span className="text-[13px] text-muted">{section.sub}</span>}
      <span className="ml-auto text-[13px] text-muted">
        {section.items.length} {section.items.length === 1 ? t("Variante", "variant") : t("Varianten", "variants")}
      </span>
    </div>
  );
}

function RecPill({ code, label }: { code: "BUY" | "HOLD" | "WATCH"; label: string }) {
  return <Pill tone={code === "BUY" ? "up" : code === "HOLD" ? "gold" : "neutral"}>{tr(label)}</Pill>;
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
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group cursor-pointer"
    >
      <div className="relative overflow-hidden">
        <CarImage variant={v} scene="studio" className="block aspect-video w-full" label={variantTitle(v)} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWatch();
          }}
          className={cn(
            "absolute top-3 right-3 rounded-full bg-bg/85 p-2 transition-opacity focus-visible:opacity-100",
            watched ? "text-ink opacity-100" : "text-ink opacity-0 group-hover:opacity-100",
          )}
          aria-label={watched ? t("Nicht mehr beobachten", "Stop watching") : t("Beobachten", "Watch")}
          aria-pressed={watched}
        >
          <Star className={cn("size-4", watched && "fill-current")} strokeWidth={1.5} />
        </button>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-serif text-[16.5px] font-bold group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{variantTitle(v, { brand: false })}</span>
        {v.measured ? <Money value={m.value} compact className="shrink-0 text-[16px]" /> : <span className="shrink-0 text-[13px] text-faint">{t("keine Daten", "no data")}</span>}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-muted">
        <span>
          {yearsLabel(v.years)}, {v.hp} PS
        </span>
        {v.measured && <Delta value={m.change12m} arrow={false} />}
      </div>
      <button
        className={cn("mt-2 text-[13px] transition-colors", compared ? "text-ink underline underline-offset-4" : "text-faint hover:text-ink")}
        onClick={(e) => {
          e.stopPropagation();
          onCompare();
        }}
        aria-pressed={compared}
      >
        {compared ? t("Im Vergleich", "In comparison") : t("Vergleichen", "Compare")}
      </button>
    </div>
  );
}

function CompareView({ ids }: { ids: string[] }) {
  const from = AS_OF - 260 * WEEK;
  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    ids.forEach((id) => {
      if (!variantById.get(id)?.measured) return;
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
    { label: t("Marktwert", "Market value"), get: (v) => (v.measured ? eur(getMetrics(v.id).value) : t("keine Daten", "no data")) },
    { label: "12M", get: (v) => (v.measured ? <Delta value={getMetrics(v.id).change12m} /> : "–") },
    { label: t("CAGR 5J", "CAGR 5Y"), get: (v) => (v.measured ? pct(getMetrics(v.id).cagr5) : "–") },
    { label: t("Volatilität 1J", "Volatility 1Y"), get: (v) => (v.measured ? pct(getMetrics(v.id).vol1y, { signed: false }) : "–") },
    { label: t("Max. Drawdown 5J", "Max. drawdown 5Y"), get: (v) => (v.measured ? <span className="text-down">{pct(getMetrics(v.id).maxDD5)}</span> : "–") },
    { label: t("Stückzahl", "Units"), get: (v) => num(v.production) },
    { label: t("Leistung", "Power"), get: (v) => `${v.hp} PS` },
    { label: t("Neupreis", "List price"), get: (v) => `${eur(v.newPrice)} (${v.newPriceYear})` },
    { label: t("Einschätzung", "Assessment"), get: (v) => <RecPill code={getMetrics(v.id).recommendation.code} label={getMetrics(v.id).recommendation.label} /> },
  ];
  const vs = ids.map((id) => variantById.get(id)!);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs text-muted">{t("Wertentwicklung 5 Jahre (indexiert, Start = 100)", "Value over 5 years (indexed, start = 100)")}</div>
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
