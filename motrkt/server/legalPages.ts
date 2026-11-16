import type { ServerResponse } from "node:http";
import { DATENSCHUTZ, IMPRESSUM, MISSING_NOTE, OPERATOR, operatorComplete, type LegalSection } from "../src/legal.ts";

/**
 * Impressum and privacy notice for visitors without a session (the sign-in page links here; both must be reachable
 * from every page by law). Same texts as the React pages, rendered as plain HTML in the sign-in page's style.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function operator(en: boolean) {
  const or = (v: string, label: string) => (v ? esc(v) : `<span class="miss">[${esc(label)}]</span>`);
  return `<p>${or(OPERATOR.name, "Name")}<br>${or(OPERATOR.street, en ? "Street" : "Straße")}<br>${or(OPERATOR.city, en ? "Postcode City" : "PLZ Ort")}, ${esc(OPERATOR.country)}<br>${en ? "Email" : "E-Mail"}: ${or(OPERATOR.email, "E-Mail")}${OPERATOR.phone ? `<br>${en ? "Phone" : "Telefon"}: ${esc(OPERATOR.phone)}` : ""}</p>`;
}

function sections(list: LegalSection[], en: boolean) {
  const i = en ? 1 : 0;
  return list
    .map((s) => `<h2>${esc(s.heading[i])}</h2>` + (s.list ? `<ul>${s.paragraphs.map((p) => `<li>${esc(p[i])}</li>`).join("")}</ul>` : s.paragraphs.map((p) => `<p>${esc(p[i])}</p>`).join("")))
    .join("");
}

export function legalPage(which: "impressum" | "datenschutz", en: boolean): string {
  const title = which === "impressum" ? "Impressum" : en ? "Privacy notice" : "Datenschutzerklärung";
  const body =
    which === "impressum"
      ? `<h2>${en ? "Information pursuant to § 5 DDG" : "Angaben gemäß § 5 DDG"}</h2>${operator(en)}` +
        (OPERATOR.register ? `<p>${esc(OPERATOR.register)}</p>` : "") +
        (OPERATOR.vatId ? `<p>${en ? "VAT identification number pursuant to § 27a UStG" : "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG"}: ${esc(OPERATOR.vatId)}</p>` : "") +
        `<h2>${en ? "Responsible for content pursuant to § 18 (2) MStV" : "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV"}</h2><p>${OPERATOR.responsible ? esc(OPERATOR.responsible) : `<span class="miss">[${en ? "Responsible person" : "Verantwortliche Person"}]</span>`}</p>` +
        sections(IMPRESSUM, en)
      : `<h2>${en ? "1. Controller" : "1. Verantwortlicher"}</h2>${operator(en)}${sections(DATENSCHUTZ, en)}`;
  const other = which === "impressum" ? "datenschutz" : "impressum";
  return `<!doctype html>
<html lang="${en ? "en" : "de"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
<meta name="theme-color" content="#efe7d7" />
<title>${esc(title)} – Carbay</title>
<style>
  :root { --bg:#efe7d7; --panel:#f7f2e8; --line:#dccfb8; --ink:#3a2a1d; --muted:#78624d; --down:#9a3b2c; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 system-ui, sans-serif; padding:32px 16px 48px; }
  main { max-width:680px; margin:0 auto; }
  h1 { font-family: Georgia, serif; font-weight:500; font-size:30px; margin:0 0 16px; }
  h2 { font-family: Georgia, serif; font-weight:500; font-size:19px; margin:28px 0 8px; }
  p { margin:0 0 10px; } ul { padding-left:20px; } li { margin-bottom:6px; }
  .warn { border:1px solid var(--down); color:var(--down); padding:10px 14px; margin:0 0 16px; }
  .miss { color:var(--down); }
  nav { display:flex; gap:18px; margin:0 0 24px; font-size:13.5px; } nav a { color:var(--muted); }
  footer { margin-top:36px; font-size:13px; color:var(--muted); }
</style>
</head>
<body>
<main>
  <nav><a href="/anmelden">← ${en ? "Sign in" : "Anmelden"}</a><a href="/${other}">${other === "impressum" ? "Impressum" : en ? "Privacy" : "Datenschutz"}</a><a href="/${which}?lang=${en ? "de" : "en"}">${en ? "Deutsch" : "English"}</a></nav>
  <h1>${esc(title)}</h1>
  ${operatorComplete() ? "" : `<p class="warn">${esc(MISSING_NOTE[en ? 1 : 0])}</p>`}
  ${body}
  <footer>© Carbay</footer>
</main>
</body>
</html>`;
}

export function sendLegalPage(res: ServerResponse, which: "impressum" | "datenschutz", lang: string | null) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'");
  res.end(legalPage(which, lang === "en"));
}
