import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { brandById, generationById, modelById, optionFactor, variantById, variantShortTitle, variantTitle, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics } from "../../data/market";
import { getSales, hasRealSales } from "../../data/generate";
import { marketBasis } from "../../data/real/model";
import { useStore } from "../../state/store";
import { cn, eur, num, pct } from "../../lib/format";
import { CarArt, GALLERY } from "../CarArt";
import { Delta, Modal, Pill } from "../ui";
import { PhotoCredit } from "../CarImage";

/** Product-page top: photograph on the left, a calm summary column on the right. */
export function Hero({ variant, picked }: { variant: Variant; picked: string[] }) {
  const brand = brandById.get(variant.brandId)!;
  const model = modelById.get(variant.modelId)!;
  const gen = generationById.get(variant.generationId)!;

  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-muted" aria-label="Brotkrumen">
        <Link to={`/modelle?marke=${brand.id}`} className="hover:text-ink">
          {brand.name}
        </Link>
        <span className="text-faint">/</span>
        <Link to={`/modelle?modell=${model.id}`} className="hover:text-ink">
          {model.name}
        </Link>
        {gen.name !== model.name && (
          <>
            <span className="text-faint">/</span>
            <span>{gen.name}</span>
          </>
        )}
      </nav>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)] lg:gap-16">
        <div className="min-w-0">
          {variant.marketPhotos.length ? <Gallery variant={variant} /> : <IllustratedGallery variant={variant} />}
          {variant.officialLink && <OfficialLink variant={variant} />}
        </div>
        <Summary variant={variant} picked={picked} />
      </div>
    </div>
  );
}

function Summary({ variant, picked }: { variant: Variant; picked: string[] }) {
  const { watchlist, toggleWatch, alerts, toast } = useStore();
  const [alertOpen, setAlertOpen] = useState(false);
  const brand = brandById.get(variant.brandId)!;
  const model = modelById.get(variant.modelId)!;
  const gen = generationById.get(variant.generationId)!;
  const m = getMetrics(variant.id);
  const factor = optionFactor(variant, picked);
  const watched = watchlist.includes(variant.id);
  const alertCount = alerts.filter((a) => a.variantId === variant.id).length;
  const real = hasRealSales(variant.id);
  const lineage = gen.name !== model.name ? `${brand.name} ${model.name} (${gen.name})` : `${brand.name} ${model.name}`;
  const siblings = gen.variantIds.map((id) => variantById.get(id)!);
  const generations = model.generationIds.map((id) => generationById.get(id)!);

  const facts: [string, React.ReactNode][] = [
    ["Produktion", `${num(variant.production)} Stück`],
    ["Motor", `${num(variant.liters, 1)} l, ${variant.hp} PS`],
    ["Neupreis", `${eur(variant.newPrice)} (${variant.years[0]})`],
  ];
  if (variant.launchColor) {
    facts.push([
      "Farbe der Präsentation",
      <span key="c" className="inline-flex items-center gap-2">
        <span className="size-3 rounded-full ring-1 ring-ink/15" style={{ background: variant.launchColor.hex }} />
        {variant.launchColor.name.replace(/ \(.+\)$/, "")}
      </span>,
    ]);
  }

  return (
    <div className="lg:sticky lg:top-[112px] lg:self-start">
      <p className="text-[14px] text-muted">{lineage}</p>
      <h1 className="mt-1 font-display text-[44px] leading-[1.05] sm:text-[52px]">{variant.name}</h1>
      <p className="mt-2 font-serif text-[16px] text-muted italic">{yearsLabel(variant.years)}</p>

      <div className="mt-8 border-t border-line pt-6">
        <div className="text-[13px] text-muted">{picked.length ? "Schätzwert mit Ausstattung" : "Marktwert, Median"}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-serif text-[36px] leading-none">{eur(Math.round((m.value * factor) / 1000) * 1000)}</span>
          {picked.length ? (
            <span className={cn("text-[14px]", factor >= 1 ? "text-up" : "text-down")}>
              {pct(factor - 1)} <span className="text-muted">durch {picked.length === 1 ? "1 Option" : `${picked.length} Optionen`}</span>
            </span>
          ) : (
            <span className="text-[14px]">
              <Delta value={m.change12m} arrow={false} /> <span className="text-muted">in 12 Monaten</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] text-faint">
          {picked.length ? `Median ohne Optionen ${eur(Math.round(m.value / 1000) * 1000)}. ` : ""}
          <BasisLine variant={variant} fallback={real ? `Aus ${getSales(variant.id).length} belegten Verkäufen` : "Demo-Daten"} />
          {variant.options.length > 0 && (
            <>
              {" · "}
              <button
                onClick={() => document.getElementById("ausstattung")?.scrollIntoView({ behavior: "smooth" })}
                className="text-muted underline decoration-line-2 underline-offset-2 hover:text-ink"
              >
                {picked.length ? "Ausstattung ändern" : "Ausstattung wählen"}
              </button>
            </>
          )}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            className={cn("btn", !watched && "btn-gold")}
            aria-pressed={watched}
            onClick={() => {
              toggleWatch(variant.id);
              toast(watched ? "Nicht mehr beobachtet" : "Wird beobachtet");
            }}
          >
            {watched ? "Wird beobachtet" : "Beobachten"}
          </button>
          <button className="btn" onClick={() => setAlertOpen(true)}>
            {alertCount ? `Preisalarm (${alertCount})` : "Preisalarm"}
          </button>
        </div>
      </div>

      <p className="mt-8 font-serif text-[16px] leading-[1.7] text-ink/90">{m.thesis}</p>

      <dl className="mt-8 border-t border-line text-[14px]">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {siblings.length > 1 && (
        <Picker label="Varianten">
          {siblings.map((s) => (
            <PickerLink key={s.id} to={`/markt/${s.id}`} active={s.id === variant.id}>
              {s.name}
            </PickerLink>
          ))}
        </Picker>
      )}
      {generations.length > 1 && (
        <Picker label="Generationen">
          {generations.map((g) => (
            <PickerLink key={g.id} to={`/markt/${g.variantIds[0]}`} active={g.id === gen.id}>
              {g.name}
            </PickerLink>
          ))}
        </Picker>
      )}
      <AlertModal open={alertOpen} onClose={() => setAlertOpen(false)} variant={variant} />
    </div>
  );
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-2.5 text-[13px] text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PickerLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[2px] border px-3 py-1.5 text-[13.5px] transition-colors",
        active ? "border-ink bg-ink text-bg" : "border-line-2 text-ink hover:border-ink",
      )}
    >
      {children}
    </Link>
  );
}

