import { useEffect, useMemo, useState } from "react";
import { brands, generationById, modelName, models, paintsFor, paintsForVariant, variantById, variantTitle, yearsLabel } from "../../data/db";
import { AS_OF, CONDITIONS, launchTime } from "../../data/generate";
import { getMetrics } from "../../data/market";
import type { Condition, Holding } from "../../data/types";
import { eur, fromDisplay, toDisplay } from "../../lib/format";
import { Modal } from "../ui";
import { isEn, t } from "../../i18n";
import { tr } from "../../i18n/terms";

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
/** Amounts as typed: "250.000" / "250,5" in German, "250,000" / "250.5" in English. */
const parseNum = (s: string) => Number(isEn() ? s.replace(/[,\s]/g, "") : s.replace(/\./g, "").replace(/\s/g, "").replace(",", "."));

function draftFrom(h?: Holding): Draft {
  const v = variantById.get(h?.variantId ?? "porsche-911-964-carrera-rs")!;
  return {
    brandId: v.brandId,
    modelId: v.modelId,
    variantId: v.id,
    purchasePrice: String(Math.round(toDisplay(h ? h.purchasePrice : Math.round(getMetrics(v.id).value / 1000) * 1000))),
    purchaseDate: toInput(h?.purchaseDate ?? AS_OF),
    mileage: h ? String(h.mileage) : "",
    condition: h?.condition ?? "2+",
    color: h?.color ?? paintsForVariant(v)[0].name,
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
  // Period colours of the chosen variant; a colour already on the holding stays selectable.
  const paints = useMemo(() => {
    const list = variant ? paintsForVariant(variant) : paintsFor(d.brandId);
    return d.color && !list.some((p) => p.name === d.color) ? [...list, { name: d.color, hex: "#8b847a" }] : list;
  }, [variant, d.brandId, d.color]);

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
    const price = fromDisplay(parseNum(d.purchasePrice));
    const mileage = d.mileage.trim() === "" ? 0 : parseNum(d.mileage);
    if (!variant) e.variantId = t("Bitte eine Variante wählen.", "Please choose a variant.");
    if (!Number.isFinite(price) || price <= 0) e.purchasePrice = t("Bitte einen gültigen Kaufpreis eingeben.", "Please enter a valid purchase price.");
    else if (price > 50_000_000) e.purchasePrice = t("Kaufpreis unplausibel hoch.", "Purchase price implausibly high.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.purchaseDate)) e.purchaseDate = t("Bitte ein Datum wählen.", "Please choose a date.");
    else {
      const when = fromInput(d.purchaseDate);
      if (when > AS_OF) e.purchaseDate = t("Kaufdatum liegt nach dem Datenstand.", "Purchase date is after the data date.");
      else if (variant && when < launchTime(variant) - 365 * 86_400_000) e.purchaseDate = t(`Variante erst ab ${variant.years[0]} gebaut.`, `This variant was only built from ${variant.years[0]}.`);
    }
    if (!Number.isFinite(mileage) || mileage < 0 || mileage > 1_000_000) e.mileage = t("Bitte eine gültige Laufleistung eingeben.", "Please enter a valid mileage.");
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
      title={holding ? t("Fahrzeug bearbeiten", "Edit car") : t("Fahrzeug hinzufügen", "Add car")}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t("Abbrechen", "Cancel")}
          </button>
          <button className="btn btn-gold" onClick={submit}>
            {holding ? t("Speichern", "Save") : t("Hinzufügen", "Add")}
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
          <label className="label">{t("Marke", "Brand")}</label>
          <select className="input" value={d.brandId} onChange={(e) => pickBrand(e.target.value)}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("Modell", "Model")}</label>
          <select className="input" value={d.modelId} onChange={(e) => pickModel(e.target.value)}>
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {modelName(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">{t("Variante", "Variant")}</label>
          <select className="input" value={d.variantId} onChange={(e) => set("variantId", e.target.value)}>
            {modelVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {variantTitle(v, { brand: false })} ({yearsLabel(v.years)})
              </option>
            ))}
          </select>
          {variant && <p className="mt-1 text-xs text-muted">{t("Aktueller Marktwert (Median)", "Current market value (median)")}: {eur(getMetrics(variant.id).value)}</p>}
          {err("variantId")}
        </div>
        <div>
          <label className="label">{t("Kaufpreis (€)", "Purchase price ($)")}</label>
          <input className="input" inputMode="numeric" value={d.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />
          {err("purchasePrice")}
        </div>
        <div>
          <label className="label">{t("Kaufdatum", "Purchase date")}</label>
          <input className="input" type="date" max={toInput(AS_OF)} value={d.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
          {err("purchaseDate")}
        </div>
        <div>
          <label className="label">{t("Laufleistung (km)", "Mileage (km)")}</label>
          <input className="input" inputMode="numeric" placeholder={t("z. B. 42000", "e.g. 42000")} value={d.mileage} onChange={(e) => set("mileage", e.target.value)} />
          {err("mileage")}
        </div>
        <div>
          <label className="label">{t("Zustand (Note)", "Condition (grade)")}</label>
          <select className="input" value={d.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">{t("Farbe", "Colour")}</label>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {paints.map((p) => (
              <button
                type="button"
                key={p.name}
                onClick={() => set("color", p.name)}
                className={`chip ${d.color === p.name ? "chip-active" : ""}`}
              >
                <span className="inline-block size-2.5 rounded-full border border-white/20" style={{ background: p.hex }} />
                {tr(p.name)}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">{t("Notiz", "Note")}</label>
          <textarea className="input min-h-16" value={d.note} onChange={(e) => set("note", e.target.value)} placeholder={t("Historie, Besonderheiten …", "History, special features …")} />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
