import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { brandById, generationById, genName, modelById, modelName, optionFactor, variantById, variantName, variantShortTitle, variantTitle, yearsLabel } from "../../data/db";
import type { Variant } from "../../data/types";
import { getMetrics } from "../../data/market";
import { marketBasis, MIN_RECORDS } from "../../data/real/model";
import { useStore } from "../../state/store";
import { cn, eur, num, pct } from "../../lib/format";
import { CarArt, GALLERY } from "../CarArt";
import { Delta, Modal, Pill, Money } from "../ui";
import { PhotoCredit } from "../CarImage";
import { isEn, t } from "../../i18n";
import { paintName, tr, photoCaption } from "../../i18n/terms";

/** Product-page top: photograph on the left, a calm summary column on the right. */
export function Hero({ variant, picked }: { variant: Variant; picked: string[] }) {
  const brand = brandById.get(variant.brandId)!;
  const model = modelById.get(variant.modelId)!;
  const gen = generationById.get(variant.generationId)!;

  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-muted" aria-label={t("Brotkrumen", "Breadcrumb")}>
        <Link to={`/modelle?marke=${brand.id}`} className="hover:text-ink">
          {brand.name}
        </Link>
        <span className="text-faint">/</span>
        <Link to={`/modelle?modell=${model.id}`} className="hover:text-ink">
          {modelName(model)}
        </Link>
        {gen.name !== model.name && (
          <>
            <span className="text-faint">/</span>
            <span>{genName(gen)}</span>
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
  const lineage = gen.name !== model.name ? `${brand.name} ${modelName(model)} (${genName(gen)})` : `${brand.name} ${modelName(model)}`;
  const siblings = gen.variantIds.map((id) => variantById.get(id)!);
  const generations = model.generationIds.map((id) => generationById.get(id)!);

  const facts: [string, React.ReactNode][] = [
    [t("Produktion", "Production"), t(`${num(variant.production)} Stück`, `${num(variant.production)} units`)],
    [t("Motor", "Engine"), `${num(variant.liters, 1)} l, ${variant.hp} PS`],
    [t("Neupreis", "Original list price"), `${eur(variant.newPrice)} (${variant.newPriceYear})`],
  ];
  if (variant.launchColor) {
    facts.push([
      t("Farbe der Präsentation", "Launch colour"),
      <span key="c" className="inline-flex items-center gap-2">
        <span className="size-3 rounded-full ring-1 ring-ink/15" style={{ background: variant.launchColor.hex }} />
        {paintName(variant.launchColor.name)}
      </span>,
    ]);
  }

  return (
    <div className="lg:sticky lg:top-[112px] lg:self-start">
      <p className="text-[14px] text-muted">{lineage}</p>
      <h1 className="mt-1 font-display text-[44px] leading-[1.05] sm:text-[52px]">{variantName(variant)}</h1>
      <p className="mt-2 font-serif text-[16px] text-muted italic">{yearsLabel(variant.years)}</p>

      {!variant.measured ? (
        <NoValue variant={variant} />
      ) : (
      <div className="mt-8 border-t border-line pt-6">
        <div className="text-[13px] text-muted">{picked.length ? t("Schätzwert mit Ausstattung", "Estimate with options") : t("Marktwert Deutschland", "Market value, Germany")}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Money value={Math.round((m.value * factor) / 1000) * 1000} className="text-[40px] leading-none" />
          {picked.length ? (
            <span className={cn("text-[14px]", factor >= 1 ? "text-up" : "text-down")}>
              {pct(factor - 1)}{" "}
              <span className="text-muted">
                {t(`durch ${picked.length === 1 ? "1 Option" : `${picked.length} Optionen`}`, `from ${picked.length === 1 ? "1 option" : `${picked.length} options`}`)}
              </span>
            </span>
          ) : (
            <span className="text-[14px]">
              <Delta value={m.change12m} arrow={false} /> <span className="text-muted">{t("in 12 Monaten", "in 12 months")}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] text-faint">
          {picked.length ? `${t("Median ohne Optionen", "Median without options")} ${eur(Math.round(m.value / 1000) * 1000)}. ` : ""}
          <BasisLine variant={variant} />{" · "}
          <button
            onClick={() => document.getElementById("belege")?.scrollIntoView({ behavior: "smooth" })}
            className="text-muted underline decoration-line-2 underline-offset-2 hover:text-ink"
          >
            {t("Belege ansehen", "See the evidence")}
          </button>
          {variant.options.length > 0 && (
            <>
              {" · "}
              <button
                onClick={() => document.getElementById("ausstattung")?.scrollIntoView({ behavior: "smooth" })}
                className="text-muted underline decoration-line-2 underline-offset-2 hover:text-ink"
              >
                {picked.length ? t("Ausstattung ändern", "Change options") : t("Ausstattung wählen", "Choose options")}
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
              toast(watched ? t("Nicht mehr beobachtet", "No longer watched") : t("Wird beobachtet", "Now watching"));
            }}
          >
            {watched ? t("Wird beobachtet", "Watching") : t("Beobachten", "Watch")}
          </button>
          <button className="btn" onClick={() => setAlertOpen(true)}>
            {alertCount ? `${t("Preisalarm", "Price alert")} (${alertCount})` : t("Preisalarm", "Price alert")}
          </button>
        </div>
      </div>
      )}

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
        <Picker label={t("Varianten", "Variants")}>
          {siblings.map((s) => (
            <PickerLink key={s.id} to={`/markt/${s.id}`} active={s.id === variant.id}>
              {variantName(s)}
            </PickerLink>
          ))}
        </Picker>
      )}
      {generations.length > 1 && (
        <Picker label={t("Generationen", "Generations")}>
          {generations.map((g) => (
            <PickerLink key={g.id} to={`/markt/${g.variantIds[0]}`} active={g.id === gen.id}>
              {genName(g)}
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

/**
 * ← / → page through the gallery from anywhere on the page, not only when it has focus. Keys stay with text fields,
 * sliders, menus and open dialogs, and with modifier shortcuts.
 */
function useArrowKeys(go: (d: number) => void, enabled: boolean) {
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || el.closest("input, textarea, select, [role=slider], [role=tablist], [role=listbox], [role=menu], [role=radiogroup]"))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      goRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Horizontal swipe (finger or mouse drag) on the picture: left = next, right = previous. */
function useSwipe(go: (d: number) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent) => (start.current = { x: e.clientX, y: e.clientY }),
    onPointerUp: (e: ReactPointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
    },
  };
}

/** Slide the new picture in from the side it came from. */
const slideIn = (dir: number) => (dir > 0 ? "gallery-in-next" : dir < 0 ? "gallery-in-prev" : "animate-fade-in");

const arrowBtn =
  "absolute top-1/2 -translate-y-1/2 rounded-full bg-bg/85 p-2 text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100";

function Gallery({ variant }: { variant: Variant }) {
  const [{ index, dir }, setState] = useState({ index: 0, dir: 0 });
  useEffect(() => setState({ index: 0, dir: 0 }), [variant.id]);
  const photos = variant.marketPhotos;
  const n = photos.length;
  const go = (d: number) => setState((s) => ({ index: (s.index + d + n) % n, dir: d }));
  const show = (i: number) => setState((s) => ({ index: i, dir: Math.sign(i - s.index) }));
  useArrowKeys(go, n > 1);
  const swipe = useSwipe(go);
  // Warm the cache for the neighbours so paging never waits on the network.
  useEffect(() => {
    if (n < 2) return;
    for (const d of [1, -1]) new Image().src = photos[(index + d + n) % n].file;
  }, [index, n, photos]);
  const photo = photos[index];
  return (
    <figure aria-label={t("Bildergalerie", "Image gallery")} aria-roledescription={t("Galerie, mit Pfeiltasten blättern", "Gallery, use the arrow keys to browse")} className="min-w-0">
      <div className={cn("group relative aspect-video touch-pan-y overflow-hidden select-none", photo.contain ? "bg-white" : "bg-panel-3")} {...(n > 1 ? swipe : {})}>
        <img
          key={photo.file}
          src={photo.file}
          alt={photoCaption(photo.caption) ?? variantTitle(variant)}
          draggable={false}
          style={photo.position ? { objectPosition: photo.position } : undefined}
          className={cn(slideIn(dir), "size-full", photo.contain ? "object-contain" : "object-cover")}
        />
        {photo.premiere && <span className="absolute top-4 left-4 rounded-full bg-bg/90 px-3 py-1 text-[12.5px] text-ink">{t("Vorstellung", "Launch")}</span>}
        {n > 1 && (
          <>
            <button onClick={() => go(-1)} className={cn(arrowBtn, "left-4")} aria-label={t("Vorheriges Bild", "Previous image")}>
              <ChevronLeft className="size-5" strokeWidth={1.5} />
            </button>
            <button onClick={() => go(1)} className={cn(arrowBtn, "right-4")} aria-label={t("Nächstes Bild", "Next image")}>
              <ChevronRight className="size-5" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-6">
        <figcaption className="min-w-0">
          <div className="font-serif text-[14.5px] text-ink/85 italic">{photoCaption(photo.caption) ?? variantTitle(variant)}</div>
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
              onClick={() => show(i)}
              className={cn("aspect-video w-24 overflow-hidden border-b-2 pb-1 transition-opacity", i === index ? "border-ink" : "border-transparent opacity-60 hover:opacity-100")}
              aria-label={`${t("Bild", "Image")} ${i + 1}`}
              aria-current={i === index}
            >
              <img
                src={p.file}
                alt=""
                loading="lazy"
                style={p.position ? { objectPosition: p.position } : undefined}
                className={cn("size-full", p.contain ? "bg-white object-contain" : "object-cover")}
              />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

function IllustratedGallery({ variant }: { variant: Variant }) {
  const [{ index, dir }, setState] = useState({ index: 0, dir: 0 });
  const n = GALLERY.length;
  useEffect(() => setState({ index: 0, dir: 0 }), [variant.id]);
  const go = (d: number) => setState((s) => ({ index: (s.index + d + n) % n, dir: d }));
  useArrowKeys(go, true);
  const swipe = useSwipe(go);

  return (
    <figure aria-label={t("Bildergalerie", "Image gallery")} aria-roledescription={t("Galerie, mit Pfeiltasten blättern", "Gallery, use the arrow keys to browse")} className="min-w-0">
      <div className="group relative aspect-video touch-pan-y overflow-hidden bg-panel-3 select-none" {...swipe}>
        <CarArt
          key={`${variant.id}-${index}`}
          className={cn(slideIn(dir), "size-full")}
          shape={variant.shape}
          color={variant.color}
          scene={GALLERY[index].scene}
          view={GALLERY[index].view}
          label={GALLERY[index].view === "badge" ? variantName(variant) : `${variantTitle(variant)} – ${GALLERY[index].caption}`}
        />
        <button onClick={() => go(-1)} className={cn(arrowBtn, "left-4")} aria-label={t("Vorheriges Bild", "Previous image")}>
          <ChevronLeft className="size-5" strokeWidth={1.5} />
        </button>
        <button onClick={() => go(1)} className={cn(arrowBtn, "right-4")} aria-label={t("Nächstes Bild", "Next image")}>
          <ChevronRight className="size-5" strokeWidth={1.5} />
        </button>
      </div>
      <figcaption className="mt-4 flex justify-between gap-6">
        <span className="font-serif text-[14.5px] text-ink/85 italic">
          {GALLERY[index].caption}. {t("Illustration, kein offizielles Herstellerfoto verfügbar.", "Illustration, no official manufacturer photo available.")}
        </span>
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
  const label = l.kind === "premiere" ? t("Offizielle Pressebilder der Vorstellung", "Official press photos of the launch") : t("Offizielle Bilder beim Hersteller", "Official photos from the manufacturer");
  return (
    <p className="mt-6 border-t border-line pt-4 text-[14px]">
      <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 hover:text-gold" title={tr(l.title)}>
        {label}
        <ArrowUpRight className="size-3.5 self-center text-faint" strokeWidth={1.5} />
      </a>
      <span className="block text-[13px] text-muted">
        {source}
        {l.event && `, ${t("Vorstellung", "presented at")}: ${tr(l.event)}`}
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
  const parsed = Number(isEn() ? threshold.replace(/[,\s]/g, "") : threshold.replace(/[.\s]/g, "").replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`Preisalarm für ${variantShortTitle(variant)}`, `Price alert for ${variantShortTitle(variant)}`)}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Schließen", "Close")}
          </button>
          <button
            className="btn btn-gold"
            disabled={!valid}
            onClick={() => {
              addAlert({ variantId: variant.id, direction, threshold: parsed });
              toast(t(`Alarm gesetzt: ${direction === "above" ? "über" : "unter"} ${eur(parsed)}`, `Alert set: ${direction === "above" ? "above" : "below"} ${eur(parsed)}`));
              onClose();
            }}
          >
            {t("Alarm setzen", "Set alert")}
          </button>
        </>
      }
    >
      <p className="mb-4 text-[14px] text-muted">
        {t(
          <>
            Der Marktwert liegt aktuell bei <span className="text-ink">{eur(value)}</span>. Sobald er die Schwelle erreicht, erscheint eine Benachrichtigung unter der Glocke.
          </>,
          <>
            The market value is currently <span className="text-ink">{eur(value)}</span>. Once it reaches the threshold, a notification appears under the bell.
          </>,
        )}
      </p>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <label>
          <span className="label">{t("Wenn der Wert", "When the value")}</span>
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}>
            <option value="above">{t("steigt über", "rises above")}</option>
            <option value="below">{t("fällt unter", "falls below")}</option>
          </select>
        </label>
        <label>
          <span className="label">{t("Schwelle in €", "Threshold in €")}</span>
          <input className="input" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
      </div>
      {!valid && threshold && <p className="mt-2 text-[13px] text-down">{t("Bitte einen Betrag in Euro eingeben, zum Beispiel 250000.", "Please enter an amount in euros, for example 250000.")}</p>}
      {existing.length > 0 && (
        <div className="mt-6">
          <div className="label">{t("Aktive Alarme", "Active alerts")}</div>
          <ul className="border-t border-line">
            {existing.map((a) => {
              const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
              return (
                <li key={a.id} className="flex items-center gap-3 border-b border-line py-2 text-[14px]">
                  <span className="flex-1">
                    {a.direction === "above" ? t("über", "above") : t("unter", "below")} {eur(a.threshold)}
                  </span>
                  <Pill tone={hit ? "gold" : "neutral"}>{hit ? t("ausgelöst", "triggered") : t("aktiv", "active")}</Pill>
                  <button className="text-muted hover:text-down" onClick={() => removeAlert(a.id)} aria-label={t("Alarm löschen", "Delete alert")}>
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

function BasisLine({ variant }: { variant: Variant }) {
  const b = marketBasis(variant.id);
  if (!b) return null;
  const c = b.channels;
  const parts = [
    c.EU_AUC && t(`${num(c.EU_AUC)} ${c.EU_AUC === 1 ? "Auktionsergebnis" : "Auktionsergebnissen"} in Europa`, `${num(c.EU_AUC)} European auction ${c.EU_AUC === 1 ? "result" : "results"}`),
    c.EU_ASK && t(`${num(c.EU_ASK)} ${c.EU_ASK === 1 ? "Angebot" : "Angeboten"} in Europa`, `${num(c.EU_ASK)} ${c.EU_ASK === 1 ? "listing" : "listings"} in Europe`),
    c.US_AUC && t(`${num(c.US_AUC)} US-${c.US_AUC === 1 ? "Auktion" : "Auktionen"} (bereinigt)`, `${num(c.US_AUC)} US ${c.US_AUC === 1 ? "auction" : "auctions"} (adjusted)`),
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${t("und", "and")} ${parts.at(-1)}` : parts[0];
  return (
    <>
      {t(`Aus ${list}`, `From ${list}`)}
      {b.lo &&
        b.hi &&
        ` · ${t("mittlere Hälfte", "middle half")} ${eur(Math.round(b.lo / 1000) * 1000, { compact: true })} ${t("bis", "to")} ${eur(Math.round(b.hi / 1000) * 1000, { compact: true })}`}
    </>
  );
}

/** Too few records for a market value: say so and point to the individual records instead of showing a number. */
function NoValue({ variant }: { variant: Variant }) {
  const n = marketBasis(variant.id)?.n ?? 0;
  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="text-[13px] text-muted">{t("Marktwert Deutschland", "Market value, Germany")}</div>
      <div className="mt-1 font-serif text-[28px] leading-tight">{t("Keine belastbare Datenbasis", "Not enough data")}</div>
      <p className="mt-2 text-[13px] text-faint">
        {n === 0
          ? t(
              `${variant.years[0] >= 2015 ? "Bisher" : "Seit 2015"} ist kein Verkauf und kein Angebot dieser Variante mit Preis belegt.`,
              `No priced sale or listing of this variant is on record${variant.years[0] >= 2015 ? " yet" : " since 2015"}.`,
            )
          : t(
              `Nur ${num(n)} ${n === 1 ? "Beleg" : "Belege"}${variant.years[0] >= 2015 ? "" : " seit 2015"}, für einen Marktwert braucht es mindestens ${MIN_RECORDS}. Die Einzelbelege stehen unten.`,
              `Only ${num(n)} ${n === 1 ? "record" : "records"}${variant.years[0] >= 2015 ? "" : " since 2015"}; a market value needs at least ${MIN_RECORDS}. The individual records are listed below.`,
            )}
      </p>
    </div>
  );
}
