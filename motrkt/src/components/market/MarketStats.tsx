import { useMemo } from "react";
import type { Body, Variant } from "../../data/types";
import { AS_OF } from "../../data/generate";
import { realSalesFor } from "../../data/real/sales";
import { asksFor } from "../../data/real/asks";
import { cn, flag, km, num, pct } from "../../lib/format";
import { Section } from "../ui";
import { locale, t } from "../../i18n";
import { tr } from "../../i18n/terms";

/**
 * "The market in numbers": a few plain figures from the recorded auction results and European listings —
 * typical mileage, how often cars find a buyer at auction, how much is traded, where, and in which body style.
 * Everything is counted from real records; a figure with too few records is left out rather than estimated.
 */

const YEAR = 365.25 * 86_400_000;
const NA = new Set(["US", "CA", "MX"]);
const KM_BUCKETS = [
  { to: 25_000, de: "bis 25.000", en: "up to 25,000" },
  { to: 50_000, de: "25–50.000", en: "25–50,000" },
  { to: 100_000, de: "50–100.000", en: "50–100,000" },
  { to: 150_000, de: "100–150.000", en: "100–150,000" },
  { to: Infinity, de: "über 150.000", en: "over 150,000" },
];
// Earthy chart colours of the app (insights/palette.ts), lightest last.
const C_NA = "#1f1d1a";
const C_EU = "#8f6d33";
const C_ASK = "#d6c49d";
const BODY_COLORS = ["#1f1d1a", "#8f6d33", "#d6c49d", "#8b847a"];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const countryName = (iso: string) => {
  try {
    return new Intl.DisplayNames([locale()], { type: "region" }).of(iso) ?? iso;
  } catch {
    return iso;
  }
};

