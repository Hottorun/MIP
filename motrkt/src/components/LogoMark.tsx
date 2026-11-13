import { t } from "../i18n";

// Carbay logo (public/brand/): the script wordmark (Italianno, outlined paths) and the square mark with its C, for
// small places such as the favicon and the loading state.
const WORDMARK_RATIO = 408.6 / 195.4;

export function LogoWordmark({ height = 44, light = false, className }: { height?: number; light?: boolean; className?: string }) {
  return (
    <img
      src={light ? "/brand/carbay-wordmark-light.svg" : "/brand/carbay-wordmark.svg"}
      alt="Carbay"
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      className={className}
    />
  );
}

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return <img src="/brand/carbay-mark.svg" alt="" width={size} height={size} className={className} aria-hidden="true" />;
}

// Full logo: wordmark with the tagline underneath, for places with enough room.
export function LogoFull({ height = 56, className }: { height?: number; className?: string }) {
  return (
    <div className={"flex flex-col items-start gap-2 " + (className ?? "")}>
      <LogoWordmark height={height} />
      <span className="text-[10.5px] tracking-[0.3em] text-muted uppercase">{t("Marktwerte klassischer Sportwagen", "Classic sports car values")}</span>
    </div>
  );
}
