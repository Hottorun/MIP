import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { variantShortTitle, variantTitle } from "../../data/db";
import type { Body, Variant } from "../../data/types";
import { getSales } from "../../data/generate";
import { getMetrics } from "../../data/market";
import { outliersOf } from "../../data/real/model";
import { date, km, safeUrl } from "../../lib/format";
import { unsoldPrice } from "../../lib/unsold";
import { BAT, mixHouses } from "../../lib/houseMix";
import { Section, Money } from "../ui";
import { LotThumb } from "../LotPhotos";
import { isHousePage } from "../../lib/lotPages";
import { t } from "../../i18n";
import { tr } from "../../i18n/terms";

/** Lot number of an auction result imported from an auction list ("UCP-<sale>-<lot>"). */
const lotOf = (id: string) => /^UCP-\d+-(.+)$/.exec(id)?.[1] ?? null;

/** Where a result link leads: the lot page at the auction house, the sale's results page, or the result list it was taken from. */
const HOUSE_RESULTS = ["cars.bonhams.com/auctions/results/", "goodingco.com/results", "artcurial.com/en/results-auctions-sales", "kenoauctions.com/"];
const isHouseResults = (url: string) => HOUSE_RESULTS.some((h) => url.endsWith(h));
const isHouseSearch = (url: string) => url.includes("rmsothebys.com/search/") || url.includes("broadarrowauctions.com/vehicles/results");
function linkNote(url: string) {
  if (isHouseSearch(url)) return t("Link zur Suche beim Auktionshaus", "link to the search at the auction house");
  if (isHouseResults(url)) return t("Link zu den Auktionsergebnissen des Hauses", "link to the house's auction results");
  if (isHousePage(url)) return t("kein Link zum Los, nur zur Seite des Auktionshauses", "no link to the lot, only to the auction house's site");
  if (/rmsothebys\.com\/auctions\/[^/]+\/lots\/$/.test(url)) return t("Link zur Ergebnisliste der Auktion", "link to the sale's results");
  if (url.includes("ultimatecarpage.com")) return t("Link zur Ergebnisliste bei ultimatecarpage.com", "link to the result list at ultimatecarpage.com");
  return null;
}
/** Search pages at auction houses whose results we may not import; links only, so these sales are not in the market value. */
function houseSearchLinks(v: Variant) {
  const q = variantTitle(v).replace(/\s*\([^)]*\)/g, "").trim();
  const e = encodeURIComponent(q);
  return [
    { house: "RM Sotheby's", url: `https://rmsothebys.com/search/?SearchTerm=${e}#?SortBy=Availability&SearchTerm=${e}&page=1&pageSize=40` },
    { house: "Broad Arrow", url: `https://www.broadarrowauctions.com/vehicles/results?ftx=${e}` },
  ];
}

function linkTitle(url: string) {
  if (isHouseSearch(url)) return t("Dieses Fahrzeug in der Suche des Auktionshauses öffnen", "Open this car in the auction house's search");
  if (isHouseResults(url)) return t("Vergangene Auktionen beim Auktionshaus öffnen", "Open past auctions at the auction house");
  if (isHousePage(url)) return t("Seite des Auktionshauses öffnen", "Open the auction house's site");
  if (/rmsothebys\.com\/auctions\/[^/]+\/lots\/$/.test(url)) return t("Ergebnisse der Auktion bei RM Sotheby's öffnen", "Open the sale's results at RM Sotheby's");
  if (url.includes("ultimatecarpage.com")) return t("Ergebnisliste bei ultimatecarpage.com öffnen", "Open the result list at ultimatecarpage.com");
  return t("Los beim Auktionshaus öffnen", "Open the lot at the auction house");
}

