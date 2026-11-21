import type { ReactNode } from "react";
import { CONTROLLER_NOTE, DATENSCHUTZ, IMPRESSUM, MISSING_NOTE, OPERATOR, REPRESENTED, operatorComplete, type LegalSection } from "../legal";
import { isEn, t } from "../i18n";

/**
 * Impressum (/impressum) and privacy notice (/datenschutz) for signed-in users; the texts live in src/legal.ts and
 * the server shows the same texts to visitors without a session (server/legalPages.ts). The privacy text describes
 * what the code actually does (see README): a starting point, to be checked by someone qualified before launch.
 */

const pick = (pair: [string, string]) => (isEn() ? pair[1] : pair[0]);

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-heading text-3xl">{title}</h1>
      {!operatorComplete() && <p className="mt-4 rounded-box border border-down/40 bg-down/5 px-4 py-3 text-[14px] text-down">{pick(MISSING_NOTE)}</p>}
      <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </div>
  );
}

function Operator() {
  const or = (v: string, label: string) => v || <span className="text-down">[{label}]</span>;
  return (
    <p>
      {or(OPERATOR.name, t("Name", "Name"))}
      <br />
      {REPRESENTED[0] && (
        <>
          {t(...REPRESENTED)}
          <br />
        </>
      )}
      {or(OPERATOR.street, t("Straße", "Street"))}
      <br />
      {or(OPERATOR.city, t("PLZ Ort", "Postcode City"))}, {OPERATOR.country}
      <br />
      {t("E-Mail", "Email")}: {or(OPERATOR.email, "E-Mail")}
      {OPERATOR.phone && (
        <>
          <br />
          {t("Telefon", "Phone")}: {OPERATOR.phone}
        </>
      )}
    </p>
  );
}

function Sections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.heading[0]}>
          <h2 className="mt-8 font-display text-xl">{pick(s.heading)}</h2>
          {s.list ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {s.paragraphs.map((p) => (
                <li key={p[0]}>{pick(p)}</li>
              ))}
            </ul>
          ) : (
            s.paragraphs.map((p) => (
              <p key={p[0]} className="mt-3">
                {pick(p)}
              </p>
            ))
          )}
        </section>
      ))}
    </>
  );
}

export function Impressum() {
  return (
    <Page title="Impressum">
      <section>
        <h2 className="font-display text-xl">{t("Angaben gemäß § 5 DDG", "Information pursuant to § 5 DDG (German Digital Services Act)")}</h2>
        <div className="mt-3">
          <Operator />
        </div>
        {OPERATOR.register && <p className="mt-3">{OPERATOR.register}</p>}
        {OPERATOR.vatId && <p className="mt-3">{t("Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG", "VAT identification number pursuant to § 27a UStG")}: {OPERATOR.vatId}</p>}
      </section>
      <section>
        <h2 className="mt-8 font-display text-xl">{t("Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", "Responsible for content pursuant to § 18 (2) MStV")}</h2>
        <p className="mt-3">{OPERATOR.responsible || <span className="text-down">[{t("Verantwortliche Person", "Responsible person")}]</span>}</p>
      </section>
      <Sections sections={IMPRESSUM} />
    </Page>
  );
}

export function Datenschutz() {
  return (
    <Page title={t("Datenschutzerklärung", "Privacy notice")}>
      <section>
        <h2 className="font-display text-xl">{t("1. Verantwortlicher", "1. Controller")}</h2>
        <div className="mt-3">
          <Operator />
        </div>
        <p className="mt-3">{t(...CONTROLLER_NOTE)}</p>
      </section>
      <Sections sections={DATENSCHUTZ} />
    </Page>
  );
}
