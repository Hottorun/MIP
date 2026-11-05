import { useState } from "react";
import { Link } from "react-router-dom";
import { BellPlus, Trash2, X } from "lucide-react";
import { variantById, variantTitle } from "../../data/db";
import { getSeries } from "../../data/generate";
import { getMetrics } from "../../data/market";
import { useStore } from "../../state/store";
import { cn, date, eur } from "../../lib/format";
import { BrandEmblem, Card, Delta, Empty, Modal, Pill, Segmented, Sparkline } from "../ui";

const momentumTone = { Stark: "up", Moderat: "gold", Neutral: "neutral", Schwach: "down" } as const;

export function WatchlistSection() {
  const { watchlist, toggleWatch, alerts, removeAlert, toast } = useStore();
  const [alertFor, setAlertFor] = useState<string | null>(null);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card title="Watchlist" sub={`${watchlist.length} Varianten`}>
        {watchlist.length === 0 ? (
          <Empty>Noch keine Fahrzeuge auf der Watchlist. Nutze den Stern auf einer Marktseite.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fahrzeug</th>
                  <th className="text-right">Marktwert</th>
                  <th className="text-right">12M</th>
                  <th>Momentum</th>
                  <th>1J</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {watchlist.map((id) => {
                  const v = variantById.get(id);
                  if (!v) return null;
                  const m = getMetrics(id);
                  return (
                    <tr key={id}>
                      <td>
                        <Link to={`/markt/${id}`} className="flex items-center gap-2 hover:text-gold-2">
                          <BrandEmblem brandId={v.brandId} size={16} />
                          {variantTitle(v)}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{eur(m.value)}</td>
                      <td className="text-right">
                        <Delta value={m.change12m} />
                      </td>
                      <td>
                        <Pill tone={momentumTone[m.momentum]}>{m.momentum}</Pill>
                      </td>
                      <td>
                        <Sparkline values={getSeries(id).slice(-52).map((p) => p.value)} width={90} height={24} />
                      </td>
                      <td className="text-right">
                        <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setAlertFor(id)} title="Preisalarm anlegen">
                          <BellPlus className="size-3.5" /> Alarm
                        </button>
                        <button
                          className="btn btn-ghost px-2 py-1 text-xs text-muted"
                          onClick={() => {
                            toggleWatch(id);
                            toast("Von der Watchlist entfernt", "info");
                          }}
                          aria-label="Von der Watchlist entfernen"
                        >
                          <X className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Preisalarme" sub={`${alerts.length} aktiv`}>
        {alerts.length === 0 ? (
          <Empty>Keine Preisalarme. Lege einen über „Alarm“ in der Watchlist an.</Empty>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => {
              const v = variantById.get(a.variantId);
              if (!v) return null;
              const value = getMetrics(v.id).value;
              const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link to={`/markt/${v.id}`} className="block truncate text-sm hover:text-gold-2">
                      {variantTitle(v)}
                    </Link>
                    <div className="text-xs text-muted">
                      {a.direction === "above" ? "über" : "unter"} {eur(a.threshold)} · aktuell {eur(value)} · seit {date(a.createdAt)}
                    </div>
                  </div>
                  <Pill tone={hit ? "gold" : "neutral"}>{hit ? "ausgelöst" : "aktiv"}</Pill>
                  <button
                    className="text-muted hover:text-down"
                    onClick={() => {
                      removeAlert(a.id);
                      toast("Preisalarm gelöscht", "info");
                    }}
                    aria-label="Alarm löschen"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <AlertModal variantId={alertFor} onClose={() => setAlertFor(null)} />
    </div>
  );
}

export function AlertModal({ variantId, onClose }: { variantId: string | null; onClose: () => void }) {
  const { addAlert, toast } = useStore();
  const v = variantId ? variantById.get(variantId) : undefined;
  const value = v ? getMetrics(v.id).value : 0;
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (variantId !== lastId) {
    setLastId(variantId);
    setThreshold(value ? String(Math.round((value * 1.05) / 1000) * 1000) : "");
    setDirection("above");
    setError("");
  }

  const save = () => {
    const n = Number(threshold.replace(/\./g, "").replace(",", "."));
    if (!v || !Number.isFinite(n) || n <= 0) {
      setError("Bitte einen gültigen Schwellenwert eingeben.");
      return;
    }
    addAlert({ variantId: v.id, direction, threshold: Math.round(n) });
    toast(`Preisalarm für ${variantTitle(v)} angelegt`);
    onClose();
  };

  return (
    <Modal
      open={!!v}
      onClose={onClose}
      title="Preisalarm anlegen"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-gold" onClick={save}>
            Alarm speichern
          </button>
        </>
      }
    >
      {v && (
        <div className="space-y-3">
          <div>
            <div className="text-sm">{variantTitle(v)}</div>
            <div className="text-xs text-muted">Aktueller Marktwert: {eur(value)}</div>
          </div>
          <div>
            <label className="label">Benachrichtigen, wenn der Marktwert</label>
            <Segmented
              options={[
                { value: "above", label: "über" },
                { value: "below", label: "unter" },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </div>
          <div>
            <label className="label">Schwellenwert (€)</label>
            <input
              className={cn("input", error && "border-down")}
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-down">{error}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
