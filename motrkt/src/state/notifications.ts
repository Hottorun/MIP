import { useMemo } from "react";
import { useStore } from "./store";
import { variantById, variantShortTitle } from "../data/db";
import { AS_OF, DAY, getSales } from "../data/generate";
import { getMetrics } from "../data/market";
import { eur, pct } from "../lib/format";
import { t } from "../i18n";
import { usePlan } from "../lib/plan";

export type Notification = {
  id: string;
  kind: "alert" | "sale";
  title: string;
  body: string;
  time: number;
  href: string;
};

/** Notifications derived from the user's alerts and watchlist against the market data. */
export function useNotifications() {
  const { alerts, watchlist, readNotifications } = useStore();
  // lite (src/lib/plan.tsx): that a watched car sold is news for everyone, the price is premium
  const lite = !usePlan().premium;
  return useMemo(() => {
    const items: Notification[] = [];
    for (const a of alerts) {
      const v = variantById.get(a.variantId);
      if (!v?.measured) continue;
      const value = getMetrics(v.id).value;
      const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
      if (hit) {
        items.push({
          id: `alert:${a.id}`,
          kind: "alert",
          title: `${t("Preisalarm", "Price alert")}: ${variantShortTitle(v)}`,
          body: t(
            `Marktwert ${a.direction === "above" ? "über" : "unter"} ${eur(a.threshold)} – aktuell ${eur(value)}`,
            `Market value ${a.direction === "above" ? "above" : "below"} ${eur(a.threshold)} – now ${eur(value)}`,
          ),
          time: AS_OF,
          href: `/markt/${v.id}`,
        });
      }
    }
    for (const id of watchlist) {
      const v = variantById.get(id);
      // without a market value there is nothing to compare a sale against ("vs. market value" would use the placeholder curve)
      if (!v?.measured) continue;
      for (const s of getSales(id)) {
        if (s.date < AS_OF - 28 * DAY) break;
        // with the lite data there is no price to judge the sale by: every sale of a watched car is reported
        if (s.price === null || (!lite && Math.abs(s.trend) < 0.05)) continue;
        items.push({
          id: `sale:${s.id}:${s.variantId}`,
          kind: "sale",
          title: `${lite ? t("Verkauft", "Sold") : s.trend > 0 ? t("Überdurchschnittlicher Verkauf", "Strong sale") : t("Schwacher Verkauf", "Weak sale")}: ${variantShortTitle(v)}`,
          body: lite
            ? t(`Bei ${s.house}. Preis und Abstand zum Marktwert mit Premium.`, `At ${s.house}. Price and gap to the market value with premium.`)
            : t(`${eur(s.price)} bei ${s.house} (${pct(s.trend)} ggü. Marktwert)`, `${eur(s.price)} at ${s.house} (${pct(s.trend)} vs. market value)`),
          time: s.date,
          href: `/markt/${v.id}`,
        });
      }
    }
    items.sort((a, b) => (a.kind === "alert" ? -1 : 0) - (b.kind === "alert" ? -1 : 0) || b.time - a.time);
    const read = new Set(readNotifications);
    const unread = items.filter((n) => !read.has(n.id)).length;
    return { items: items.slice(0, 30), unread, read };
  }, [alerts, watchlist, readNotifications, lite]);
}
