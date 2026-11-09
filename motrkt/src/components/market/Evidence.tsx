import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Variant } from "../../data/types";
import { marketBasis, MODEL_OFFSET_PAIRS, type Channel } from "../../data/real/model";
import { asksFor } from "../../data/real/asks";
import { date, km, num, pct } from "../../lib/format";
import { Money, Section } from "../ui";
import { isEn, t } from "../../i18n";

const region = (iso: string) => {
  try {
    return new Intl.DisplayNames([isEn() ? "en" : "de"], { type: "region" }).of(iso) ?? iso;
  } catch {
    return iso;
  }
};

const CHANNEL_LABEL: Record<Channel, () => string> = {
  EU_AUC: () => t("Auktionsergebnisse in Europa", "Auction results in Europe"),
  EU_ASK: () => t("Angebotspreise in Europa", "Asking prices in Europe"),
  US_AUC: () => t("Auktionsergebnisse in den USA", "Auction results in the USA"),
};

/**
 * Where the market value comes from: records per kind of evidence, their level today, their weight, and the
 * individual listings with links. Auction results are listed under "Recent sales".
 */
export function Evidence({ variant }: { variant: Variant }) {
  const b = marketBasis(variant.id);
  const asks = asksFor(variant.id);
  const [all, setAll] = useState(false);
  if (!b) return null;
  const channels = (["EU_AUC", "EU_ASK", "US_AUC"] as Channel[]).filter((c) => b.channels[c] > 0);
  const off = b.offsets;
  const shown = all ? asks : asks.slice(0, 8);
  const pairs = MODEL_OFFSET_PAIRS[b.family]?.pairs ?? {};
  const nVariants = (k: string) => pairs[k]?.[1];

  return (
    <Section title={t("Belege für den Marktwert", "Evidence for the market value")}>
      <div id="belege" className="scroll-mt-32" />
      <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
        {t(
          "Der Marktwert gibt an, was ein Fahrzeug dieser Variante heute in Deutschland und Europa tatsächlich kostet: gemessen an Auktionsergebnissen in Europa. Angebotspreise und US-Ergebnisse fließen nur bereinigt ein. Um wie viel sie im Mittel abweichen, messen wir an allen Varianten, für die es beides gibt.",
          "The market value is what a car of this variant actually costs in Germany and Europe today, measured on European auction results. Asking prices and US results enter only after adjustment; by how much they differ on average is measured across all variants that have both.",
        )}
      </p>

      {variant.measured && channels.length > 0 && (
        <div className="mt-6 border-t border-line text-[14.5px]">
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem] gap-x-4 border-b border-line py-2.5 text-[13px] text-muted sm:grid">
            <span>{t("Quelle", "Source")}</span>
            <span className="text-right">{t("Belege", "Records")}</span>
            <span className="text-right">{t("Niveau heute", "Level today")}</span>
            <span className="text-right">{t("Anteil am Wert", "Share of value")}</span>
          </div>
          {channels.map((c) => (
            <div key={c} className="grid grid-cols-3 gap-x-4 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem] sm:items-baseline">
              <div className="col-span-3 mb-2 sm:col-span-1 sm:mb-0">
                {CHANNEL_LABEL[c]()}
                {c !== "EU_AUC" && (
                  <span className="block text-[12.5px] text-faint">
                  {(() => {
                    const d = off[c] ?? 0;
                    const gap = pct(Math.abs(Math.exp(d) - 1), { digits: 0, signed: false });
                    const above = d >= 0;
                    const n = nVariants(`${c}-EU_AUC`);
                    return c === "EU_ASK"
                      ? t(
                          `liegen im Mittel ${gap} ${above ? "über" : "unter"} Auktionsergebnissen in Europa${n ? ` (gemessen an ${n} Varianten)` : ""}; herausgerechnet`,
                          `are on average ${gap} ${above ? "above" : "below"} European auction results${n ? ` (measured on ${n} variants)` : ""}; taken out`,
                        )
                      : t(
                          `liegen im Mittel ${gap} ${above ? "über" : "unter"} Auktionsergebnissen in Europa${n ? ` (gemessen an ${n} Varianten)` : ""}; herausgerechnet, Gewicht begrenzt`,
                          `are on average ${gap} ${above ? "above" : "below"} European auction results${n ? ` (measured on ${n} variants)` : ""}; taken out, weight capped`,
                        );
                  })()}
                  </span>
                )}
              </div>
              <div className="tabular-nums sm:text-right">
                <span className="block text-[12px] text-faint sm:hidden">{t("Belege", "Records")}</span>
                {num(b.channels[c])}
              </div>
              <div className="sm:text-right">
                <span className="block text-[12px] text-faint sm:hidden">{t("Niveau heute", "Level today")}</span>
                <Money value={b.level[c] ? Math.round(b.level[c]! / 1000) * 1000 : null} />
              </div>
              <div className="tabular-nums sm:text-right">
                <span className="block text-[12px] text-faint sm:hidden">{t("Anteil am Wert", "Share of value")}</span>
                {b.share[c] !== undefined ? pct(b.share[c]!, { digits: 0, signed: false }) : "–"}
              </div>
            </div>
          ))}
          <p className="mt-2 text-[12.5px] text-faint">
            {t(
              "Niveau heute: Median der zeitbereinigten Preise dieser Quelle, wie sie vor der Bereinigung sind. Anteil am Wert: Gewicht nach Anzahl, Streuung und gemessener Abweichung der Quelle. Auktionsergebnisse stehen einzeln unter „Jüngste Verkäufe“.",
              "Level today: median of this source's time-adjusted prices before adjustment. Share of value: weight by number of records, scatter and measured deviation of the source. Auction results are listed one by one under “Recent sales”.",
            )}
          </p>
        </div>
      )}

      <h3 className="mt-10 text-[17px]">
        {t("Angebote in Europa", "Listings in Europe")} <span className="text-muted">({num(asks.length)})</span>
      </h3>
      {asks.length === 0 ? (
        <p className="mt-3 text-[14.5px] text-muted">
          {t("Derzeit ist kein Angebot dieser Variante mit Preis erfasst.", "No priced listing of this variant is on record at the moment.")}
        </p>
      ) : (
        <ul className="mt-3 border-t border-line">
          {shown.map((a) => (
            <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line py-3.5">
              <div className="min-w-0">
                <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-baseline gap-1 font-serif text-[16px] hover:text-gold" title={t("Inserat öffnen", "Open listing")}>
                  <span className="truncate">{a.title}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 self-center text-faint" strokeWidth={1.5} />
                </a>
                <div className="mt-0.5 text-[13px] text-muted">
                  {t("Baujahr", "Built")} {a.year} · {a.source}, {t("gesehen", "seen")} {date(Date.parse(a.date))} · {region(a.country)} · {a.seller === "Händler" ? t("Händler", "Dealer") : t("Privat", "Private")}
                  {a.km ? ` · ${km(a.km)}` : ""}
                </div>
              </div>
              <div className="text-right text-[17px]">
                <Money value={a.eur} />
                {a.cur !== "EUR" && <span className="block text-[12px] text-faint">{`${num(a.price)} ${a.cur}`}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {asks.length > 8 && (
        <button className="mt-4 text-[14px] text-muted hover:text-ink" onClick={() => setAll((x) => !x)}>
          {all ? t("Weniger anzeigen", "Show less") : t(`Alle ${asks.length} anzeigen`, `Show all ${asks.length}`)}
        </button>
      )}
      <p className="mt-6 max-w-3xl text-[12.5px] leading-relaxed text-faint">
        {t(
          "Angebote: Classic Trader, automatisch erfasst. mobile.de, Elferspot, AutoScout24 und Kleinanzeigen sperren automatische Abrufe; Inserate von dort lassen sich von Hand erfassen und fließen dann genauso ein. Auktionsergebnisse: RM Sotheby's, Bonhams, Broad Arrow, Artcurial, Gooding & Company und Bring a Trailer. Umrechnung zum EZB-Kurs des jeweiligen Tages.",
          "Listings: Classic Trader, collected automatically. mobile.de, Elferspot, AutoScout24 and Kleinanzeigen block automated access; listings from there can be recorded by hand and then count the same way. Auction results: RM Sotheby's, Bonhams, Broad Arrow, Artcurial, Gooding & Company and Bring a Trailer. Converted at the ECB rate of the day.",
        )}
      </p>
    </Section>
  );
}
