import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brands, variantById, variantTitle, variants } from "../data/db";
import { AS_OF, DAY, getAllSales } from "../data/generate";
import {
  changeOver,
  getMetrics,
  marketIndex,
  sliceRange,
  homeWinners,
} from "../data/market";
import type { Sale } from "../data/types";
import { mixHouses } from "../lib/houseMix";
import { cn, date, flag, num } from "../lib/format";
import { CALENDAR_AS_OF, HOUSE_CALENDARS, calendarSales } from "../data/real/auction-calendar";
import { locale } from "../i18n";
import { CarImage } from "../components/CarImage";
import { HeroSlideshow } from "../components/HeroSlideshow";
import {
  ChartTooltipBox,
  DeltaBadge,
  Section,
  Segmented,
  axisProps,
  Money,
} from "../components/ui";
import { Lock, LockedValue } from "../components/premium/Locked";
import { usePlan } from "../lib/plan";
import { yearTicks } from "../components/insights/palette";
import { t } from "../i18n";

const RANGE_OPTIONS = [
  { value: "1J" as const, get label() { return t("1 Jahr", "1 year"); } },
  { value: "5J" as const, get label() { return t("5 Jahre", "5 years"); } },
  { value: "10J" as const, get label() { return t("10 Jahre", "10 years"); } },
];

