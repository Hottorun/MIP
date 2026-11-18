import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { generationById, genName, modelById, modelName, models, productionLabel, variantById, variants, variantTitle, yearsLabel } from "../data/db";
import { getMetrics } from "../data/market";
import type { Variant } from "../data/types";
import { cn, eur } from "../lib/format";
import { t } from "../i18n";
import { CarImage } from "./CarImage";

/**
 * Choosing a car (variant) for the portfolio and the report forms: one search field over all variants ("993 turbo",
 * "carrera rs", a build year), or browsing by model and generation, each row with photo, build years and today's market
 * value. Once chosen, the picker folds into a card of the car with a button to change it.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry = { v: Variant; words: string[]; joined: string };
let entries: Entry[] | null = null;
/** Search words per variant, built once: title (without the brand, which every car shares), generation, model and tags, without accents. */
function index(): Entry[] {
  entries ??= variants.map((v) => {
    const gen = generationById.get(v.generationId)!;
    const model = modelById.get(v.modelId)!;
    const words = [...new Set(norm([variantTitle(v, { brand: false }), v.name, gen.name, model.name, ...v.tags].join(" ")).split(" "))];
    return { v, words, joined: words.join("") };
  });
  return entries;
}

/**
 * Every word of the query must start a word of the car ("carr" finds Carrera, "rs" not every Porsche) or, from four
 * letters, sit anywhere in its name written together ("gt3rs"); a four-digit year matches the variants built in it.
 * Cars that carry the words exactly come first.
 */
function search(query: string): Variant[] {
  const q = norm(query).split(" ").filter(Boolean);
  if (!q.length) return [];
  const thisYear = new Date().getFullYear();
  const hits: { v: Variant; exact: number }[] = [];
  for (const { v, words, joined } of index()) {
    let exact = 0;
    const all = q.every((w) => {
      if (words.includes(w)) return ++exact;
      if (words.some((x) => x.startsWith(w)) || (w.length >= 4 && joined.includes(w))) return true;
      const y = /^(19|20)\d{2}$/.test(w) ? Number(w) : null;
      return y !== null && y >= v.years[0] && y <= (v.years[1] ?? thisYear);
    });
    if (all) hits.push({ v, exact });
  }
  return hits.sort((a, b) => b.exact - a.exact).map((h) => h.v);
}

function Value({ v, className }: { v: Variant; className?: string }) {
  return v.measured ? (
    <span className={cn("money text-ink", className)}>{eur(getMetrics(v.id).value, { compact: true })}</span>
  ) : (
    <span className={cn("text-faint", className)}>{t("kein Marktwert", "no market value")}</span>
  );
}

