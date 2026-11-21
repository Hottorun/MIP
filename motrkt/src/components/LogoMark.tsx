// Cartag logo (public/brand/): the script wordmark (Italianno with its alternate t "t.ss03", outlined paths) and the
// square mark with its C, for small places such as the favicon and the loading state.
const WORDMARK_RATIO = 382.2 / 198.4;

export function LogoWordmark({ height = 44, light = false, className }: { height?: number; light?: boolean; className?: string }) {
  const w = Math.round(height * WORDMARK_RATIO);
  if (light) return <img src="/brand/cartag-wordmark-light.svg" alt="Cartag" width={w} height={height} className={className} />;
  // dark ink on the light theme, the light wordmark on the dark theme (switched in index.css)
  return (
    <>
      <img src="/brand/cartag-wordmark.svg" alt="Cartag" width={w} height={height} className={`theme-light-only ${className ?? ""}`} />
      <img src="/brand/cartag-wordmark-light.svg" alt="Cartag" width={w} height={height} className={`theme-dark-only ${className ?? ""}`} />
    </>
  );
}

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return <img src="/brand/cartag-mark.svg" alt="" width={size} height={size} className={className} aria-hidden="true" />;
}

