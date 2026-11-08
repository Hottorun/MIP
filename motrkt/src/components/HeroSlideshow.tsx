import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { variantById, variantTitle, yearsLabel } from "../data/db";
import { cn } from "../lib/format";

/** Hand-picked opening photographs: one per era, varied paint. `photo` is the index into the variant's photos. */
const SLIDES = [
  { variantId: "porsche-356-356-speedster", photo: 1 },
  { variantId: "ferrari-f40-f40", photo: 1 },
  { variantId: "porsche-930-turbo-3-0", photo: 0 },
  { variantId: "ferrari-testarossa-testarossa", photo: 2 },
  { variantId: "porsche-912-912-coupe", photo: 2 },
  { variantId: "porsche-911-993-carrera-rs", photo: 0 },
  { variantId: "porsche-959-959-komfort", photo: 1 },
];
const INTERVAL_MS = 6000;

export function HeroSlideshow() {
  const slides = SLIDES.flatMap((s) => {
    const v = variantById.get(s.variantId);
    const photo = v?.photos[s.photo] ?? v?.photos[0];
    return v && photo ? [{ v, photo }] : [];
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;

  useEffect(() => {
    if (paused || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused, n, index]);

  if (n === 0) return null;
  const current = slides[index];

  return (
    <figure
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="Diashow"
      aria-label="Ausgewählte Fahrzeuge"
    >
      <Link to={`/markt/${current.v.id}`} className="relative block aspect-[3/2] overflow-hidden bg-panel-3" aria-label={variantTitle(current.v)}>
        {slides.map((s, i) => (
          <img
            key={s.photo.file}
            src={s.photo.file}
            alt={i === index ? (s.photo.caption ?? variantTitle(s.v)) : ""}
            aria-hidden={i !== index}
            loading={i < 2 ? "eager" : "lazy"}
            decoding="async"
            className={cn("absolute inset-0 size-full object-cover transition-opacity duration-[1400ms] ease-in-out", i === index ? "opacity-100" : "opacity-0")}
          />
        ))}
      </Link>
      <div className="mt-3 flex items-center justify-between gap-6">
        <figcaption className="min-w-0 truncate font-serif text-[14px] text-muted italic" aria-live="polite">
          {variantTitle(current.v)}, {yearsLabel(current.v.years)}
        </figcaption>
        <div className="flex shrink-0 items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.v.id}
              onClick={() => setIndex(i)}
              className="py-2"
              aria-label={`${variantTitle(s.v)} zeigen`}
              aria-current={i === index}
            >
              <span className={cn("block h-px transition-all duration-500", i === index ? "w-8 bg-ink" : "w-4 bg-line-2 hover:bg-muted")} />
            </button>
          ))}
        </div>
      </div>
    </figure>
  );
}
