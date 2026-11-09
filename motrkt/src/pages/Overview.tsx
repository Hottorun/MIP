import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brands, variantById, variantTitle, variants } from "../data/db";
import { AS_OF, DAY, getAllSales, getAuctionEvents } from "../data/generate";
import { changeOver, getMetrics, marketIndex, sliceRange, topMovers } from "../data/market";
import type { Sale } from "../data/types";
import { date, eur, num, pct, trendClass } from "../lib/format";
import { CarImage } from "../components/CarImage";
import { HeroSlideshow } from "../components/HeroSlideshow";
import { ChartTooltipBox, Delta, Section, Segmented, axisProps } from "../components/ui";
import { yearTicks } from "../components/insights/palette";

const RANGE_OPTIONS = [
  { value: "1J" as const, label: "1 Jahr" },
  { value: "5J" as const, label: "5 Jahre" },
  { value: "10J" as const, label: "10 Jahre" },
];

export default function Overview() {
  const [range, setRange] = useState<"1J" | "5J" | "10J">("5J");
  const index = marketIndex();
  const indexChange = changeOver(index, 52);
  const chartData = useMemo(() => sliceRange(index, range).map((p) => ({ t: p.t, value: p.value })), [index, range]);
  const ticks = useMemo(() => (range === "1J" || chartData.length < 2 ? undefined : yearTicks(chartData[0].t, chartData[chartData.length - 1].t)), [chartData, range]);

  const winners = useMemo(
    () =>
      topMovers(
        variants.filter((v) => v.marketPhotos.length || v.photos.length).map((v) => v.id),
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
  const events = useMemo(() => getAuctionEvents().filter((e) => e.date >= AS_OF).slice(0, 4), []);

  return (
    <div className="space-y-24">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
        <HeroSlideshow />
        <div className="lg:pb-8">
          <h1 className="font-display text-[44px] leading-[1.05] sm:text-[60px]">Was klassische Sportwagen heute wert sind.</h1>
          <p className="mt-6 max-w-md font-serif text-[17px] leading-relaxed text-ink/85">
            Marktwerte aus belegten Verkäufen, Auktionsergebnisse und aktuelle Angebote für {variants.length} Varianten von {brands.map((b) => b.name).join(" und ")}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/modelle" className="btn btn-gold">
              Modelle ansehen
            </Link>
            <Link to="/kaufen" className="btn">
              Angebote durchsuchen
            </Link>
          </div>
        </div>
      </section>

      <Section title="Der Markt" actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}>
        <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="text-[13px] text-muted">Gesamtindex, Januar 2015 = 100</div>
            <div className="mt-1 font-serif text-[48px] leading-none">{num(index[index.length - 1].value, 0)}</div>
            <p className="mt-3 text-[14px]">
              <Delta value={indexChange} arrow={false} /> <span className="text-muted">in 12 Monaten</span>
            </p>
            <p className="mt-6 text-[14px] leading-relaxed text-muted">Der Index bildet alle erfassten Varianten gleich gewichtet ab.</p>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ov-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.16} />
                    <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                  ticks={ticks}
                  tickFormatter={(t) => date(t, range === "1J" ? "month" : "year")}
                  {...axisProps}
                  minTickGap={24}
                  dy={8}
                />
                <YAxis domain={["auto", "auto"]} {...axisProps} orientation="right" width={40} tickFormatter={(v) => num(v)} />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-2)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? <ChartTooltipBox title={date(payload[0].payload.t)} rows={[{ label: "Index", value: num(payload[0].payload.value, 1) }]} /> : null
                  }
                />
                <Area type="monotone" dataKey="value" stroke="var(--color-gold)" strokeWidth={1.75} fill="url(#ov-fill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section
        title="Die größten Wertzuwächse"
        sub="Veränderung des Marktwerts in den letzten 12 Monaten"
        actions={
          <Link to="/modelle" className="link text-[14px]">
            Alle Modelle
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
                    <CarImage variant={v} className="aspect-video w-full transition-transform duration-500 group-hover:scale-[1.02]" label={variantTitle(v)} />
                  </div>
                  <div className="mt-3 font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{variantTitle(v, { brand: false })}</div>
                  <div className="mt-0.5 flex items-baseline justify-between text-[14px]">
                    <span className="text-muted">{eur(getMetrics(id).value, { compact: true })}</span>
                    <span className={trendClass(change)}>{pct(change)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid grid-cols-1 gap-x-16 gap-y-24 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section
          title="Bemerkenswerte Verkäufe"
          sub="Die höchsten Zuschläge der letzten 30 Tage"
          actions={
            <Link to="/auktionen" className="link text-[14px]">
              Alle Ergebnisse
            </Link>
          }
        >
          {notable.length === 0 ? (
            <p className="py-8 font-serif text-muted italic">In den letzten 30 Tagen wurden keine Verkäufe erfasst.</p>
          ) : (
            <ul>
              {notable.map((s) => {
                const v = variantById.get(s.variantId)!;
                return (
                  <li key={s.id + s.variantId}>
                    <Link to={`/markt/${v.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-line py-4">
                      <div className="min-w-0">
                        <div className="truncate font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{variantTitle(v, { brand: false })}</div>
                        <div className="mt-0.5 text-[13px] text-muted">
                          {s.house}, {date(s.date)}
                        </div>
                      </div>
                      <div className="font-serif text-[18px] tabular-nums">{eur(s.price)}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Anstehende Auktionen"
          actions={
            <Link to="/auktionen" className="link text-[14px]">
              Kalender
            </Link>
          }
        >
          <ul>
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/auktionen?event=${e.id}`} className="group grid grid-cols-[64px_minmax(0,1fr)] gap-5 border-b border-line py-4">
                  <div className="text-center">
                    <div className="font-serif text-[28px] leading-none">{new Date(e.date).getUTCDate()}</div>
                    <div className="mt-1 text-[13px] text-muted">{new Date(e.date).toLocaleDateString("de-DE", { month: "short", timeZone: "UTC" })}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{e.house}</div>
                    <div className="truncate text-[14px] text-ink/80">{e.title}</div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {e.city}, {e.lots.length} {e.lots.length === 1 ? "Los" : "Lose"}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
