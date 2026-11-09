import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { variants, variantTitle } from "../../data/db";
import { AS_OF, DAY, getSeries } from "../../data/generate";
import { getMetrics, monthlyChanges } from "../../data/market";
import { date, pct } from "../../lib/format";
import { Card, Delta, Segmented } from "../ui";
import { divergingColor } from "./palette";
import { locale, t } from "../../i18n";

type Sort = "desc" | "asc" | "name";

export function TrendHeatmap() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<"top" | "all">("top");
  const [sort, setSort] = useState<Sort>("desc");

  // Each cell covers the ~4 weeks ending at series end − i months; label it by the calendar month it mostly falls into.
  const months = useMemo(() => Array.from({ length: 12 }, (_, k) => date(AS_OF - (11 - k) * 30.44 * DAY - 14 * DAY, "month")), []);

  const rows = useMemo(() => {
    let list = variants.map((v) => ({ v, m: getMetrics(v.id), cells: monthlyChanges(getSeries(v.id), 12) }));
    if (scope === "top") list = [...list].sort((a, b) => b.m.liquidity - a.m.liquidity).slice(0, 12);
    if (sort === "name") list.sort((a, b) => variantTitle(a.v).localeCompare(variantTitle(b.v), locale()));
    else list.sort((a, b) => (sort === "desc" ? b.m.change12m - a.m.change12m : a.m.change12m - b.m.change12m));
    return list;
  }, [scope, sort]);

  return (
    <Card
      title={t("Monat für Monat", "Month by month")}
      sub={t("Wertveränderung je Monat über die letzten 12 Monate", "Change in value per month over the last 12 months")}
      actions={
        <>
          <Segmented
            options={[
              { value: "top", label: t("Meistgehandelt", "Most traded") },
              { value: "all", label: `${t("Alle", "All")} (${variants.length})` },
            ]}
            value={scope}
            onChange={setScope}
          />
          <Segmented
            options={[
              { value: "desc", label: t("Stärkste zuerst", "Strongest first") },
              { value: "asc", label: t("Schwächste zuerst", "Weakest first") },
              { value: "name", label: t("A bis Z", "A to Z") },
            ]}
            value={sort}
            onChange={setSort}
          />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted">{t("Variante", "Variant")}</th>
              {months.map((m, i) => (
                <th key={i} className="w-[6.5%] font-normal whitespace-nowrap text-faint">
                  {m}
                </th>
              ))}
              <th className="pl-2 text-right font-normal text-muted">{t("12 Monate", "12 months")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, m, cells }) => (
              <tr key={v.id} className="group cursor-pointer" onClick={() => navigate(`/markt/${v.id}`)}>
                <td className="max-w-64 truncate pr-2 whitespace-nowrap group-hover:text-gold-2">
                  <span className="truncate font-serif text-[13.5px]">{variantTitle(v, { brand: false })}</span>
                </td>
                {cells.map((c, i) => (
                  <td
                    key={i}
                    title={`${variantTitle(v)} · ${months[i]}: ${pct(c)}`}
                    className="h-6 rounded-[1px] text-center text-[10px] text-ink/0 transition-colors group-hover:text-ink/80"
                    style={{ background: divergingColor(c) }}
                  >
                    {pct(c, { digits: 0 }).replace(/\s?%$/, "")}
                  </td>
                ))}
                <td className="pl-2 text-right whitespace-nowrap">
                  <Delta value={m.change12m} arrow={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-faint">
        <span>{pct(-0.06, { digits: 0 })}</span>
        {[-0.06, -0.03, -0.01, 0, 0.01, 0.03, 0.06].map((x) => (
          <span key={x} className="h-2.5 w-5 rounded-sm" style={{ background: divergingColor(x) }} />
        ))}
        <span>{pct(0.06, { digits: 0 })}</span>
      </div>
    </Card>
  );
}
