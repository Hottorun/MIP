import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { variantShortTitle } from "../../data/db";
import type { Variant } from "../../data/types";
import { getSales } from "../../data/generate";
import { getMetrics } from "../../data/market";
import { date, eur, km } from "../../lib/format";
import { Section } from "../ui";

export function RecentSales({ variant }: { variant: Variant }) {
  const [expanded, setExpanded] = useState(false);
  const sales = getSales(variant.id);
  const shown = sales.slice(0, expanded ? 15 : 6);

  return (
    <Section
      title="Jüngste Verkäufe"
      actions={
        <Link to={`/auktionen?q=${encodeURIComponent(variantShortTitle(variant))}`} className="link text-[14px]">
          Alle Ergebnisse
        </Link>
      }
    >
      {shown.length === 0 ? (
        <p className="py-8 font-serif text-muted italic">Für diese Variante sind noch keine Verkäufe erfasst.</p>
      ) : (
        <ul>
          {shown.map((s) => (
            <li key={s.id + s.date} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line py-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 font-serif text-[16px]">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 truncate hover:text-gold" title="Quelle öffnen">
                      {s.house}
                      <ArrowUpRight className="size-3.5 shrink-0 self-center text-faint" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="truncate">{s.house}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] text-muted">
                  {date(s.date)}, {s.source}
                  {s.mileage ? `, ${km(s.mileage)}` : ""}
                </div>
              </div>
              <div className="text-right font-serif text-[18px] tabular-nums">{s.price ? eur(s.price) : <span className="text-[14px] text-faint italic">nicht verkauft</span>}</div>
            </li>
          ))}
        </ul>
      )}
      {sales.length > 6 && (
        <button className="mt-4 text-[14px] text-muted hover:text-ink" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Weniger anzeigen" : `${Math.min(15, sales.length) - 6} weitere anzeigen`}
        </button>
      )}
    </Section>
  );
}

const VERDICT_COPY = {
  BUY: "Ein guter Zeitpunkt zum Kauf.",
  HOLD: "Halten. Zukauf nur unter Marktwert.",
  WATCH: "Beobachten und auf einen klareren Trend warten.",
};

export function Assessment({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const buyingPath =
    m.premiumVsEstimate > 0.04
      ? "Auktionen schließen derzeit deutlich über der Schätzung. Bei spezialisierten Händlern mit dokumentierter Historie ist das Fahrzeug oft günstiger."
      : "Am besten über spezialisierte Händler mit dokumentierter Historie und Zustandsprüfung. Auktionen nur bei sehr guter Dokumentation.";
  return (
    <Section title="Einschätzung">
      <p className="font-display text-[26px] leading-snug">{VERDICT_COPY[m.recommendation.code]}</p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{buyingPath}</p>
      {variant.weaknesses.length > 0 && (
        <div className="mt-8">
          <h3 className="text-[17px]">Worauf beim Kauf zu achten ist</h3>
          <ul className="mt-3 border-t border-line">
            {variant.weaknesses.map((w) => (
              <li key={w} className="border-b border-line py-3 text-[15px] leading-relaxed">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