function useStats(variant: Variant, body: Body | null) {
  return useMemo(() => {
    const sales = realSalesFor(variant.id).filter((s) => s.source === "Auktion" && (!body || s.body === body));
    const asks = asksFor(variant.id).filter((a) => !a.excluded && (!body || a.body === body));

    // Mileage: European listings state it for (nearly) every car. Auction titles only name it when it is notable
    // (mostly low), so they are the fallback and are labelled as such.
    const askKm = asks.filter((a) => a.km && a.km < 1_000_000);
    const aucKm = sales.filter((s) => s.mileage > 0 && s.mileage < 1_000_000).map((s) => s.mileage);
    const kmFromAsks = askKm.length >= 5;
    const kms = kmFromAsks ? askKm.map((a) => a.km!) : aucKm.length >= 8 ? aucKm : [];
    const perYear = askKm
      .map((a) => {
        const age = new Date(a.date).getUTCFullYear() - a.year;
        return age >= 3 ? a.km! / age : null;
      })
      .filter((x): x is number => x != null);
    const buckets = KM_BUCKETS.map((b, i) => ({ ...b, n: kms.filter((k) => k < b.to && (i === 0 || k >= KM_BUCKETS[i - 1].to)).length }));

    // Sell-through: lots that found a buyer among all lots offered.
    const offered = sales.length;
    const sold = sales.filter((s) => s.price != null).length;
    const last12 = sales.filter((s) => s.date > AS_OF - YEAR);
    const recentAsks = asks.filter((a) => Date.parse(a.date) > AS_OF - 14 * 86_400_000);

    // Where it trades: auction venue (or currency when the venue is unknown) and the countries of European listings.
    const regionOf = (s: (typeof sales)[number]) => (s.location ? (NA.has(s.location) ? "na" : "eu") : s.currency === "USD" || s.currency === "CAD" ? "na" : s.currency ? "eu" : null);
    const where = { na: 0, eu: 0, ask: asks.length };
    for (const s of sales) {
      const r = regionOf(s);
      if (r) where[r]++;
    }
    const countries = Object.entries(asks.reduce<Record<string, number>>((m, a) => ((m[a.country] = (m[a.country] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Body styles among all records (auctions state it in the title, listings in the ad).
    const allBodies = [...realSalesFor(variant.id).filter((s) => s.source === "Auktion").map((s) => s.body as string), ...asksFor(variant.id).filter((a) => !a.excluded && a.body).map((a) => a.body!)];
    const bodies = Object.entries(allBodies.reduce<Record<string, number>>((m, b) => ((m[b] = (m[b] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

    return {
      km: kms.length ? { median: median(kms), n: kms.length, fromAsks: kmFromAsks, buckets, perYear: perYear.length >= 5 ? median(perYear) : null } : null,
      sell: offered >= 10 ? { rate: sold / offered, sold, offered } : null,
      last12: { offered: last12.length, sold: last12.filter((s) => s.price != null).length },
      onSale: recentAsks.length,
      where,
      countries,
      bodies: bodies.length >= 2 && allBodies.length >= 10 ? { rows: bodies, total: allBodies.length } : null,
      empty: !kms.length && offered === 0 && asks.length === 0,
    };
  }, [variant.id, body]);
}

export function MarketStats({ variant, body = null }: { variant: Variant; body?: Body | null }) {
  const s = useStats(variant, body);
  if (s.empty) return null;
  const whereTotal = s.where.na + s.where.eu + s.where.ask;

  const tiles = [
    s.km && {
      label: t("Kilometerstand, typisch", "Typical mileage"),
      value: km(Math.round(s.km.median / 100) * 100),
      note: s.km.fromAsks
        ? t(`Median aus ${num(s.km.n)} Angeboten in Europa`, `Median of ${num(s.km.n)} listings in Europe`)
        : t(`Median aus ${num(s.km.n)} Auktionen, die ihn nennen – meist besonders niedrige`, `Median of ${num(s.km.n)} auctions that state it – mostly low ones`),
    },
    s.sell && {
      label: t("Finden bei Auktionen einen Käufer", "Find a buyer at auction"),
      value: pct(s.sell.rate, { signed: false, digits: 0 }),
      note: t(`${num(s.sell.sold)} von ${num(s.sell.offered)} angebotenen Autos seit 2015`, `${num(s.sell.sold)} of ${num(s.sell.offered)} cars offered since 2015`),
      bar: s.sell.rate,
    },
    {
      label: t("Auktionen, letzte 12 Monate", "Auctions, last 12 months"),
      value: num(s.last12.offered),
      note: s.last12.offered
        ? t(`davon ${num(s.last12.sold)} verkauft`, `${num(s.last12.sold)} of them sold`)
        : t("in diesem Zeitraum kein Auto versteigert", "no car auctioned in this period"),
    },
    s.onSale > 0 && {
      label: t("Aktuell angeboten", "For sale now"),
      value: num(s.onSale),
      note: t("Inserate in Europa, die wir täglich verfolgen", "Listings in Europe we follow daily"),
    },
  ].filter(Boolean) as { label: string; value: string; note: string; bar?: number }[];

  return (
    <Section title={t("Der Markt in Zahlen", "The market in numbers")} sub={body ? t(`Nur ${tr(body)}`, `${tr(body)} only`) : undefined}>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-8 lg:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="min-w-0">
            <dt className="text-[13px] text-muted">{x.label}</dt>
            <dd className="mt-1 font-serif text-[28px] leading-none whitespace-nowrap tabular-nums sm:text-[34px] lg:text-[40px]">{x.value}</dd>
            {x.bar != null && (
              <div className="mt-3 h-1 overflow-hidden bg-panel-3" aria-hidden="true">
                <div className="h-full bg-gold" style={{ width: `${x.bar * 100}%` }} />
              </div>
            )}
            <dd className="mt-2 text-[12.5px] leading-snug text-faint">{x.note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        {s.km && s.km.n >= 8 && (
          <Card title={t("Wie viel sie gelaufen sind", "How far they have been driven")}>
            <MileageBars buckets={s.km.buckets} median={s.km.median} />
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              {s.km.perYear
                ? t(`Im Schnitt rund ${km(Math.round(s.km.perYear / 100) * 100)} pro Jahr gefahren.`, `Driven around ${km(Math.round(s.km.perYear / 100) * 100)} a year on average.`)
                : null}{" "}
              {t("Zahlen über den Balken: Anzahl Autos, Angaben in km.", "Figures above the bars: number of cars; bands in km.")}
            </p>
          </Card>
        )}

        {whereTotal >= 5 && (
          <Card title={t("Wo der Markt ist", "Where the market is")}>
            <Stacked
              parts={[
                { key: "na", label: t("Auktionen Nordamerika", "Auctions North America"), n: s.where.na, color: C_NA },
                { key: "eu", label: t("Auktionen Europa", "Auctions Europe"), n: s.where.eu, color: C_EU },
                { key: "ask", label: t("Angebote Europa", "Listings Europe"), n: s.where.ask, color: C_ASK },
              ]}
            />
            {s.countries.length > 0 && (
              <ul className="mt-5 space-y-1.5 text-[13.5px]">
                {s.countries.map(([iso, n]) => (
                  <li key={iso} className="flex items-center gap-2.5">
                    <span className="w-5 text-center" aria-hidden="true">
                      {flag(iso)}
                    </span>
                    <span className="flex-1 text-muted">{countryName(iso)}</span>
                    <span className="tabular-nums text-faint">
                      {t(`${num(n)} ${n === 1 ? "Angebot" : "Angebote"}`, `${num(n)} ${n === 1 ? "listing" : "listings"}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              {t(`Aus ${num(whereTotal)} Auktionen und Angeboten.`, `From ${num(whereTotal)} auctions and listings.`)}
              {s.countries.length > 0 && t(" Länder: wo die Autos in Europa inseriert sind.", " Countries: where the cars are listed in Europe.")}
            </p>
          </Card>
        )}

        {s.bodies && (
          <Card title={t("Karosserien im Handel", "Body styles on the market")}>
            <ShareRows rows={s.bodies.rows.map(([b, n], i) => ({ label: tr(b), n, color: BODY_COLORS[i % BODY_COLORS.length] }))} total={s.bodies.total} />
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              {t(`Anteil an ${num(s.bodies.total)} Auktionen und Angeboten.`, `Share of ${num(s.bodies.total)} auctions and listings.`)}
            </p>
          </Card>
        )}
      </div>
    </Section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-line pt-5">
      <h3 className="mb-5 font-serif text-[20px] leading-tight">{title}</h3>
      {children}
    </div>
  );
}

/** Column chart of the mileage bands; the band holding the median is drawn in full colour. */
function MileageBars({ buckets, median: med }: { buckets: { to: number; de: string; en: string; n: number }[]; median: number }) {
  const max = Math.max(...buckets.map((b) => b.n), 1);
  const at = buckets.findIndex((b) => med < b.to);
  return (
    <div>
      <div className="flex h-32 items-end gap-2" role="img" aria-label={buckets.map((b) => `${t(b.de, b.en)} km: ${b.n}`).join(", ")}>
        {buckets.map((b, i) => (
          <div key={b.to} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[12px] tabular-nums text-faint">{b.n || ""}</span>
            <div
              className={cn("w-full rounded-t-[3px] transition-[height]", i === at ? "bg-gold" : "bg-gold/30")}
              style={{ height: `${Math.max((b.n / max) * 100, b.n ? 4 : 1)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2">
        {buckets.map((b) => (
          <span key={b.to} className="flex-1 text-center text-[11px] leading-tight text-faint">
            {t(b.de, b.en)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One horizontal bar split into parts, with a legend underneath. */
function Stacked({ parts }: { parts: { key: string; label: string; n: number; color: string }[] }) {
  const shown = parts.filter((p) => p.n > 0);
  const total = shown.reduce((s, p) => s + p.n, 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden" aria-hidden="true">
        {shown.map((p) => (
          <div key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-[13.5px]">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="flex-1 text-muted">{p.label}</span>
            <span className="font-medium tabular-nums">{pct(p.n / total, { signed: false, digits: 0 })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Label, share and a thin bar per row. */
function ShareRows({ rows, total }: { rows: { label: string; n: number; color: string }[]; total: number }) {
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="text-muted">{r.label}</span>
            <span className="font-medium tabular-nums">{pct(r.n / total, { signed: false, digits: 0 })}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden bg-panel-3">
            <div className="h-full" style={{ width: `${(r.n / total) * 100}%`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
