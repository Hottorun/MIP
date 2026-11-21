import { offerPlan, offerRate, offerSaving, type Offer } from "../../lib/plan";
import { cn } from "../../lib/format";
import { t } from "../../i18n";

/**
 * The choice between the plans on sale (lib/plan.tsx `offers`): the same subscription charged by month or by year,
 * each with its full price and, for the cheaper one, by how much. Nothing where there is one plan only.
 */
export function PlanPicker({ offers, chosen, onChoose, className }: { offers: Offer[]; chosen: Offer; onChoose: (o: Offer) => void; className?: string }) {
  if (offers.length < 2) return null;
  return (
    <div role="group" aria-label={t("Abrechnungszeitraum", "Billing period")} className={cn("grid grid-cols-2 gap-2", className)}>
      {offers.map((o) => {
        const on = o.months === chosen.months;
        const saving = offerSaving(o, offers[0]);
        return (
          <button
            key={o.months}
            type="button"
            aria-pressed={on}
            onClick={() => onChoose(o)}
            className={cn(
              "rounded-box border px-3 py-2 text-left transition-colors",
              on ? "border-gold bg-panel shadow-[inset_0_0_0_1px_var(--color-gold)]" : "border-line-2 hover:border-ink/50",
            )}
          >
            <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[13.5px] font-medium text-ink">
              {offerPlan(o)}
              {saving > 0 && <span className="rounded-full bg-up-soft px-1.5 py-px text-[11.5px] font-semibold whitespace-nowrap text-up tabular-nums">−{saving} %</span>}
            </span>
            <span className="mt-0.5 block text-[13px] text-muted tabular-nums">{offerRate(o)}</span>
          </button>
        );
      })}
    </div>
  );
}
