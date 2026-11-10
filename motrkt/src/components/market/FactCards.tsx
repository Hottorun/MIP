import { Check } from "lucide-react";
import { generationById, genName, optionFactor, productionLabel, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics, inflationFactor } from "../../data/market";
import { cn, eur, hostOf, num, pct } from "../../lib/format";
import { Section, Money } from "../ui";
import { t } from "../../i18n";
import { tr } from "../../i18n/terms";

export function Details({ variant, picked, onPick }: { variant: Variant; picked: string[]; onPick: (names: string[]) => void }) {
  const gen = generationById.get(variant.generationId)!;
  const year = variant.newPriceYear;
  const specs: [string, string][] = [
    [t("Bauzeit", "Built"), yearsLabel(variant.years)],
    ["Generation", `${genName(gen)}, ${yearsLabel(gen.years)}`],
    [t("Motor", "Engine"), `${num(variant.liters, 1)} l, ${variant.hp} PS`],
    [t("Antrieb", "Drive"), tr(variant.drive)],
    [t("Getriebe", "Gearbox"), tr(variant.transmission)],
    [t("Karosserie", "Body"), Object.keys(variant.body).map((b) => tr(b)).join(", ")],
    [t("Produktion", "Production"), productionLabel(variant)],
    [
      t("Neupreis", "List price"),
      t(
        `${eur(variant.newPrice)} (${year}), heute rund ${eur(Math.round((variant.newPrice * inflationFactor(year)) / 1000) * 1000)}`,
        `${eur(variant.newPrice)} (${year}), about ${eur(Math.round((variant.newPrice * inflationFactor(year)) / 1000) * 1000)} in today's money`,
      ),
    ],
  ];
  const options = variant.options.filter((o) => !o.standard);

  return (
    <Section title={t("Daten und Ausstattung", "Specifications and options")}>
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
              {t("Quellen", "Sources")}:{" "}
              {variant.specSources.map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" className="hover:text-ink">
                  {i > 0 && ", "}
                  {hostOf(s)}
                </a>
              ))}
            </p>
          )}
        </div>
        {options.some((o) => o.measured) && variant.measured ? (
          <OptionPicker variant={variant} picked={picked} onPick={onPick} />
        ) : (
          options.length > 0 && <OptionList variant={variant} />
        )}
      </div>
    </Section>
  );
}

/** Value-relevant options as checkboxes; the estimate below (and in the summary at the top) follows the selection. */
function OptionPicker({ variant, picked, onPick }: { variant: Variant; picked: string[]; onPick: (names: string[]) => void }) {
  const options = variant.options.filter((o) => !o.standard && o.measured);
  const unmeasured = variant.options.filter((o) => !o.standard && !o.measured);
  const base = getMetrics(variant.id).value;
  const factor = optionFactor(variant, picked);
  const toggle = (name: string) => {
    if (picked.includes(name)) {
      const dependants = options.filter((o) => o.requires === name).map((o) => o.name);
      onPick(picked.filter((n) => n !== name && !dependants.includes(n)));
    } else {
      const opt = options.find((o) => o.name === name);
      const req = opt?.requires;
      const rivals = opt?.group ? options.filter((o) => o.group === opt.group && o.name !== name).map((o) => o.name) : [];
      onPick([...new Set([...picked.filter((n) => !rivals.includes(n)), name, ...(req ? [req] : [])])]);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[17px]">{t("Wertrelevante Ausstattung", "Options that affect value")}</h3>
        {picked.length > 0 && (
          <button className="text-[13px] text-muted hover:text-ink" onClick={() => onPick([])}>
            {t("Auswahl zurücksetzen", "Clear selection")}
          </button>
        )}
      </div>
      <p className="mt-1 text-[13.5px] text-muted">{t("Ausstattung des Fahrzeugs wählen, der Schätzwert passt sich an.", "Pick the car's options and the estimate adjusts.")}</p>
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
                  {tr(o.name)}
                  {o.requires && <span className="block text-[12.5px] text-faint">{t("nur mit", "only with")} {tr(o.requires).replace(/ \(.+\)$/, "")}</span>}
                  {o.measured && <span className="block text-[12.5px] text-faint">{t(`gemessen an ${num(o.measured)} Verkäufen`, `measured from ${num(o.measured)} sales`)}</span>}
                </span>
                <span className={cn("tabular-nums", o.impact >= 0 ? "text-up" : "text-down")}>{pct(o.impact, { digits: 0 })}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-muted">{picked.length ? t("Schätzwert mit Auswahl", "Estimate with selection") : t("Marktwert, Median", "Market value, median")}</span>
        <span className="text-right">
          <Money value={Math.round((base * factor) / 1000) * 1000} className="text-[28px] leading-none" />
          {factor !== 1 && <span className={cn("ml-2 text-[13px]", factor > 1 ? "text-up" : "text-down")}>{pct(factor - 1)}</span>}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] text-faint">
        {t(
          "Einfluss gegenüber dem Marktwert, gemessen an den Belegen dieser Variante (Preise zeitbereinigt, mindestens 6 Belege je Ausführung). Mehrere Optionen werden multipliziert; Zustand, Historie und Laufleistung sind nicht berücksichtigt.",
          "Effect against the market value, measured from this variant's records (time-adjusted prices, at least 6 records per configuration). Several options multiply; condition, history and mileage are not taken into account.",
        )}
      </p>
      {unmeasured.length > 0 && <Unmeasured options={unmeasured} />}
    </div>
  );
}

/** Options whose effect is not measured: named, but without a number and without effect on the value. */
function OptionList({ variant }: { variant: Variant }) {
  return (
    <div>
      <h3 className="text-[17px]">{t("Wertrelevante Ausstattung", "Options that affect value")}</h3>
      <Unmeasured options={variant.options.filter((o) => !o.standard && !o.measured)} />
    </div>
  );
}

function Unmeasured({ options }: { options: Variant["options"] }) {
  return (
    <div className="mt-5">
      <p className="text-[13.5px] text-muted">
        {t(
          "Diese Ausstattung beeinflusst den Wert, ihr Einfluss lässt sich aus den vorhandenen Belegen aber nicht messen. Wir nennen deshalb keine Zahl.",
          "These options affect the value, but the available records are too few to measure by how much, so we give no figure.",
        )}
      </p>
      <ul className="mt-3 border-t border-line text-[14.5px]">
        {options.map((o) => (
          <li key={o.name} className="border-b border-line py-3">
            {tr(o.name)}
            {o.requires && <span className="block text-[12.5px] text-faint">{t("nur mit", "only with")} {tr(o.requires).replace(/ \(.+\)$/, "")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
