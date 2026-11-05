import { useEffect, useMemo, useState } from "react";
import { brands, generationById, models, paintsFor, variantById, variantTitle, yearsLabel } from "../../data/db";
import { AS_OF, CONDITIONS, launchTime } from "../../data/generate";
import { getMetrics } from "../../data/market";
import type { Condition, Holding } from "../../data/types";
import { eur } from "../../lib/format";
import { Modal } from "../ui";

type Draft = {
  brandId: string;
  modelId: string;
  variantId: string;
  purchasePrice: string;
  purchaseDate: string;
  mileage: string;
  condition: Condition;
  color: string;
  note: string;
};

const toInput = (t: number) => new Date(t).toISOString().slice(0, 10);
const fromInput = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/\s/g, "").replace(",", "."));

function draftFrom(h?: Holding): Draft {
  const v = variantById.get(h?.variantId ?? "porsche-911-964-carrera-rs")!;
  return {
    brandId: v.brandId,
    modelId: v.modelId,
    variantId: v.id,
    purchasePrice: h ? String(h.purchasePrice) : String(Math.round(getMetrics(v.id).value / 1000) * 1000),
    purchaseDate: toInput(h?.purchaseDate ?? AS_OF),
    mileage: h ? String(h.mileage) : "",
    condition: h?.condition ?? "2+",
    color: h?.color ?? paintsFor(v.brandId)[0].name,
    note: h?.note ?? "",
  };
}

export function HoldingForm({
  open,
  holding,
  onClose,
  onSave,
}: {
  open: boolean;
  holding?: Holding;
  onClose: () => void;
  onSave: (h: Omit<Holding, "id">) => void;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(holding));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setD(draftFrom(holding));
      setErrors({});
    }
  }, [open, holding]);

  const brandModels = useMemo(() => models.filter((m) => m.brandId === d.brandId), [d.brandId]);
  const modelVariants = useMemo(() => {
    const m = models.find((x) => x.id === d.modelId);
    return (m?.generationIds ?? []).flatMap((gid) => generationById.get(gid)!.variantIds.map((id) => variantById.get(id)!));
  }, [d.modelId]);
  const variant = variantById.get(d.variantId);
  const paints = paintsFor(d.brandId);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const pickBrand = (brandId: string) => {
    const m = models.find((x) => x.brandId === brandId)!;
    const vid = generationById.get(m.generationIds[0])!.variantIds[0];
    setD((x) => ({ ...x, brandId, modelId: m.id, variantId: vid, color: paintsFor(brandId)[0].name }));
  };
  const pickModel = (modelId: string) => {
    const m = models.find((x) => x.id === modelId)!;
    setD((x) => ({ ...x, modelId, variantId: generationById.get(m.generationIds[0])!.variantIds[0] }));
  };

  function submit() {
    const e: Record<string, string> = {};
    const price = parseNum(d.purchasePrice);
    const mileage = d.mileage.trim() === "" ? 0 : parseNum(d.mileage);
    if (!variant) e.variantId = "Bitte eine Variante wählen.";
    if (!Number.isFinite(price) || price <= 0) e.purchasePrice = "Bitte einen gültigen Kaufpreis eingeben.";
    else if (price > 50_000_000) e.purchasePrice = "Kaufpreis unplausibel hoch.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.purchaseDate)) e.purchaseDate = "Bitte ein Datum wählen.";
    else {
      const t = fromInput(d.purchaseDate);
      if (t > AS_OF) e.purchaseDate = "Kaufdatum liegt nach dem Datenstand.";
      else if (variant && t < launchTime(variant) - 365 * 86_400_000) e.purchaseDate = `Variante erst ab ${variant.years[0]} gebaut.`;
    }
    if (!Number.isFinite(mileage) || mileage < 0 || mileage > 1_000_000) e.mileage = "Bitte eine gültige Laufleistung eingeben.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({
      variantId: d.variantId,
      purchasePrice: Math.round(price),
      purchaseDate: fromInput(d.purchaseDate),
      mileage: Math.round(mileage),
      condition: d.condition,
      color: d.color,
      note: d.note.trim(),
    });
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-down">{errors[k]}</p>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={holding ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen"}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-gold" onClick={submit}>
            {holding ? "Speichern" : "Hinzufügen"}
          </button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label className="label">Marke</label>
          <select className="input" value={d.brandId} onChange={(e) => pickBrand(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Modell</label>
          <select className="input" value={d.modelId} onChange={(e) => pickModel(e.target.value)}>
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Variante</label>
          <select className="input" value={d.variantId} onChange={(e) => set("variantId", e.target.value)}>
            {modelVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantTitle(v, { brand: false })} ({yearsLabel(v.years)})
              </option>
            ))}
          </select>
          {variant && <p className="mt-1 text-xs text-muted">Aktueller Marktwert (Median): {eur(getMetrics(variant.id).value)}</p>}
          {err("variantId")}
        </div>
        <div>
          <label className="label">Kaufpreis (€)</label>
          <input className="input" inputMode="numeric" value={d.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />
          {err("purchasePrice")}
        </div>
        <div>
          <label className="label">Kaufdatum</label>
          <input className="input" type="date" max={toInput(AS_OF)} value={d.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
          {err("purchaseDate")}
        </div>
        <div>
          <label className="label">Laufleistung (km)</label>
          <input className="input" inputMode="numeric" placeholder="z. B. 42000" value={d.mileage} onChange={(e) => set("mileage", e.target.value)} />
          {err("mileage")}
        </div>
        <div>
          <label className="label">Zustand (Note)</label>
          <select className="input" value={d.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Farbe</label>
          <div className="flex flex-wrap gap-1.5">
            {paints.map((p) => (
              <button
                type="button"
                key={p.name}
                onClick={() => set("color", p.name)}
                className={`chip ${d.color === p.name ? "chip-active" : ""}`}
              >
                <span className="inline-block size-2.5 rounded-full border border-white/20" style={{ background: p.hex }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">Notiz</label>
          <textarea className="input min-h-16" value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Historie, Besonderheiten …" />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
