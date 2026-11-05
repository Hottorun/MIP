import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, ChevronLeft, ChevronRight, ImageIcon, Star, Trash2 } from "lucide-react";
import { brandById, generationById, modelById, variantShortTitle, variantTitle, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics } from "../../data/market";
import { useStore } from "../../state/store";
import { cn, eur, num } from "../../lib/format";
import { CarArt, GALLERY } from "../CarArt";
import { BrandEmblem, Modal, Pill } from "../ui";

export function Hero({ variant }: { variant: Variant }) {
  const { watchlist, toggleWatch, alerts, toast } = useStore();
  const [alertOpen, setAlertOpen] = useState(false);
  const brand = brandById.get(variant.brandId)!;
  const model = modelById.get(variant.modelId)!;
  const gen = generationById.get(variant.generationId)!;
  const watched = watchlist.includes(variant.id);
  const variantAlerts = alerts.filter((a) => a.variantId === variant.id);
  const facts = [variantShortTitle(variant), yearsLabel(variant.years), variant.tags[0], `${num(variant.liters, 1)} l`, `${variant.hp} PS`].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Brotkrumen">
        <Link to={`/modelle?marke=${brand.id}`} className="hover:text-ink">
          {brand.name}
        </Link>
        <ChevronRight className="size-3" />
        <Link to={`/modelle?modell=${model.id}`} className="hover:text-ink">
          {model.name}
        </Link>
        {gen.name !== model.name && (
          <>
            <ChevronRight className="size-3" />
            <Link to={`/markt/${gen.variantIds[0]}`} className="hover:text-ink">
              {gen.name}
            </Link>
          </>
        )}
        <ChevronRight className="size-3" />
        <span className="text-ink">{variant.name}</span>
      </nav>

      <div className="flex items-start gap-3">
        <BrandEmblem brandId={brand.id} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[30px]">{variantTitle(variant)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {facts.map((f, i) => (
              <span key={i} className={cn(i > 0 && "border-l border-line pl-3")}>
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost size-9 p-0"
            aria-pressed={watched}
            aria-label={watched ? "Von Watchlist entfernen" : "Zur Watchlist hinzufügen"}
            title={watched ? "Auf der Watchlist" : "Zur Watchlist"}
            onClick={() => {
              toggleWatch(variant.id);
              toast(watched ? "Von der Watchlist entfernt" : "Zur Watchlist hinzugefügt");
            }}
          >
            <Star className={cn("size-5", watched ? "fill-gold text-gold" : "text-muted")} />
          </button>
          <button className="btn btn-ghost relative size-9 p-0" aria-label="Preisalarm" title="Preisalarm" onClick={() => setAlertOpen(true)}>
            {variantAlerts.length ? <BellRing className="size-5 text-gold" /> : <Bell className="size-5 text-muted" />}
            {variantAlerts.length > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-gold" />}
          </button>
        </div>
      </div>

      <Gallery variant={variant} />
      <AlertModal open={alertOpen} onClose={() => setAlertOpen(false)} variant={variant} />
    </div>
  );
}

function Gallery({ variant }: { variant: Variant }) {
  const [index, setIndex] = useState(0);
  const n = GALLERY.length;
  useEffect(() => setIndex(0), [variant.id]);
  const go = (d: number) => setIndex((i) => (i + d + n) % n);
  const label = variant.name;

  return (
    <div
      className="flex flex-col gap-1.5"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      aria-label="Bildergalerie"
    >
      <div className="group relative aspect-[2/1] overflow-hidden rounded-xl border border-line bg-panel-2">
        <CarArt
          key={`${variant.id}-${index}`}
          className="animate-fade-in size-full"
          shape={variant.shape}
          color={variant.color}
          scene={GALLERY[index].scene}
          view={GALLERY[index].view}
          label={GALLERY[index].view === "badge" ? label : `${variantTitle(variant)} – ${GALLERY[index].caption}`}
        />
        <button onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/90 hover:bg-black/60" aria-label="Vorheriges Bild">
          <ChevronLeft className="size-5" />
        </button>
        <button onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/90 hover:bg-black/60" aria-label="Nächstes Bild">
          <ChevronRight className="size-5" />
        </button>
        <div className="absolute bottom-2 left-3 text-xs text-white/80 drop-shadow">{GALLERY[index].caption}</div>
        <div className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white/90">
          <ImageIcon className="size-3.5" /> {index + 1} / {n}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[0, 1, 2, 3, 4].map((k) => {
          const i = (Math.floor(index / 5) * 5 + k) % n;
          return (
            <button
              key={k}
              onClick={() => setIndex(i)}
              className={cn("aspect-[2/1] overflow-hidden rounded-md border transition-colors", i === index ? "border-gold" : "border-line opacity-75 hover:opacity-100")}
              aria-label={`Bild ${i + 1}: ${GALLERY[i].caption}`}
            >
              <CarArt className="size-full" shape={variant.shape} color={variant.color} scene={GALLERY[i].scene} view={GALLERY[i].view} label={GALLERY[i].view === "badge" ? label : undefined} />
            </button>
          );
        })}
      </div>
    </div>
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
      title={`Preisalarm – ${variantShortTitle(variant)}`}
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
            Alarm speichern
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Aktueller Marktwert (Median): <span className="text-ink">{eur(value)}</span>. Du wirst in der Glocke oben rechts benachrichtigt, sobald der Wert die Schwelle
        erreicht.
      </p>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <label>
          <span className="label">Bedingung</span>
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}>
            <option value="above">steigt über</option>
            <option value="below">fällt unter</option>
          </select>
        </label>
        <label>
          <span className="label">Schwelle (€)</span>
          <input className="input" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
      </div>
      {!valid && threshold && <p className="mt-2 text-xs text-down">Bitte einen gültigen Betrag eingeben.</p>}
      {existing.length > 0 && (
        <div className="mt-5">
          <div className="label">Aktive Alarme</div>
          <ul className="space-y-1.5">
            {existing.map((a) => {
              const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm">
                  <span className="flex-1">
                    {a.direction === "above" ? "über" : "unter"} {eur(a.threshold)}
                  </span>
                  <Pill tone={hit ? "gold" : "neutral"}>{hit ? "ausgelöst" : "aktiv"}</Pill>
                  <button className="text-muted hover:text-down" onClick={() => removeAlert(a.id)} aria-label="Alarm löschen">
                    <Trash2 className="size-4" />
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
