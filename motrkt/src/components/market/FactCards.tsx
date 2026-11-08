import { Check } from "lucide-react";
import { generationById, optionFactor, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics, inflationFactor } from "../../data/market";
import { cn, eur, hostOf, num, pct } from "../../lib/format";
import { Section } from "../ui";

export function Details({ variant, picked, onPick }: { variant: Variant; picked: string[]; onPick: (names: string[]) => void }) {
  const gen = generationById.get(variant.generationId)!;
  const year = variant.years[0];
  const specs: [string, string][] = [
    ["Bauzeit", yearsLabel(variant.years)],
    ["Generation", `${gen.name}, ${yearsLabel(gen.years)}`],
    ["Motor", `${num(variant.liters, 1)} l, ${variant.hp} PS`],
    ["Antrieb", variant.drive],
    ["Getriebe", variant.transmission],
    ["Karosserie", Object.keys(variant.body).join(", ")],
    ["Produktion", `${num(variant.production)} Stück`],
    ["Neupreis", `${eur(variant.newPrice)} (${year}), heute rund ${eur(Math.round((variant.newPrice * inflationFactor(year)) / 1000) * 1000)}`],
  ];
  const options = variant.options.filter((o) => !o.standard);

  return (
    <Section title="Daten und Ausstattung">
      <div id="ausstattung" className="scroll-mt-32" />
      <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
        <div>
          <dl className="border-t border-line text-[14.5px]">
            {specs.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-4 border-b border-line py-3">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {variant.specSources.length > 0 && (
            <p className="mt-3 text-[12.5px] text-faint">
              Quellen:{" "}
              {variant.specSources.map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" className="hover:text-ink">
                  {i > 0 && ", "}
                  {hostOf(s)}
                </a>
              ))}
            </p>
          )}
        </div>
        {options.length > 0 && <OptionPicker variant={variant} picked={picked} onPick={onPick} />}
      </div>
    </Section>
  );
}

/** Value-relevant options as checkboxes; the estimate below (and in the summary at the top) follows the selection. */
function OptionPicker({ variant, picked, onPick }: { variant: Variant; picked: string[]; onPick: (names: string[]) => void }) {
  const options = variant.options.filter((o) => !o.standard);
  const base = getMetrics(variant.id).value;
  const factor = optionFactor(variant, picked);
  const toggle = (name: string) => {
    if (picked.includes(name)) {
      const dependants = options.filter((o) => o.requires === name).map((o) => o.name);
      onPick(picked.filter((n) => n !== name && !dependants.includes(n)));
    } else {
      const req = options.find((o) => o.name === name)?.requires;
      onPick([...new Set([...picked, name, ...(req ? [req] : [])])]);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[17px]">Wertrelevante Ausstattung</h3>
        {picked.length > 0 && (
          <button className="text-[13px] text-muted hover:text-ink" onClick={() => onPick([])}>
            Auswahl zurücksetzen
          </button>
        )}
      </div>
      <p className="mt-1 text-[13.5px] text-muted">Ausstattung des Fahrzeugs wählen, der Schätzwert passt sich an.</p>
      <ul className="mt-4 border-t border-line text-[14.5px]">
        {options.map((o) => {
          const on = picked.includes(o.name);
          return (
            <li key={o.name} className="border-b border-line">
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(o.name)} />
                <span
                  aria-hidden
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold/50",
                    on ? "border-ink bg-ink text-bg" : "border-line-2",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1">
                  {o.name}
                  {o.requires && <span className="block text-[12.5px] text-faint">nur mit {o.requires.replace(/ \(.+\)$/, "")}</span>}
                </span>
                <span className={cn("tabular-nums", o.impact >= 0 ? "text-up" : "text-down")}>{pct(o.impact, { digits: 0 })}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-muted">{picked.length ? "Schätzwert mit Auswahl" : "Marktwert, Median"}</span>
        <span className="text-right">
          <span className="font-serif text-[26px] leading-none tabular-nums">{eur(Math.round((base * factor) / 1000) * 1000)}</span>
          {factor !== 1 && <span className={cn("ml-2 text-[13px]", factor > 1 ? "text-up" : "text-down")}>{pct(factor - 1)}</span>}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] text-faint">Geschätzter Einfluss gegenüber dem Median; mehrere Optionen werden miteinander multipliziert. Zustand, Historie und Laufleistung sind nicht berücksichtigt.</p>
    </div>
  );
}