export function RecentSales({ variant, body = null }: { variant: Variant; body?: Body | null }) {
  const [expanded, setExpanded] = useState(false);
  // sales left out of the market value for an extreme price gap (outliers of the model) are not listed either
  const outliers = outliersOf(variant.id);
  const sales = getSales(variant.id).filter((s) => (!body || s.body === body) && !outliers.has(s.id));
  const shown = mixHouses(sales, expanded ? 15 : 6);
  const batHidden = sales.slice(0, shown.length).filter((s) => s.house === BAT).length > shown.filter((s) => s.house === BAT).length;

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
        <p className="py-8 font-display text-muted italic">{t("Für diese Variante sind noch keine Verkäufe erfasst.", "No sales recorded for this variant yet.")}</p>
      ) : (
        <ul>
          {shown.map((s) => (
            <li key={s.id + s.date} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b border-line py-4">
              <div className="flex min-w-0 items-center gap-4">
              <LotThumb url={s.url} house={s.house} image={s.image} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 font-display text-[16px]">
                  {s.url ? (
                    <a href={safeUrl(s.url)} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 truncate hover:text-gold" title={linkTitle(s.url)}>
                      {s.house}
                      <ArrowUpRight className="size-3.5 shrink-0 self-center text-faint" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span className="truncate">{s.house}</span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] text-muted">
                  {date(s.date)}, {tr(s.source)}
                  {!body && Object.keys(variant.body).length > 1 ? `, ${tr(s.body)}` : ""}
                  {lotOf(s.id) ? `, ${t("Los", "Lot")} ${lotOf(s.id)}` : ""}
                  {s.mileage ? `, ${km(s.mileage)}` : ""}
                  {s.url && linkNote(s.url) ? <span className="text-faint"> · {linkNote(s.url)}</span> : null}
                </div>
              </div>
              </div>
              <div className="text-right text-[18px]">{s.price ? (
                  <Money value={s.price} sale={s} />
                ) : (
                  <>
                    <span className="text-[14px] text-faint italic">{t("nicht verkauft", "not sold")}</span>
                    {unsoldPrice(s) && <span className="block text-[12px] text-faint">{unsoldPrice(s)}</span>}
                  </>
                )}</div>
            </li>
          ))}
        </ul>
      )}
      {sales.length > 6 && (
        <button className="mt-4 text-[14px] text-muted hover:text-ink" onClick={() => setExpanded((e) => !e)}>
          {expanded ? t("Weniger anzeigen", "Show less") : t(`${Math.min(15, sales.length) - 6} weitere anzeigen`, `Show ${Math.min(15, sales.length) - 6} more`)}
        </button>
      )}
      {batHidden && (
        <p className="mt-3 text-[13px] text-faint">
          {t(
            "Bring a Trailer höchstens jedes dritte Ergebnis, damit auch andere Auktionshäuser sichtbar sind. Alle Verkäufe unter „Alle Ergebnisse“.",
            "Bring a Trailer on at most every third place, so other auction houses show too. All sales under “All results”.",
          )}
        </p>
      )}
      <div className="mt-6 text-[13px] text-muted">
        {t("Weitere Ergebnisse direkt beim Auktionshaus", "More results directly at the auction house")}:{" "}
        {houseSearchLinks(variant).map((l, i) => (
          <span key={l.house}>
            {i > 0 && " · "}
            <a href={safeUrl(l.url)} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-0.5 text-ink hover:text-gold">
              {l.house}
              <ArrowUpRight className="size-3 shrink-0 self-center text-faint" strokeWidth={1.5} />
            </a>
          </span>
        ))}
        <div className="mt-0.5 text-faint">{t("Nicht im Marktwert enthalten.", "Not included in the market value.")}</div>
      </div>
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
      {variant.measured ? (
        <>
          <p className="font-display text-[26px] leading-snug">{VERDICT_COPY[m.recommendation.code]}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{buyingPath}</p>
        </>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted">
          {t("Ohne belastbare Datenbasis geben wir keine Kaufempfehlung.", "Without a solid data basis we give no buying recommendation.")}
        </p>
      )}
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
