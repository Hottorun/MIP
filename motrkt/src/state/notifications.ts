import { useMemo } from "react";
import { useStore } from "./store";
import { variantById, variantShortTitle } from "../data/db";
import { AS_OF, DAY, getAuctionEvents, getSales } from "../data/generate";
import { getMetrics } from "../data/market";
import { date, eur, pct } from "../lib/format";
import { t } from "../i18n";
import { tr } from "../i18n/terms";

export type Notification = {
  id: string;
  kind: "alert" | "sale" | "auction";
  title: string;
  body: string;
  time: number;
  href: string;
};

/** Notifications derived from the user's alerts and watchlist against the market data. */
export function useNotifications() {
  const { alerts, watchlist, readNotifications } = useStore();
  return useMemo(() => {
    const items: Notification[] = [];
    for (const a of alerts) {
      const v = variantById.get(a.variantId);
      if (!v) continue;
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
      if (!v) continue;
      for (const s of getSales(id)) {
        if (s.date < AS_OF - 28 * DAY) break;
        if (s.price === null || Math.abs(s.trend) < 0.05) continue;
        items.push({
          id: `sale:${s.id}:${s.variantId}`,
          kind: "sale",
          title: `${s.trend > 0 ? t("Überdurchschnittlicher Verkauf", "Strong sale") : t("Schwacher Verkauf", "Weak sale")}: ${variantShortTitle(v)}`,
          body: t(`${eur(s.price)} bei ${s.house} (${pct(s.trend)} ggü. Marktwert)`, `${eur(s.price)} at ${s.house} (${pct(s.trend)} vs. market value)`),
          time: s.date,
          href: `/markt/${v.id}`,
        });
      }
    }
    const watched = new Set(watchlist);
    for (const e of getAuctionEvents()) {
      for (const lot of e.lots) {
        if (!watched.has(lot.variantId)) continue;
        const v = variantById.get(lot.variantId)!;
        items.push({
          id: `lot:${e.id}:${lot.lotNo}`,
          kind: "auction",
          title: `${t("Watchlist-Fahrzeug im Katalog", "Watchlist car in a catalogue")}: ${variantShortTitle(v)}`,
          body: `${e.house} ${tr(e.title)}, ${t("Los", "Lot")} ${lot.lotNo} · ${date(e.date)} · ${t("Schätzung", "Estimate")} ${eur(lot.estimateLow, { compact: true })}–${eur(lot.estimateHigh, { compact: true })}`,
          time: e.date,
          href: `/auktionen?event=${e.id}`,
        });
      }
    }
    items.sort((a, b) => (a.kind === "alert" ? -1 : 0) - (b.kind === "alert" ? -1 : 0) || b.time - a.time);
    const read = new Set(readNotifications);
    const unread = items.filter((n) => !read.has(n.id)).length;
    return { items: items.slice(0, 30), unread, read };
  }, [alerts, watchlist, readNotifications]);
}
