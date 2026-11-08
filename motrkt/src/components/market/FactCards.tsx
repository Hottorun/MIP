import { generationById, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { inflationFactor } from "../../data/market";
import { eur, hostOf, num, pct } from "../../lib/format";
import { Section } from "../ui";

export function Details({ variant }: { variant: Variant }) {
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
        {options.length > 0 && (
          <div>
            <h3 className="text-[17px]">Gesuchte Optionen</h3>
            <p className="mt-1 text-[13.5px] text-muted">Geschätzter Einfluss auf den Marktwert</p>
            <ul className="mt-4 border-t border-line text-[14.5px]">
              {options.map((o) => (
                <li key={o.name} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                  <span>{o.name}</span>
                  <span className={o.impact >= 0 ? "text-up" : "text-down"}>{pct(o.impact, { digits: 0 })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
