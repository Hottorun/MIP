import type { Variant } from "../data/types";
import type { Photo } from "../data/real";
import { cn } from "../lib/format";
import { CarArt, type Scene } from "./CarArt";

/**
 * Preview image: the official manufacturer photo (as in the market tab) first, then a Wikimedia Commons photo,
 * otherwise the illustrated fallback in the variant's launch color. `photo` shows one specific picture instead.
 */
export function CarImage({
  variant,
  index = 0,
  className,
  scene = "studio",
  fallbackColor,
  credit = false,
  label,
  eager = false,
  photo: picked,
}: {
  variant: Variant;
  index?: number;
  className?: string;
  scene?: Scene;
  fallbackColor?: string;
  credit?: boolean;
  label?: string;
  /** Load immediately (above-the-fold images). */
  eager?: boolean;
  photo?: Photo;
}) {
  const photos = variant.marketPhotos.length ? variant.marketPhotos : variant.photos;
  const photo = picked ?? photos[index] ?? photos[0];
  if (!photo) {
    return <CarArt shape={variant.shape} color={fallbackColor ?? variant.color} scene={scene} className={className} label={label} />;
  }
  // Press photos are 16:9 like the frames; other photos (Wikimedia, other formats) are letterboxed so the car is never cut off.
  const pressPhoto = variant.marketPhotos.includes(photo);
  return (
    <div className={cn("relative overflow-hidden bg-panel-3", className)}>
      <img
        src={photo.file}
        alt={photo.caption ?? label ?? ""}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={photo.position ? { objectPosition: photo.position } : undefined}
        className={cn("size-full", pressPhoto ? "object-cover" : "object-contain")}
      />
      {credit && <PhotoCredit photo={photo} className="absolute right-1.5 bottom-1 left-1.5 text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />}
    </div>
  );
}

export function PhotoCredit({ photo, className }: { photo: Photo; className?: string }) {
  return (
    <div className={cn("truncate", className)}>
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
