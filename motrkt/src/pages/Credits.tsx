import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { brands, variants, variantTitle } from "../data/db";
import { cn, hostOf } from "../lib/format";
import { t } from "../i18n";
import { tr, photoCaption } from "../i18n/terms";
import { CarImage } from "../components/CarImage";
import { BrandEmblem, Card, Pill, Segmented } from "../components/ui";

const CONF = {
  get high() {
    return t("belegt", "confirmed");
  },
  get medium() {
    return t("wahrscheinlich", "likely");
  },
  get low() {
    return t("unsicher", "uncertain");
  },
};

type Tab = "photos" | "colors" | "specs";

export default function Credits() {
  const [tab, setTab] = useState<Tab>("photos");
  const withPhotos = variants.filter((v) => v.photos.length);
  const stats = useMemo(
    () => ({
      photos: variants.reduce((s, v) => s + v.photos.length, 0),
      colors: variants.filter((v) => v.launchColor).length,
      specs: variants.filter((v) => v.specSources.length).length,
    }),
    [],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{t("Bildnachweise & Quellen", "Image credits & sources")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              `${stats.photos} frei lizenzierte Fotos (Wikimedia Commons) · ${stats.colors} recherchierte Präsentationsfarben · ${stats.specs} Varianten mit belegten Spezifikationen`,
              `${stats.photos} freely licensed photos (Wikimedia Commons) · ${stats.colors} researched launch colours · ${stats.specs} variants with sourced specifications`,
            )}
          </p>
        </div>
        <Segmented<Tab>
          options={[
            { value: "photos", label: t("Fotos", "Photos") },
            { value: "colors", label: t("Präsentationsfarben", "Launch colours") },
            { value: "specs", label: t("Spezifikationen", "Specifications") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "photos" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {withPhotos.flatMap((v) =>
            v.photos.map((p) => (
              <div key={p.file} className="panel flex gap-3 p-3">
                <Link to={`/markt/${v.id}`} className="shrink-0">
                  <CarImage variant={v} photo={p} className="aspect-video w-32 shrink-0 rounded-md" />
                </Link>
                <div className="min-w-0 text-xs">
                  <Link to={`/markt/${v.id}`} className="block truncate text-sm text-ink hover:text-gold">
                    {variantTitle(v)}
                  </Link>
                  <div className="truncate text-muted">{photoCaption(p.caption)}</div>
                  <div className="mt-1 text-muted">
                    {t("Foto", "Photo")}: {p.author || t("unbekannt", "unknown")} ·{" "}
                    {p.licenseUrl ? (
                      <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                        {p.license}
                      </a>
                    ) : (
                      p.license
                    )}
                  </div>
                  {p.page && (
                    <a href={p.page} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-faint hover:text-ink">
                      Wikimedia Commons <ExternalLink className="size-3" />
                    </a>
                  )}
                  {p.exact === false && <Pill className="ml-1 text-[10px]">{t("ähnliches Modell", "similar model")}</Pill>}
                </div>
              </div>
            )),
          )}
        </div>
      )}

      {tab === "colors" &&
        brands.map((b) => {
          const list = variants.filter((v) => v.brandId === b.id);
          return (
            <Card key={b.id} title={<span className="inline-flex items-center gap-2"><BrandEmblem brandId={b.id} /> {b.name}</span>}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="pl-0">{t("Variante", "Variant")}</th>
                    <th>{t("Präsentationsfarbe", "Launch colour")}</th>
                    <th>{t("Sicherheit", "Confidence")}</th>
                    <th>{t("Quelle / Notiz", "Source / note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => (
                    <tr key={v.id}>
                      <td className="pl-0">
                        <Link to={`/markt/${v.id}`} className="hover:text-gold">
                          {variantTitle(v, { brand: false })}
                        </Link>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="size-3.5 rounded-full border border-white/30" style={{ background: v.color }} />
                          {v.launchColor ? tr(v.launchColor.name) : <span className="text-faint">{t("nicht recherchiert", "not researched")}</span>}
                        </span>
                      </td>
                      <td>
                        {v.launchColor && (
                          <Pill tone={v.launchColor.confidence === "high" ? "up" : v.launchColor.confidence === "medium" ? "gold" : "warn"}>
                            {CONF[v.launchColor.confidence ?? "low"]}
                          </Pill>
                        )}
                      </td>
                      <td className="max-w-[420px] truncate whitespace-normal text-xs text-muted">
                        {v.launchColor?.source && (
                          <a href={v.launchColor.source} target="_blank" rel="noreferrer" className={cn("text-gold hover:underline", v.launchColor.note && "mr-2")}>
                            {t("Quelle", "Source")}
                          </a>
                        )}
                        {v.launchColor?.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}

      {tab === "specs" && (
        <Card title={t("Belegte Spezifikationen", "Sourced specifications")} sub={t("(Produktion, Leistung, Hubraum, Bauzeit, Neupreis)", "(production, power, displacement, years built, list price)")}>
          <ul className="space-y-1.5 text-[13px]">
            {variants
              .filter((v) => v.specSources.length)
              .map((v) => (
                <li key={v.id} className="flex flex-wrap gap-x-3">
                  <Link to={`/markt/${v.id}`} className="w-72 shrink-0 hover:text-gold">
                    {variantTitle(v)}
                  </Link>
                  {v.specSources.map((s) => (
                    <a key={s} href={s} target="_blank" rel="noreferrer" className="truncate text-xs text-muted hover:text-gold">
                      {hostOf(s)}
                    </a>
                  ))}
                </li>
              ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-faint">
        {t(
          "Fotos stammen ausschließlich von Wikimedia Commons unter den jeweils angegebenen freien Lizenzen.",
          "Photos come exclusively from Wikimedia Commons under the free licences stated.",
        )}
      </p>
    </div>
  );
}