export function VariantPicker({
  value,
  onChange,
  error,
  autoFocus = false,
}: {
  /** The chosen variant's id, "" for none yet. */
  value: string;
  onChange: (variantId: string) => void;
  error?: string;
  /** Put the cursor into the search field when the picker starts open (dialogs). */
  autoFocus?: boolean;
}) {
  const chosen = variantById.get(value);
  const [open, setOpen] = useState(!chosen);
  const [query, setQuery] = useState("");
  // browsing starts at the chosen car's model, else at the 911, which most cars are
  const [modelId, setModelId] = useState<string>(() => chosen?.modelId ?? (models.find((m) => m.name === "911") ?? models[0]).id);
  const [genId, setGenId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  // a form reset from outside (dialog reopened, other holding edited) folds or unfolds the picker with it
  useEffect(() => {
    setOpen(!variantById.has(value));
    setQuery("");
  }, [value]);

  const model = modelById.get(modelId)!;
  const searching = query.trim() !== "";
  const results = useMemo(() => {
    if (searching) return search(query);
    const gens = genId ? [genId] : model.generationIds;
    return gens.flatMap((g) => generationById.get(g)!.variantIds.map((id) => variantById.get(id)!));
  }, [searching, query, model, genId]);
  useEffect(() => setActive(0), [query, modelId, genId]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: Variant) => {
    onChange(v.id);
    setModelId(v.modelId);
    setGenId(null);
    setQuery("");
    setOpen(false);
  };

  if (chosen && !open) {
    return (
      <div className={cn("flex items-center gap-4 rounded-[3px] border bg-panel p-2.5", error ? "border-down" : "border-line-2")}>
        <CarImage variant={chosen} className="aspect-[16/10] w-28 shrink-0 rounded-[2px] sm:w-36" label={variantTitle(chosen)} />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[18px] leading-snug">{variantTitle(chosen)}</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {yearsLabel(chosen.years)} · {productionLabel(chosen)}
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {t("Marktwert heute", "Market value today")}: <Value v={chosen} className="text-[14px]" />
          </div>
        </div>
        <button
          type="button"
          className="btn shrink-0 px-3 py-1.5 text-[13px]"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          {t("Ändern", "Change")}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-[3px] border bg-panel", error ? "border-down" : "border-line-2")}>
      <div className="relative border-b border-line">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.75} aria-hidden />
        <input
          ref={input}
          autoFocus={autoFocus}
          className="w-full bg-transparent py-2.5 pr-9 pl-9 text-[15px] text-ink placeholder:text-faint focus:outline-none"
          placeholder={t("Fahrzeug suchen, z. B. 993 Turbo, Carrera RS oder 1973", "Search a car, e.g. 993 Turbo, Carrera RS or 1973")}
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-label={t("Fahrzeug suchen", "Search a car")}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
            } else if (e.key === "Enter") {
              e.preventDefault(); // never submits the form around it
              if (results[active]) pick(results[active]);
            } else if (e.key === "Escape" && (query || chosen)) {
              e.stopPropagation(); // clears the search or folds the picker, the dialog stays open
              if (query) setQuery("");
              else setOpen(false);
            }
          }}
        />
        {(query || chosen) && (
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-[2px] p-1 text-faint hover:text-ink"
            aria-label={query ? t("Suche leeren", "Clear search") : t("Schließen", "Close")}
            onClick={() => (query ? (setQuery(""), input.current?.focus()) : setOpen(false))}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!searching && (
        <div className="space-y-2 border-b border-line px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Modell", "Model")}>
            {models.map((m) => (
              <button
                type="button"
                key={m.id}
                className={cn("chip", m.id === modelId && "chip-active")}
                aria-pressed={m.id === modelId}
                onClick={() => {
                  setModelId(m.id);
                  setGenId(null);
                }}
              >
                {modelName(m)}
              </button>
            ))}
          </div>
          {model.generationIds.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" role="group" aria-label="Generation">
              {[null, ...model.generationIds].map((g) => (
                <button
                  type="button"
                  key={g ?? "all"}
                  aria-pressed={g === genId}
                  className={cn("border-b py-0.5 transition-colors", g === genId ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
                  onClick={() => setGenId(g)}
                >
                  {g ? genName(generationById.get(g)!) : t("Alle", "All")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ul ref={list} id={listId} role="listbox" aria-label={t("Fahrzeuge", "Cars")} className="max-h-72 overflow-y-auto overscroll-contain">
        {results.length === 0 && (
          <li className="px-4 py-8 text-center font-serif text-[15px] text-muted italic">
            {t("Kein Fahrzeug gefunden. Versuchen Sie es mit Generation und Modell, z. B. „964 Turbo“.", "No car found. Try generation and model, e.g. “964 Turbo”.")}
          </li>
        )}
        {results.map((v, i) => {
          const gen = generationById.get(v.generationId)!;
          // while browsing a model with several generations, each generation starts with its name
          const heading = !searching && !genId && model.generationIds.length > 1 && results[i - 1]?.generationId !== v.generationId;
          return (
            <li key={v.id} role="presentation">
              {heading && (
                <div className="eyebrow sticky top-0 z-[1] border-b border-line bg-panel-2 px-3 py-1.5 text-muted">
                  {genName(gen)} <span className="font-normal tracking-normal normal-case">· {yearsLabel(gen.years)}</span>
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={v.id === value}
                data-i={i}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", i === active ? "bg-panel-2" : "hover:bg-panel-2")}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => pick(v)}
              >
                <CarImage variant={v} className="aspect-[16/10] w-[72px] shrink-0 rounded-[2px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[15.5px] text-ink">{variantTitle(v, { brand: false, gen: searching || !!genId || model.generationIds.length < 2 ? undefined : false })}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {yearsLabel(v.years)} · {productionLabel(v)}
                  </span>
                </span>
                <Value v={v} className="shrink-0 text-[14px]" />
                {v.id === value && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="border-t border-line px-3 py-2 text-xs text-down">{error}</p>}
    </div>
  );
}
