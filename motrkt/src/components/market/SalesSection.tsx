import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { variantById, variantShortTitle, variantsOfBrand } from "../../data/db";
import type { Body, Gearbox, SaleSource, Variant } from "../../data/types";
import { getSales } from "../../data/generate";
import { familyVariantIds, getMetrics, topMovers } from "../../data/market";
import { cn, date, eur, km, pct } from "../../lib/format";
import { CarArt } from "../CarArt";
import { Card, Delta, Pill } from "../ui";

const SOURCE_FILTERS: ("Alle" | SaleSource)[] = ["Alle", "Auktion", "Händler", "Privat"];

export function RecentSales({ variant }: { variant: Variant }) {
  const navigate = useNavigate();
  const [source, setSource] = useState<"Alle" | SaleSource>("Alle");
  const [body, setBody] = useState<Body | "Alle">("Alle");
  const [gearbox, setGearbox] = useState<Gearbox | "Alle">("Alle");
  const [expanded, setExpanded] = useState(false);
  const bodies = Object.keys(variant.body) as Body[];
  const gearboxes = Object.keys(variant.gearbox) as Gearbox[];

  const rows = useMemo(
    () =>
      getSales(variant.id).filter(
        (s) => (source === "Alle" || s.source === source) && (body === "Alle" || s.body === body) && (gearbox === "Alle" || s.gearbox === gearbox),
      ),
    [variant.id, source, body, gearbox],
  );
  const shown = rows.slice(0, expanded ? 15 : 5);

  return (
    <Card
      title="Jüngste Verkäufe & Auktionen"
      sub="(AI-aggregiert)"
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {SOURCE_FILTERS.map((s) => (
            <button key={s} className={cn("chip", source === s && "chip-active")} onClick={() => setSource(s)}>
              {s}
            </button>
          ))}
          {bodies.length > 1 && (
            <select className="chip bg-transparent" value={body} onChange={(e) => setBody(e.target.value as Body | "Alle")} aria-label="Karosserie">
              <option value="Alle">Karosserie</option>
              {bodies.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          )}
          {gearboxes.length > 1 && (
            <select className="chip bg-transparent" value={gearbox} onChange={(e) => setGearbox(e.target.value as Gearbox | "Alle")} aria-label="Getriebe">
              <option value="Alle">Getriebe</option>
              {gearboxes.map((g) => (
                <option key={g} value={g}>
                  {g === "Manual" ? "Schaltgetriebe" : "Automatik"}
                </option>
              ))}
            </select>
          )}
        </div>
      }
      bodyClassName="px-2"
    >
      <div className="overflow-x-auto">
        <table className="table-base table-hover">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Quelle</th>
              <th className="text-right">Preis (final)</th>
              <th>Zustand</th>
              <th className="text-right">Laufleistung</th>
              <th>Käuferland</th>
              <th>Herkunft</th>
              <th>Auslieferung</th>
              <th>Haus / Händler</th>
              <th className="text-right">Trend</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id + s.date} onClick={() => navigate(`/auktionen?q=${encodeURIComponent(s.id)}`)} title={`${s.id} · FIN ${s.vin}`}>
                <td className="text-muted">{date(s.date)}</td>
                <td>{s.source}</td>
                <td className="text-right font-semibold tabular-nums">{s.price ? eur(s.price) : <span className="font-normal text-muted">nicht verkauft</span>}</td>
                <td>{s.condition}</td>
                <td className="text-right tabular-nums text-muted">{km(s.mileage)}</td>
                <td>{s.buyerCountry}</td>
                <td>{s.originCountry}</td>
                <td>{s.deliveryCountry}</td>
                <td className="max-w-40 truncate">{s.house}</td>
                <td className="text-right">{s.price ? <Delta value={s.trend} /> : <span className="text-faint">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="py-6 text-center text-sm text-muted">Keine Transaktionen für diese Filter.</div>}
      </div>
      <div className="mt-2 flex items-center justify-between px-2 text-xs">
        <span className="text-muted">{rows.length} Transaktionen in 5 Jahren</span>
        <span className="flex gap-3">
          {rows.length > 5 && (
            <button className="inline-flex items-center gap-1 text-gold hover:underline" onClick={() => setExpanded((e) => !e)}>
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {expanded ? "Weniger" : "Mehr anzeigen"}
            </button>
          )}
          <Link to={`/auktionen?q=${encodeURIComponent(variantShortTitle(variant))}`} className="text-gold hover:underline">
            Alle Ergebnisse →
          </Link>
        </span>
      </div>
    </Card>
  );
}

