import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { variantShortTitle } from "../../data/db";
import type { Variant } from "../../data/types";
import { getSales } from "../../data/generate";
import { getMetrics } from "../../data/market";
import { date, km } from "../../lib/format";
import { Section, Money } from "../ui";
import { t } from "../../i18n";
import { tr } from "../../i18n/terms";

export function RecentSales({ variant }: { variant: Variant }) {
  const [expanded, setExpanded] = useState(false);
  const sales = getSales(variant.id);
  const shown = sales.slice(0, expanded ? 15 : 6);

  return (
    <Section
      title={t("Jüngste Verkäufe", "Recent sales")}
      actions={
        <Link to={`/auktionen?q=${encodeURIComponent(variantShortTitle(variant))}`} className="link text-[14px]">
          {t("Alle Ergebnisse", "All results")}
        </Link>
      }
    >
      {shown.length === 0 ? (
        <p className="py-8 font-serif text-muted italic">{t("Für diese Variante sind noch keine Verkäufe erfasst.", "No sales recorded for this variant yet.")}</p>
      ) : (
        <ul>
          {shown.map((s) => (
            <li key={s.id + s.date} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line py-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 font-serif text-[16px]">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 truncate hover:text-gold" title={t("Quelle öffnen", "Open source")}>
                      {s.house}
                      <ArrowUpRight className="size-3.5 shrink-0 self-center text-faint" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="truncate">{s.house}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] text-muted">
                  {date(s.date)}, {tr(s.source)}
                  {s.mileage ? `, ${km(s.mileage)}` : ""}
                </div>
              </div>
              <div className="text-right text-[18px]">{s.price ? <Money value={s.price} /> : <span className="text-[14px] text-faint italic">{t("nicht verkauft", "not sold")}</span>}</div>
            </li>
          ))}
        </ul>
      )}
      {sales.length > 6 && (
        <button className="mt-4 text-[14px] text-muted hover:text-ink" onClick={() => setExpanded((e) => !e)}>
          {expanded ? t("Weniger anzeigen", "Show less") : t(`${Math.min(15, sales.length) - 6} weitere anzeigen`, `Show ${Math.min(15, sales.length) - 6} more`)}
        </button>
      )}
    </Section>
  );
}

const VERDICT_COPY = {
  get BUY() { return t("Ein guter Zeitpunkt zum Kauf.", "A good time to buy."); },
  get HOLD() { return t("Halten. Zukauf nur unter Marktwert.", "Hold. Only add below market value."); },
  get WATCH() { return t("Beobachten und auf einen klareren Trend warten.", "Watch and wait for a clearer trend."); },
};

export function Assessment({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const buyingPath =
    m.premiumVsEstimate > 0.04
      ? t(
          "Auktionen schließen derzeit deutlich über der Schätzung. Bei spezialisierten Händlern mit dokumentierter Historie ist das Fahrzeug oft günstiger.",
          "Auctions are currently closing well above estimate. Specialist dealers with documented history often sell the car for less.",
        )
      : t(
          "Am besten über spezialisierte Händler mit dokumentierter Historie und Zustandsprüfung. Auktionen nur bei sehr guter Dokumentation.",
          "Best bought from specialist dealers with documented history and a condition check. Auctions only with very good documentation.",
        );
  return (
    <Section title={t("Einschätzung", "Assessment")}>
      <p className="font-display text-[26px] leading-snug">{VERDICT_COPY[m.recommendation.code]}</p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{buyingPath}</p>
      {variant.weaknesses.length > 0 && (
        <div className="mt-8">
          <h3 className="text-[17px]">{t("Worauf beim Kauf zu achten ist", "What to check before buying")}</h3>
          <ul className="mt-3 border-t border-line">
            {variant.weaknesses.map((w) => (
              <li key={w} className="border-b border-line py-3 text-[15px] leading-relaxed">
                {tr(w)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
