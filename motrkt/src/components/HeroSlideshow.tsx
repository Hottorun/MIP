import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Pause, Play } from "lucide-react";
import { productionLabel, variantById, variantTitle, yearsLabel } from "../data/db";
import { getMetrics } from "../data/market";
import type { Photo } from "../data/real";
import type { Variant } from "../data/types";
import { cn, num } from "../lib/format";
import { Delta, Money } from "./ui";
import { PhotoCredit } from "./CarImage";
import { t } from "../i18n";
import { photoCaption } from "../i18n/terms";

/**
 * Front page stage: one car per era, full width. Photos slowly zoom (alternating direction) and
 * change on their own, also while the pointer is over them; the era bar below shows progress and jumps to a car on click. Arrow keys and swipes work too.
 * `photo` is the index into the variant's press photos, `year` the label on the era bar.
 */
const SLIDES = [
  { variantId: "porsche-356-356-speedster", photo: 0, year: 1954 },
  { variantId: "porsche-912-912-coupe", photo: 1, year: 1965 },
  {
    variantId: "porsche-rennsportwagen-904-bis-917-917-k",
    photo: 0,
    year: 1969,
  },
  { variantId: "porsche-930-turbo-3-0", photo: 1, year: 1975 },
  { variantId: "porsche-911-964-carrera-rs", photo: 1, year: 1991 },
  { variantId: "porsche-911-993-turbo-s", photo: 2, year: 1997 },
  { variantId: "porsche-carrera-gt-carrera-gt", photo: 0, year: 2004 },
  { variantId: "porsche-911-992-1-s-t", photo: 1, year: 2023 },
];
const INTERVAL_MS = 7000;