export default function Overview() {
  const [range, setRange] = useState<"1J" | "5J" | "10J">("5J");
  const index = marketIndex();
  const indexChange = changeOver(index, 52);
  const chartData = useMemo(
    () => sliceRange(index, range).map((p) => ({ t: p.t, value: p.value })),
    [index, range],
  );
  const ticks = useMemo(
    () =>
      range === "1J" || chartData.length < 2
        ? undefined
        : yearTicks(chartData[0].t, chartData[chartData.length - 1].t),
    [chartData, range],
  );

  const winners = useMemo(() => homeWinners(), []);
  const notable = useMemo(() => {
    const from = AS_OF - 30 * DAY;
    const out: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.date < from) break;
      if (s.price !== null) out.push(s);
    }
    return out.sort((a, b) => b.price! - a.price!).slice(0, 6);
  }, []);
  const upcoming = useMemo(() => {
    // today's date (UTC midnight, like the ISO dates), so sales that are over drop out even between data updates
    const now = new Date();
    const today = Math.max(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), CALENDAR_AS_OF ? Date.parse(CALENDAR_AS_OF) : AS_OF);
    return calendarSales
      .filter((c) => Date.parse(c.end ?? c.date) >= today)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }, []);
  const recent = useMemo(() => {
    const out: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.price !== null && variantById.has(s.variantId)) out.push(s);
      if (out.length >= 240) break;
    }
    return mixHouses(out, 24);
  }, []);

  return (
    <div className="space-y-24">
      <div>
        <HeroSlideshow>
          <p className="mt-5 max-w-md font-serif text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
            {t(
              `Marktwerte aus belegten Verkäufen, Auktionsergebnisse und aktuelle Angebote für ${variants.length} Varianten von ${brands.map((b) => b.name).join(" und ")}.`,
              `Market values from recorded sales, auction results and current listings for ${variants.length} ${brands.map((b) => b.name).join(" and ")} variants.`,
            )}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/modelle"
              className="btn border-white bg-white text-[#1f1d1a] hover:border-white/85 hover:bg-white/85"
            >
              {t("Modelle ansehen", "Browse models")}
            </Link>
            <Link
              to="/kaufen"
              className="btn border-white/40 text-white hover:border-white"
            >
              {t("Angebote durchsuchen", "Search listings")}
            </Link>
          </div>
        </HeroSlideshow>
        <SalesTicker sales={recent} />
      </div>

      <Section
        eyebrow={t("Marktindex", "Market index")}
        title={t("Der Markt", "The market")}
        actions={
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        }
      >
        <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="text-[13px] text-muted">
              {t("Gesamtindex, Januar 2015 = 100", "Overall index, January 2015 = 100")}
            </div>
            <div className="mt-1 font-serif text-[56px] leading-none text-accent">
              {num(index[index.length - 1].value, 0)}
            </div>
            <p className="mt-3 flex items-center gap-2 text-[14px]">
              <DeltaBadge value={indexChange} />
              <span className="text-muted">{t("in 12 Monaten", "in 12 months")}</span>
            </p>
            <IndexRange data={chartData} />
            <p className="mt-6 text-[14px] leading-relaxed text-muted">
              {t("Der Index bildet alle erfassten Varianten gleich gewichtet ab.", "The index weights every tracked variant equally.")}
            </p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="ov-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0"
                      stopColor="var(--color-accent)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="1"
                      stopColor="var(--color-accent)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  ticks={ticks}
                  tickFormatter={(t) =>
                    date(t, range === "1J" ? "month" : "year")
                  }
                  {...axisProps}
                  minTickGap={24}
                  dy={8}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  {...axisProps}
                  orientation="right"
                  width={40}
                  tickFormatter={(v) => num(v)}
                />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-2)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox
                        title={date(payload[0].payload.t)}
                        rows={[
                          {
                            label: "Index",
                            value: num(payload[0].payload.value, 1),
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#ov-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section
        eyebrow={t("Gewinner", "Winners")}
        title={t("Die größten Wertzuwächse", "Biggest gains")}
        sub={t("Veränderung des Marktwerts in den letzten 12 Monaten", "Change in market value over the last 12 months")}
        actions={
          <Link to="/modelle" className="link text-[14px]">
            {t("Alle Modelle", "All models")}
          </Link>
        }
      >
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {winners.map(({ id, change }, i) => {
            const v = variantById.get(id)!;
            return (
              <li key={id}>
                <Link to={`/markt/${id}`} className="group block overflow-hidden rounded-[4px] border border-line bg-panel transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(11,104,116,0.55)]">
                  <div className="relative overflow-hidden">
                    <CarImage
                      variant={v}
                      className="aspect-video w-full transition-transform duration-500 group-hover:scale-[1.03]"
                      label={variantTitle(v)}
                    />
                    <span className="absolute top-3 left-3 flex size-7 items-center justify-center rounded-full bg-night/85 font-serif text-[14px] text-on-night">
                      {i + 1}
                    </span>
                  </div>
                  <div className="px-4 pt-3 pb-4">
                    <div className="font-serif text-[16px] leading-snug group-hover:text-accent">
                      {variantTitle(v, { brand: false })}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Money value={getMetrics(id).value} compact className="text-[18px]" />
                      <DeltaBadge value={change} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid gap-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <Lock reason="auctions" height={260}>
        <Section
          eyebrow={t("Top-Zuschläge", "Top hammer prices")}
          title={t("Bemerkenswerte Verkäufe", "Notable sales")}
          sub={t("Die höchsten Zuschläge der letzten 30 Tage", "The highest hammer prices of the last 30 days")}
          actions={
            <Link to="/auktionen" className="link text-[14px]">
              {t("Alle Ergebnisse", "All results")}
            </Link>
          }
        >
          {notable.length === 0 ? (
            <p className="py-8 font-serif text-muted italic">
              {t("In den letzten 30 Tagen wurden keine Verkäufe erfasst.", "No sales were recorded in the last 30 days.")}
            </p>
          ) : (
            <ol className="space-y-2">
              {notable.map((s, i) => {
                const v = variantById.get(s.variantId)!;
                const share = s.price! / notable[0].price!;
                return (
                  <li key={s.id + s.variantId}>
                    <Link
                      to={`/markt/${v.id}`}
                      className="group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 overflow-hidden rounded-[4px] border border-line bg-panel px-4 py-3 transition-colors hover:border-accent/50"
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-accent-soft"
                        style={{ width: `${Math.max(8, share * 100)}%` }}
                        aria-hidden
                      />
                      <span className={cn("relative font-serif text-[22px] leading-none tabular-nums", i === 0 ? "text-accent" : "text-faint")}>
                        {i + 1}
                      </span>
                      <div className="relative min-w-0">
                        <div className="truncate font-serif text-[16px] group-hover:text-accent">
                          {variantTitle(v, { brand: false })}
                        </div>
                        <div className="mt-0.5 text-[13px] text-muted">
                          {s.house}, {date(s.date)}
                        </div>
                      </div>
                      <Money value={s.price} sale={s} className="relative text-[18px]" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
        </Lock>

        <Section
          eyebrow={t("Kalender", "Calendar")}
          title={t("Kommende Auktionen", "Upcoming auctions")}
          sub={t("Die nächsten Termine der Häuser", "The next dates of the houses")}
        >
          {upcoming.length === 0 ? (
            <p className="py-8 font-serif text-muted italic">
              {t("Die Termine werden mit dem nächsten täglichen Update geladen.", "The dates load with the next daily update.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 6).map((c) => (
                <li key={`${c.house}|${c.name}|${c.date}`}>
                  <a
                    href={c.url ?? HOUSE_CALENDARS.find((h) => h.house === c.house)?.url ?? "/auktionen"}
                    target="_blank"
                    rel="noreferrer"
                    title={t("Zur Auktion", "View sale")}
                    className="group flex items-center gap-4 rounded-[4px] border border-line bg-panel px-3 py-2.5 transition-colors hover:border-accent/50"
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-[3px] bg-accent-soft py-1.5 text-accent">
                      <span className="font-serif text-[20px] leading-none">{new Date(c.date).toLocaleDateString(locale(), { day: "numeric", timeZone: "UTC" })}</span>
                      <span className="mt-0.5 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
                        {new Date(c.date).toLocaleDateString(locale(), { month: "short", timeZone: "UTC" })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-[15.5px] leading-snug">{c.name}</div>
                      <div className="truncate text-[12.5px] text-muted">
                        {c.house}
                        {c.country ? ` · ${flag(c.country)} ${c.place}` : c.place ? ` · ${c.place}` : ""}
                      </div>
                    </div>
                    {c.porsche ? (
                      <span title={t("Porsche im Katalog", "Porsches in the catalogue")} className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent tabular-nums">
                        {t(`${c.porsche} Porsche`, c.porsche === 1 ? "1 Porsche" : `${c.porsche} Porsches`)}
                      </span>
                    ) : null}
                    <ExternalLink className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/** Low and high of the index in the shown period, as a thin bar with the current value marked. */
function IndexRange({ data }: { data: { value: number }[] }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const now = vals[vals.length - 1];
  const at = ((now - lo) / (hi - lo || 1)) * 100;
  return (
    <div className="mt-6 max-w-[240px]">
      <div className="mb-2 text-[12px] text-muted">{t("Spanne im Zeitraum", "Range in this period")}</div>
      <div className="relative h-1.5 rounded-full bg-[linear-gradient(90deg,var(--color-accent-soft),var(--color-accent))]">
        <span className="absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-bg bg-accent" style={{ left: `${at}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[12.5px] text-muted tabular-nums">
        <span>{num(lo, 0)}</span>
        <span>{num(hi, 0)}</span>
      </div>
    </div>
  );
}

/** Endless band of the cars sold last, with their hammer prices, under the stage; pauses on hover, scrolls by hand with
 * reduced motion. Lite (src/lib/plan.tsx): which cars sold is free, the prices are premium. */
function SalesTicker({ sales }: { sales: Sale[] }) {
  const lite = !usePlan().premium;
  if (!sales.length) return null;
  const items = (copy: number) =>
    sales.map((s) => {
      const v = variantById.get(s.variantId)!;
      return (
        <li
          key={`${copy}-${s.id}-${s.variantId}`}
          className="flex shrink-0 items-baseline gap-3 px-7"
          aria-hidden={copy > 0 || undefined}
        >
          <Link
            to={`/markt/${v.id}`}
            tabIndex={copy > 0 ? -1 : undefined}
            className="font-serif text-[15px] font-semibold hover:underline hover:underline-offset-4"
          >
            {variantTitle(v, { brand: false })}
          </Link>
          {lite ? <LockedValue reason="sales" sample="000.000 €" className="text-[15px]" /> : <Money value={s.price} sale={s} className="text-[15px]" />}
          <span className="pl-4 text-gold/60" aria-hidden>
            ◆
          </span>
        </li>
      );
    });
  return (
    <div className="hero-bleed flex items-stretch border-b border-line bg-panel">
      <div className="hidden shrink-0 items-center gap-2 border-r border-line bg-accent-soft px-5 text-[13px] font-semibold text-accent sm:flex sm:px-8">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
        {t("Zuletzt verkauft", "Just sold")}
      </div>
      <div
        className="ticker relative min-w-0 flex-1 overflow-hidden py-3.5"
        aria-label={t("Zuletzt verkaufte Fahrzeuge", "Recently sold cars")}
      >
        <ul
          className="ticker-track flex w-max"
          style={{ ["--ticker-duration" as string]: `${sales.length * 4}s` }}
        >
          {items(0)}
          {items(1)}
        </ul>
      </div>
    </div>
  );
}
