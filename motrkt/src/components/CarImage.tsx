import type { Variant } from "../data/types";
import type { Photo } from "../data/real";
import { cn } from "../lib/format";
import { CarArt, type Scene } from "./CarArt";
import { t } from "../i18n";
import { photoCaption, tr } from "../i18n/terms";

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
  // Landscape photos (3:2, 4:3, 16:9 …) fill the frame and lose only a strip of sky or road at the top and bottom,
  // instead of showing side bars. Only unusual formats (portrait, square, panorama) sit whole on a blurred copy.
  const fills = photo.ratio != null && fillsFrame(photo.ratio, 16 / 9);
  return (
    <div className={cn("relative overflow-hidden bg-panel-3", className)}>
      {!fills && <img src={photo.file} alt="" aria-hidden="true" loading={eager ? "eager" : "lazy"} decoding="async" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl" />}
      <img
        src={photo.file}
        alt={photoCaption(photo.caption) ?? label ?? ""}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={cn("relative size-full", fills ? "object-cover" : "object-contain")}
      />
      {credit && <PhotoCredit photo={photo} className="absolute right-1.5 bottom-1 left-1.5 text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />}
    </div>
  );
}

/**
 * Whether a photo may be cropped to fill a frame: it keeps at least 74 % of its height (4:3 in 16:9) and at least
 * 84 % of its width (16:9 in 3:2), so the car stays whole and only background is trimmed.
 */
export function fillsFrame(photoRatio: number, frameRatio: number): boolean {
  const keep = photoRatio < frameRatio ? photoRatio / frameRatio : frameRatio / photoRatio;
  return photoRatio < frameRatio ? keep >= 0.74 : keep >= 0.84;
}

/** Gallery frame for a variant's photos: the first photo's own format (launch.json keeps one format per variant). */
export function frameRatio(photos: Photo[]): number {
  return photos[0]?.ratio ?? 16 / 9;
}

export function PhotoCredit({ photo, className }: { photo: Photo; className?: string }) {
  return (
    <div className={cn("truncate", className)}>
      {t("Foto", "Photo")}:{" "}
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
              {tr(photo.license)}
            </a>
          ) : (
            tr(photo.license)
          )}
        </>
      )}
      {photo.exact === false && t(" · ähnliches Modell", " · similar model")}
    </div>
  );
}
