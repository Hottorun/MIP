import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "../lib/format";
import { t } from "../i18n";

/**
 * Photo of a listed car, as the seller publishes it (loaded from the seller's site). Without a photo, or when it no
 * longer loads (listing taken down), a plain "no photo" area: never a model photo or a drawing standing in for the car.
 */
export function ListingPhoto({ src, alt, className, small }: { src?: string; alt: string; className?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <NoPhoto className={className} small={small} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("bg-panel-3 object-cover", className)}
    />
  );
}

export function NoPhoto({ className, small }: { className?: string; small?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center bg-panel-3 text-faint", className)}>
      <span className="flex flex-col items-center gap-1.5 text-[12px]">
        <ImageOff className={small ? "size-4" : "size-5"} strokeWidth={1.5} />
        {!small && t("Kein Foto", "No photo")}
      </span>
    </div>
  );
}
