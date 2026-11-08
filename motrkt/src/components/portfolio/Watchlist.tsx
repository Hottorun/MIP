import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { variantById, variantTitle } from "../../data/db";
import { getMetrics } from "../../data/market";
import { useStore } from "../../state/store";
import { cn, eur } from "../../lib/format";
import { CarImage } from "../CarImage";
import { Delta, Empty, Modal, Pill, Section, Segmented } from "../ui";

export function WatchlistSection() {
  const { watchlist, toggleWatch, alerts, removeAlert, toast } = useStore();
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const watched = watchlist.flatMap((id) => {
    const v = variantById.get(id);
    return v ? [v] : [];
  });

  return (
    <>
      <Section title="Beobachtet" sub={watched.length ? `${watched.length} Varianten` : undefined}>
        {watched.length === 0 ? (
          <Empty>Noch nichts beobachtet. Auf der Seite eines Fahrzeugs findest du „Beobachten“.</Empty>
        ) : (
          <ul id="watchlist" className="grid scroll-mt-28 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {watched.map((v) => {
              const m = getMetrics(v.id);
              return (
                <li key={v.id}>
                  <Link to={`/markt/${v.id}`} className="group block">
                    <div className="overflow-hidden">
                      <CarImage variant={v} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.02]" label={variantTitle(v)} />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-serif text-[16px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{variantTitle(v, { brand: false })}</span>
                      <span className="shrink-0 font-serif text-[16px] tabular-nums">{eur(m.value, { compact: true })}</span>
                    </div>
                  </Link>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px]">
                    <span>
                      <Delta value={m.change12m} arrow={false} /> <span className="text-muted">in 12 Monaten</span>
                    </span>
                    <span className="flex gap-3">
                      <button className="text-muted hover:text-ink" onClick={() => setAlertFor(v.id)}>
                        Preisalarm
                      </button>
                      <button
                        className="text-muted hover:text-ink"
                        onClick={() => {
                          toggleWatch(v.id);
                          toast("Nicht mehr beobachtet", "info");
                        }}
                      >
                        Entfernen
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {alerts.length > 0 && (
        <Section title="Preisalarme">
          <ul className="max-w-3xl">
            {alerts.map((a) => {
              const v = variantById.get(a.variantId);
              if (!v) return null;
              const value = getMetrics(v.id).value;
              const hit = a.direction === "above" ? value >= a.threshold : value <= a.threshold;
              return (
                <li key={a.id} className="flex items-center gap-4 border-b border-line py-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/markt/${v.id}`} className="block truncate font-serif text-[16px] hover:text-gold-2">
                      {variantTitle(v, { brand: false })}
                    </Link>
                    <div className="text-[13px] text-muted">
                      Wenn der Wert {a.direction === "above" ? "über" : "unter"} {eur(a.threshold)} {a.direction === "above" ? "steigt" : "fällt"}. Aktuell {eur(value)}.
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
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <AlertModal variantId={alertFor} onClose={() => setAlertFor(null)} />
    </>
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
            Alarm setzen
          </button>
        </>
      }
    >
      {v && (
        <div className="space-y-3">
          <div>
            <div className="font-serif text-[17px]">{variantTitle(v)}</div>
            <div className="text-[13px] text-muted">Aktueller Marktwert: {eur(value)}</div>
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