export function AuctionInsights({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const family = familyVariantIds(variant.id);
  const peers = family.length >= 4 ? family : variantsOfBrand(variant.brandId).map((v) => v.id);
  const { winners, losers } = topMovers(peers, 3);
  const Mover = ({ id, change }: { id: string; change: number }) => (
    <li>
      <Link to={`/markt/${id}`} className={cn("flex justify-between gap-2 hover:text-ink", id === variant.id ? "text-ink" : "text-muted")}>
        <span className="truncate">{variantShortTitle(variantById.get(id)!)}</span>
        <span className={cn("tabular-nums", change >= 0 ? "text-up" : "text-down")}>{pct(change)}</span>
      </Link>
    </li>
  );
  const stats = [
    { label: "Auktionsanteil", value: pct(m.auctionShare, { signed: false, digits: 0 }) },
    { label: "Verkaufsquote", sub: "(Sale-Through)", value: pct(m.sellThrough, { signed: false, digits: 0 }) },
    { label: "Ø Aufschlag vs. Schätzwert", value: pct(m.premiumVsEstimate) },
  ];
  return (
    <Card title="Auktions-Insights" sub="(letzte 12 Monate)">
      <div className="grid grid-cols-1 gap-3">
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel-2 px-3">
          {stats.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-2 py-2.5 text-[13px]">
              <span className="text-muted">
                {s.label} {s.sub && <span className="text-[11px] text-faint">{s.sub}</span>}
              </span>
              <span className="font-semibold whitespace-nowrap tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-xs font-medium text-up">
              Gewinner <span className="font-normal text-muted">(Top 3, Ø +)</span>
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {winners.map((w) => (
                <Mover key={w.id} {...w} />
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-down">
              Verlierer <span className="font-normal text-muted">(Top 3, Ø −)</span>
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {losers.map((w) => (
                <Mover key={w.id} {...w} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Recommendation({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const tone = m.recommendation.code === "BUY" ? "up" : m.recommendation.code === "HOLD" ? "gold" : "warn";
  const buyingPath =
    m.premiumVsEstimate > 0.04
      ? "Auktionen schließen deutlich über Schätzung – über spezialisierte Händler (Transparenz, Historie, Zustandsprüfung) oft günstiger."
      : "Bevorzugt über spezialisierte Händler (Transparenz, Historie, Zustandsprüfung) – Auktion nur bei sehr guter Dokumentation.";
  return (
    <section className="panel relative overflow-hidden">
      <CarArt
        className="pointer-events-none absolute -right-16 -bottom-6 h-40 w-[360px] opacity-[0.13]"
        shape={variant.shape}
        color={variant.color}
        scene="none"
        view="badge"
        label={variant.name}
      />
      <div className="relative px-4 pt-3 pb-4">
        <h2 className="panel-title">Kaufempfehlung & Schwachstellen</h2>
        <div className="mt-2 flex items-center gap-2">
          <Pill tone={tone} className="px-2 text-sm font-bold">
            {m.recommendation.code}
          </Pill>
          <span className="text-[15px] font-semibold">
            Kaufempfehlung: <span className={tone === "up" ? "text-up" : tone === "gold" ? "text-gold-2" : "text-warn"}>{m.recommendation.label}</span>
          </span>
        </div>
        <div className="mt-2.5 space-y-2 text-[13px]">
          <p className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink/80" />
            <span>
              <span className="font-medium">Investment-These:</span> <span className="text-muted">{m.thesis}</span>
            </span>
          </p>
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <span className="font-medium">Typische Schwachstellen (prüfen):</span>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted marker:text-faint">
                {variant.weaknesses.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink/80" />
            <span>
              <span className="font-medium">Kaufweg:</span> <span className="text-muted">{buyingPath}</span>
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