const arrowBtn =
  "absolute top-1/2 -translate-y-1/2 rounded-full bg-bg/85 p-2 text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100";

function Gallery({ variant }: { variant: Variant }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [variant.id]);
  const photos = variant.marketPhotos;
  const n = photos.length;
  const go = (d: number) => setIndex((i) => (i + d + n) % n);
  const photo = photos[index];
  return (
    <figure
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      aria-label="Bildergalerie"
      className="min-w-0"
    >
      <div className="group relative aspect-video overflow-hidden bg-panel-3">
        <img key={photo.file} src={photo.file} alt={photo.caption ?? variantTitle(variant)} className="animate-fade-in size-full object-cover" />
        {photo.premiere && <span className="absolute top-4 left-4 rounded-full bg-bg/90 px-3 py-1 text-[12.5px] text-ink">Vorstellung</span>}
        {n > 1 && (
          <>
            <button onClick={() => go(-1)} className={cn(arrowBtn, "left-4")} aria-label="Vorheriges Bild">
              <ChevronLeft className="size-5" strokeWidth={1.5} />
            </button>
            <button onClick={() => go(1)} className={cn(arrowBtn, "right-4")} aria-label="Nächstes Bild">
              <ChevronRight className="size-5" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-6">
        <figcaption className="min-w-0">
          <div className="font-serif text-[14.5px] text-ink/85 italic">{photo.caption ?? variantTitle(variant)}</div>
          <PhotoCredit photo={photo} className="mt-0.5 text-[12px] text-faint" />
        </figcaption>
        {n > 1 && (
          <span className="shrink-0 text-[13px] text-faint tabular-nums">
            {index + 1} / {n}
          </span>
        )}
      </div>
      {n > 1 && (
        <div className="mt-4 flex gap-2">
          {photos.map((p, i) => (
            <button
              key={p.file}
              onClick={() => setIndex(i)}
              className={cn("aspect-video w-24 overflow-hidden border-b-2 pb-1 transition-opacity", i === index ? "border-ink" : "border-transparent opacity-60 hover:opacity-100")}
              aria-label={`Bild ${i + 1}`}
              aria-current={i === index}
            >
              <img src={p.file} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

function IllustratedGallery({ variant }: { variant: Variant }) {
  const [index, setIndex] = useState(0);
  const n = GALLERY.length;
  useEffect(() => setIndex(0), [variant.id]);
  const go = (d: number) => setIndex((i) => (i + d + n) % n);

  return (
    <figure
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      aria-label="Bildergalerie"
      className="min-w-0"
    >
      <div className="group relative aspect-video overflow-hidden bg-panel-3">
        <CarArt
          key={`${variant.id}-${index}`}
          className="animate-fade-in size-full"
          shape={variant.shape}
          color={variant.color}
          scene={GALLERY[index].scene}
          view={GALLERY[index].view}
          label={GALLERY[index].view === "badge" ? variant.name : `${variantTitle(variant)} – ${GALLERY[index].caption}`}
        />
        <button onClick={() => go(-1)} className={cn(arrowBtn, "left-4")} aria-label="Vorheriges Bild">
          <ChevronLeft className="size-5" strokeWidth={1.5} />
        </button>
        <button onClick={() => go(1)} className={cn(arrowBtn, "right-4")} aria-label="Nächstes Bild">
          <ChevronRight className="size-5" strokeWidth={1.5} />
        </button>
      </div>
      <figcaption className="mt-4 flex justify-between gap-6">
        <span className="font-serif text-[14.5px] text-ink/85 italic">{GALLERY[index].caption}. Illustration, kein offizielles Herstellerfoto verfügbar.</span>
        <span className="shrink-0 text-[13px] text-faint tabular-nums">
          {index + 1} / {n}
        </span>
      </figcaption>
    </figure>
  );
}

/** Link to the manufacturer's own photos; those images may not be copied into the app without permission. */
function OfficialLink({ variant }: { variant: Variant }) {
  const l = variant.officialLink!;
  const source = "Porsche Newsroom";
  const label = l.kind === "premiere" ? "Offizielle Pressebilder der Vorstellung" : "Offizielle Bilder beim Hersteller";
  return (
    <p className="mt-6 border-t border-line pt-4 text-[14px]">
      <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 hover:text-gold" title={l.title}>
        {label}
        <ArrowUpRight className="size-3.5 self-center text-faint" strokeWidth={1.5} />
      </a>
      <span className="block text-[13px] text-muted">
        {source}
        {l.event && `, Vorstellung: ${l.event}`}
      </span>
    </p>
  );
}

function AlertModal({ open, onClose, variant }: { open: boolean; onClose: () => void; variant: Variant }) {
  const { alerts, addAlert, removeAlert, toast } = useStore();
  const value = getMetrics(variant.id).value;
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  useEffect(() => {
    if (open) setThreshold(String(Math.round((value * 1.05) / 1000) * 1000));
  }, [open, value]);
  const existing = alerts.filter((a) => a.variantId === variant.id);
  const parsed = Number(threshold.replace(/\./g, "").replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preisalarm für ${variantShortTitle(variant)}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          <button
            className="btn btn-gold"
            disabled={!valid}
            onClick={() => {
              addAlert({ variantId: variant.id, direction, threshold: parsed });
              toast(`Alarm gesetzt: ${direction === "above" ? "über" : "unter"} ${eur(parsed)}`);
              onClose();
            }}
          >
            Alarm setzen
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-muted">
        Der Marktwert liegt aktuell bei <span className="text-ink">{eur(value)}</span>. Sobald er die Schwelle erreicht, erscheint eine Benachrichtigung unter der Glocke.
      </p>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <label>
          <span className="label">Wenn der Wert</span>
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}>
            <option value="above">steigt über</option>
            <option value="below">fällt unter</option>
          </select>
        </label>
        <label>
          <span className="label">Schwelle in €</span>
          <input className="input" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
      </div>
      {!valid && threshold && <p className="mt-2 text-[13px] text-down">Bitte einen Betrag in Euro eingeben, zum Beispiel 250000.</p>}
      {existing.length > 0 && (
        <div className="mt-6">
          <div className="label">Aktive Alarme</div>
          <ul className="border-t border-line">
            {existing.map((a) => {
              const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
              return (
                <li key={a.id} className="flex items-center gap-3 border-b border-line py-2 text-[14px]">
                  <span className="flex-1">
                    {a.direction === "above" ? "über" : "unter"} {eur(a.threshold)}
                  </span>
                  <Pill tone={hit ? "gold" : "neutral"}>{hit ? "ausgelöst" : "aktiv"}</Pill>
                  <button className="text-muted hover:text-down" onClick={() => removeAlert(a.id)} aria-label="Alarm löschen">
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function BasisLine({ variant, fallback }: { variant: Variant; fallback: string }) {
  const b = marketBasis(variant.id);
  if (!b) return <>{fallback}</>;
  if (b.n === 0) return <>Schätzwert, keine belegten Verkäufe seit 2015</>;
  const since = b.first ? new Date(b.first).getUTCFullYear() : 2015;
  return (
    <>
      Median aus {num(b.n)} {b.n === 1 ? "Auktionsergebnis" : "Auktionsergebnissen"} seit {since}
      {b.n12 > 0 && `, ${num(b.n12)} davon in den letzten 12 Monaten`}
      {b.lo && b.hi && ` · mittlere Hälfte ${eur(Math.round(b.lo / 1000) * 1000, { compact: true })} bis ${eur(Math.round(b.hi / 1000) * 1000, { compact: true })}`}
    </>
  );
}
