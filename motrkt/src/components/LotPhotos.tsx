import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, safeUrl } from "../lib/format";
import { isLotPage } from "../lib/lotPages";
import { t } from "../i18n";

/**
 * Photos of the exact car of an auction result, from its lot page at the auction house (server/lotPhotos.ts). The
 * images stay at the house and are shown with its name and a link to the lot page; where the house gives none (or
 * the page is a search or result list), the link to the auction page stands in for them.
 */

const cache = new Map<string, Promise<string[]>>();

function loadPhotos(url: string): Promise<string[]> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(`/api/losfotos?url=${encodeURIComponent(url)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((d: { photos?: unknown }) => (Array.isArray(d.photos) ? d.photos.filter((x): x is string => typeof x === "string" && x.startsWith("https://")) : []))
      .catch(() => []);
    p.then((photos) => {
      // failed lookups are tried again next time
      if (!photos.length) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

function usePhotos(url: string | undefined, enabled = true) {
  const [state, setState] = useState<{ url?: string; photos: string[] | null }>({ photos: null });
  useEffect(() => {
    if (!url || !enabled) return;
    let alive = true;
    loadPhotos(url).then((photos) => alive && setState({ url, photos }));
    return () => {
      alive = false;
    };
  }, [url, enabled]);
  return state.url === url ? state.photos : null;
}

/** Gallery for the result detail: large photo, thumbnails, source line; the lot page link when there are no photos. */
export function LotGallery({ url, house, image }: { url?: string; house: string; image?: string }) {
  const lot = !!url && isLotPage(url);
  const loaded = usePhotos(lot ? url : undefined);
  // the photo from our data stands in while the lot page is read, and where it gives none
  const photos = loaded?.length ? loaded : image ? [image] : loaded;
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  useEffect(() => setIndex(0), [url]);
  if (!url) return null;
  const href = safeUrl(url);
  const shown = (photos ?? []).filter((p) => !broken.has(p));
  const own = !!image && shown.length > 0;
  const link = (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:text-gold">
      {t("Zur Auktionsseite", "Open the auction page")}
      <ArrowUpRight className="size-3.5 text-faint" strokeWidth={1.5} />
    </a>
  );

  if (lot && photos === null) return <div className="mb-5 aspect-[4/3] w-full animate-pulse rounded-[3px] bg-line/40" aria-label={t("Fotos werden geladen", "Loading photos")} />;
  if ((!lot && !own) || !shown.length)
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-line px-4 py-3 text-[13px] text-muted">
        <span>
          {lot
            ? t(`Fotos dieses Fahrzeugs gibt es auf der Seite von ${house}.`, `Photos of this car are on the ${house} page.`)
            : t(`Für diesen Verkauf haben wir keinen Link zum einzelnen Los, nur zu den Ergebnissen von ${house}.`, `For this sale we have no link to the single lot, only to ${house}'s results.`)}
        </span>
        {link}
      </div>
    );
  const i = Math.min(index, shown.length - 1);
  const go = (d: number) => setIndex((i + d + shown.length) % shown.length);
  const drop = (p: string) => setBroken((b) => new Set(b).add(p));
  return (
    <figure className="mb-5">
      <div className="relative overflow-hidden rounded-[3px] bg-line/30">
        <img
          key={shown[i]}
          src={shown[i]}
          alt={t(`Foto ${i + 1} von ${shown.length}, ${house}`, `Photo ${i + 1} of ${shown.length}, ${house}`)}
          referrerPolicy="no-referrer"
          className="aspect-[4/3] w-full object-cover"
          onError={() => drop(shown[i])}
        />
        {shown.length > 1 && (
          <>
            <button className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/65" onClick={() => go(-1)} aria-label={t("Vorheriges Foto", "Previous photo")}>
              <ChevronLeft className="size-4" />
            </button>
            <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/65" onClick={() => go(1)} aria-label={t("Nächstes Foto", "Next photo")}>
              <ChevronRight className="size-4" />
            </button>
            <span className="absolute right-2 bottom-2 rounded-[2px] bg-black/50 px-1.5 py-0.5 text-[11px] text-white tabular-nums">
              {i + 1} / {shown.length}
            </span>
          </>
        )}
      </div>
      {shown.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {shown.map((p, k) => (
            <button key={p} onClick={() => setIndex(k)} className={cn("shrink-0 overflow-hidden rounded-[2px] border", k === i ? "border-gold" : "border-transparent opacity-70 hover:opacity-100")} aria-label={t(`Foto ${k + 1}`, `Photo ${k + 1}`)}>
              <img src={p} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-16 object-cover" onError={() => drop(p)} />
            </button>
          ))}
        </div>
      )}
      <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-faint">
        <span>{t(`Fotos: ${house}`, `Photos: ${house}`)}</span>
        {link}
      </figcaption>
    </figure>
  );
}

/** Small photo for a result row, loaded once the row scrolls into view; links to the lot page. Nothing without photos. */
export function LotThumb({ url, house, image, small = false, link = true }: { url?: string; house: string; image?: string; small?: boolean; link?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setInView(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  // a photo from our data needs no lookup of the lot page
  const fetched = usePhotos(image ? undefined : url, inView);
  const photos = image ? [image] : fetched;
  const [broken, setBroken] = useState(false);
  const photo = photos?.[0];
  if (!url || (!image && !isLotPage(url)) || (photos !== null && (!photo || broken)))
    // in the results table an empty slot of the same width keeps the car names in line
    return small ? <span className="block h-9 w-12 shrink-0" aria-hidden /> : null;
  return (
    <span ref={ref} className={cn("block shrink-0 overflow-hidden rounded-[2px] bg-line/30", small ? "h-9 w-12" : "h-14 w-20 sm:h-16 sm:w-24")}>
      {photo &&
        !broken &&
        (link ? (
          <a href={safeUrl(url)} target="_blank" rel="noreferrer" className="block size-full" title={t(`Foto: ${house}`, `Photo: ${house}`)}>
            <img src={photo} alt={t(`Foto des Fahrzeugs, ${house}`, `Photo of the car, ${house}`)} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setBroken(true)} />
          </a>
        ) : (
          <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setBroken(true)} />
        ))}
    </span>
  );
}
