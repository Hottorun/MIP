import type { Listing } from "../data/types";
import { cn } from "../lib/format";
import { Money } from "./ui";
import { t } from "../i18n";

/** The asking price, or "Preis auf Anfrage" where the dealer states none. */
export function AskPrice({ l, className }: { l: Listing; className?: string }) {
  if (l.onRequest) return <span className={cn("font-serif italic text-muted", className)}>{t("Preis auf Anfrage", "Price on request")}</span>;
  return <Money value={l.price} className={className} />;
}
