import type { Variant } from "../data/types";
import type { Photo } from "../data/real";
import { cn } from "../lib/format";
import { CarArt, type Scene } from "./CarArt";

/** Real photo (Wikimedia Commons) when available, otherwise the illustrated fallback in the variant's launch color. */
export function CarImage({
  variant,
  index = 0,
  className,
  scene = "studio",
  fallbackColor,
  credit = false,
  label,
}: {
  variant: Variant;
  index?: number;
  className?: string;
  scene?: Scene;
  fallbackColor?: string;
  credit?: boolean;
  label?: string;
}) {
  const photo = variant.photos[index] ?? variant.photos[0];
  if (!photo) {
    return <CarArt shape={variant.shape} color={fallbackColor ?? variant.color} scene={scene} className={className} label={label} />;
  }
  return (
    <div className={cn("relative overflow-hidden bg-panel-3", className)}>
      <img src={photo.file} alt={photo.caption ?? label ?? ""} loading="lazy" decoding="async" className="size-full object-cover" />
      {credit && <PhotoCredit photo={photo} className="absolute right-1.5 bottom-1 left-1.5" />}
    </div>
  );
}

export function PhotoCredit({ photo, className }: { photo: Photo; className?: string }) {
  return (
    <div className={cn("truncate text-[10px] text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]", className)}>
      Foto:{" "}
      {photo.page ? (
        <a href={photo.page} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
          {photo.author || "Wikimedia Commons"}
        </a>
      ) : (
        photo.author || "Wikimedia Commons"
      )}
      {photo.license && (
        <>
          {" · "}
          {photo.licenseUrl ? (
            <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {photo.license}
            </a>
          ) : (
            photo.license
          )}
        </>
      )}
      {photo.exact === false && " · ähnliches Modell"}
    </div>
  );
}