type Slide = { v: Variant; photo: Photo; year: number };

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function HeroSlideshow({ children }: { children?: React.ReactNode }) {
  const slides = useMemo<Slide[]>(
    () =>
      SLIDES.flatMap((s) => {
        const v = variantById.get(s.variantId);
        const photos = v
          ? v.marketPhotos.length
            ? v.marketPhotos
            : v.photos
          : [];
        const photo = photos[s.photo] ?? photos[0];
        return v && photo ? [{ v, photo, year: s.year }] : [];
      }),
    [],
  );
  const n = slides.length;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const paused = stopped || reduced;
  const stage = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const go = (i: number) => {
    const next = ((i % n) + n) % n;
    if (next === index) return;
    setIndex(next);
  };
  const current = slides[index];
  const metrics = current ? getMetrics(current.v.id) : null;
  const value = metrics?.value ?? 0;

  // Preload the next photo so the crossfade never shows an empty frame.
  useEffect(() => {
    const next = slides[(index + 1) % n];
    if (next) new Image().src = next.photo.file;
  }, [index, n, slides]);

  if (!current || !metrics) return null;

  return (
    <section
      aria-roledescription={t("Diashow", "Slideshow")}
      aria-label={t("Ausgewählte Fahrzeuge", "Featured cars")}
      className="hero-bleed relative -mt-8 overflow-clip bg-[#141414] text-[#f7f6f2] lg:-mt-12"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
        else return;
        e.preventDefault();
      }}
    >
      <div
        ref={stage}
        className="relative sm:h-[min(86vh,820px)] sm:min-h-[560px]"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y))
            go(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="relative h-[52vh] min-h-[280px] overflow-clip sm:absolute sm:inset-0 sm:h-auto">
          {slides.map((s, i) => (
            <div
              key={s.photo.file}
              aria-hidden={i !== index}
              className={cn(
                "absolute inset-0 transition-opacity duration-[900ms] ease-in-out",
                i === index ? "z-[1] opacity-100" : "z-0 opacity-0",
              )}
            >
              <div className="absolute inset-0">
                <img
                  src={s.photo.file}
                  alt={
                    i === index ? (photoCaption(s.photo.caption) ?? variantTitle(s.v)) : ""
                  }
                  loading={i < 2 ? "eager" : "lazy"}
                  decoding="async"
                  style={
                    s.photo.position
                      ? { objectPosition: s.photo.position }
                      : undefined
                  }
                  className="size-full object-cover"
                />
              </div>
            </div>
          ))}

          {/* Legibility: dark from the left and from the bottom, photo stays clear on the right. */}
          <div className="pointer-events-none absolute inset-0 z-[2] hidden bg-[linear-gradient(90deg,rgba(16,16,16,0.78)_0%,rgba(16,16,16,0.5)_38%,rgba(16,16,16,0)_70%)] sm:block" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-2/3 bg-[linear-gradient(0deg,#141414_0%,rgba(20,20,20,0.35)_45%,rgba(20,20,20,0)_100%)] sm:bg-[linear-gradient(0deg,rgba(16,16,16,0.88)_0%,rgba(16,16,16,0.32)_45%,rgba(16,16,16,0)_100%)]" />
          <PhotoCredit
            photo={current.photo}
            className="absolute top-3 right-4 z-[3] max-w-[70%] text-right text-[10.5px] text-white/55 sm:top-auto sm:right-8 sm:bottom-[118px] sm:max-w-[50%]"
          />
        </div>

        <div className="relative z-[3] mx-auto -mt-20 flex max-w-[1360px] flex-col px-5 pb-6 sm:mt-0 sm:h-full sm:justify-end sm:px-8 sm:pb-40">
          <div className="max-w-xl">
            <h1 className="font-display text-[40px] leading-[1.04] sm:text-[60px]">
              {t("Was klassische Sportwagen heute wert sind.", "What classic sports cars are worth today.")}
            </h1>
            {children}
          </div>

          <div
            key={current.v.id}
            className="mt-10 grid max-w-xl gap-x-10 gap-y-4 border-t border-white/20 pt-5 sm:grid-cols-[minmax(0,1fr)_auto]"
            aria-live="polite"
          >
            <div className="min-w-0">
              <div className="text-[13px] text-white/65">
                {yearsLabel(current.v.years)}
              </div>
              <Link
                to={`/markt/${current.v.id}`}
                className="group mt-0.5 inline-flex items-center gap-2 font-serif text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]"
              >
                <span className="truncate underline-offset-4 group-hover:underline">
                  {variantTitle(current.v)}
                </span>
                <ArrowRight
                  className="size-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={1.4}
                />
              </Link>
              <div className="mt-1 text-[13px] text-white/60">
                {num(current.v.hp)} PS ·{" "}
                {current.v.production
                  ? productionLabel(current.v, "gebaut", "built")
                  : t("Stückzahl unbekannt", "Production unknown")}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[13px] text-white/65">
                {t("Marktwert heute", "Market value today")}
              </div>
              <Money
                value={value}
                compact
                className="mt-1 block text-[30px] leading-tight sm:text-[34px]"
              />
              <div className="mt-0.5 text-[13px]">
                <Delta value={metrics.change12m} className="hero-delta" />{" "}
                <span className="text-white/60">{t("in 12 Monaten", "in 12 months")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Era bar: progress of the running slide, click to jump. */}
        <div className="relative z-[3] sm:absolute sm:inset-x-0 sm:bottom-0">
          <div className="mx-auto flex max-w-[1360px] items-end gap-4 px-5 pb-7 sm:px-8">
            <ol
              className="grid min-w-0 flex-1 gap-2 sm:gap-3"
              style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {slides.map((s, i) => (
                <li key={s.v.id}>
                  <button
                    onClick={() => go(i)}
                    className={cn(
                      "group block w-full text-left transition-opacity",
                      i === index
                        ? "opacity-100"
                        : "opacity-55 hover:opacity-90",
                    )}
                    aria-label={t(`${variantTitle(s.v)} zeigen`, `Show ${variantTitle(s.v)}`)}
                    aria-current={i === index}
                  >
                    <span className="relative block h-[2px] overflow-hidden bg-white/25">
                      {i < index && (
                        <span className="absolute inset-0 bg-white/70" />
                      )}
                      {i === index && (
                        <span
                          key={`p-${index}`}
                          className={cn(
                            "absolute inset-0 origin-left bg-white",
                            reduced ? "" : "hero-progress",
                          )}
                          style={{
                            animationDuration: `${INTERVAL_MS}ms`,
                            animationPlayState: paused ? "paused" : "running",
                          }}
                          onAnimationEnd={() => !reduced && go(index + 1)}
                        />
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-2.5 block font-serif text-[15px] tabular-nums sm:text-[18px]",
                        i !== index && "max-sm:invisible",
                      )}
                    >
                      {s.year}
                    </span>
                    <span className="hidden truncate text-[12px] text-white/65 md:block">
                      {variantTitle(s.v, { brand: false })}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {!reduced && (
              <button
                onClick={() => setStopped((v) => !v)}
                className="mb-1 grid size-9 shrink-0 place-items-center rounded-full border border-white/30 text-white/80 transition-colors hover:border-white/70 hover:text-white"
                aria-label={stopped ? t("Diashow fortsetzen", "Resume slideshow") : t("Diashow anhalten", "Pause slideshow")}
              >
                {stopped ? (
                  <Play className="size-3.5" strokeWidth={1.8} />
                ) : (
                  <Pause className="size-3.5" strokeWidth={1.8} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
