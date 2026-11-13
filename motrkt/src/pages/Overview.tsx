import { useMemo, useState } from "react";
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
  topMovers,
} from "../data/market";
import type { Sale } from "../data/types";
import { date, num, pct, trendClass } from "../lib/format";
import { CarImage } from "../components/CarImage";
import { HeroSlideshow } from "../components/HeroSlideshow";
import {
  ChartTooltipBox,
  Delta,
  Section,
  Segmented,
  axisProps,
  Money,
} from "../components/ui";
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

  const winners = useMemo(
    () =>
      topMovers(
        variants
          .filter((v) => v.measured && (v.marketPhotos.length || v.photos.length))
          .map((v) => v.id),
        4,
      ).winners,
    [],
  );
  const notable = useMemo(() => {
    const from = AS_OF - 30 * DAY;
    const out: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.date < from) break;
      if (s.price !== null) out.push(s);
    }
    return out.sort((a, b) => b.price! - a.price!).slice(0, 6);
  }, []);
  const recent = useMemo(() => {
    const out: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.price !== null && variantById.has(s.variantId)) out.push(s);
      if (out.length >= 24) break;
    }
    return out;
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
              className="btn border-white bg-white text-ink hover:border-white/85 hover:bg-white/85"
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
            <div className="mt-1 font-serif text-[48px] leading-none">
              {num(index[index.length - 1].value, 0)}
            </div>
            <p className="mt-3 text-[14px]">
              <Delta value={indexChange} arrow={false} />{" "}
              <span className="text-muted">{t("in 12 Monaten", "in 12 months")}</span>
            </p>
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
                      stopColor="var(--color-gold)"
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="1"
                      stopColor="var(--color-gold)"
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
                  stroke="var(--color-ink)"
                  strokeWidth={1.75}
                  fill="url(#ov-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section
        title={t("Die größten Wertzuwächse", "Biggest gains")}
        sub={t("Veränderung des Marktwerts in den letzten 12 Monaten", "Change in market value over the last 12 months")}
        actions={
          <Link to="/modelle" className="link text-[14px]">
            {t("Alle Modelle", "All models")}
          </Link>
        }
      >
        <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {winners.map(({ id, change }) => {
            const v = variantById.get(id)!;
            return (
              <li key={id}>
                <Link to={`/markt/${id}`} className="group block">
                  <div className="overflow-hidden">
                    <CarImage
                      variant={v}
                      className="aspect-video w-full"
                      label={variantTitle(v)}
                    />
                  </div>
                  <div className="mt-3 font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                    {variantTitle(v, { brand: false })}
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between text-[14px]">
                    <Money
                      value={getMetrics(id).value}
                      compact
                      className="text-[16px]"
                    />
                    <span className={trendClass(change)}>{pct(change)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
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
          <ul>
            {notable.map((s) => {
              const v = variantById.get(s.variantId)!;
              return (
                <li key={s.id + s.variantId}>
                  <Link
                    to={`/markt/${v.id}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line py-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                        {variantTitle(v, { brand: false })}
                      </div>
                      <div className="mt-0.5 text-[13px] text-muted">
                        {s.house}, {date(s.date)}
                      </div>
                    </div>
                    <Money value={s.price} sale={s} className="text-[18px]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Endless band of the latest hammer prices under the stage; pauses on hover, scrolls by hand with reduced motion. */
function SalesTicker({ sales }: { sales: Sale[] }) {
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
          <Money value={s.price} sale={s} className="text-[15px]" />
          <span className="text-[12.5px] text-muted">
            {s.house}, {date(s.date)}
          </span>
          <span className="pl-4 text-line-2" aria-hidden>
            ◆
          </span>
        </li>
      );
    });
  return (
    <div className="hero-bleed flex items-stretch border-b border-line bg-panel">
      <div className="hidden shrink-0 items-center border-r border-line px-5 text-[13px] font-medium text-muted sm:flex sm:px-8">
        {t("Zuletzt verkauft", "Just sold")}
      </div>
      <div
        className="ticker relative min-w-0 flex-1 overflow-hidden py-3.5"
        aria-label={t("Zuletzt verkaufte Fahrzeuge", "Recently sold cars")}
      >
        <ul
          className="ticker-track flex w-max"
          style={{ ["--ticker-duration" as string]: `${sales.length * 5}s` }}
        >
          {items(0)}
          {items(1)}
        </ul>
      </div>
    </div>
  );
}
