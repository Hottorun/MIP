import { Link } from "react-router-dom";
import { variantTitle } from "../../data/db";
import type { Variant } from "../../data/types";
import { getListings } from "../../data/generate";
import { useLiveListings } from "../../state/liveListings";
import { km } from "../../lib/format";
import { CarImage } from "../CarImage";
import { Section, Money } from "../ui";

export function Listings({ variant }: { variant: Variant }) {
  const live = useLiveListings();
  const liveForVariant = live.listings.filter((l) => l.variantId === variant.id);
  const listings = liveForVariant.length ? liveForVariant : getListings(variant.id);
  if (listings.length === 0) return null;
  return (
    <Section
      title="Aktuell angeboten"
      sub={liveForVariant.length ? "Live von mobile.de" : undefined}
      actions={
        <Link to={`/kaufen?variant=${variant.id}`} className="link text-[14px]">
          Alle {listings.length} Angebote
        </Link>
      }
    >
      <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-3">
        {listings.slice(0, 3).map((l, i) => (
          <li key={l.id}>
            <Link to={`/kaufen?inserat=${l.id}`} className="group block">
              <div className="aspect-video overflow-hidden bg-panel-3">
                {l.images?.[0] ? (
                  <img src={l.images[0]} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                ) : (
                  <CarImage
                    className="size-full transition-transform duration-500 group-hover:scale-[1.02]"
                    variant={variant}
                    index={i}
                    fallbackColor={l.colorHex}
                    scene={(["studio", "mountain", "city"] as const)[i % 3]}
                  />
                )}
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4">
                <span className="truncate font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                  {variantTitle(variant, { brand: false })}
                </span>
                <Money value={l.price} className="shrink-0 text-[16px]" />
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                {l.year}, {km(l.mileage)}, {l.city}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
