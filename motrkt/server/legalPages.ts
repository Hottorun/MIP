import type { ServerResponse } from "node:http";
import { CONTROLLER_NOTE, DATENSCHUTZ, IMPRESSUM, MISSING_NOTE, OPERATOR, REPRESENTED, operatorComplete, type LegalSection } from "../src/legal.ts";
import { AGB, WIDERRUF, WIDERRUF_INTRO } from "../src/terms.ts";

/**
 * The legal pages as plain HTML in the sign-in page's style, without the app bundle:
 *
 *   /impressum, /datenschutz   for visitors without a session (signed in, the app renders the same texts)
 *   /agb                       the terms, for everyone
 *   /widerruf                  the withdrawal notice with the withdrawal function of § 356a BGB, for everyone
 *   /kuendigen                 the confirmation page of the cancellation button of § 312k BGB, for everyone
 *
 * The last two must work without signing in and without scripts: plain forms, posted to the same address
 * (server/notices.ts). Every page links the others, so all of them are reachable from every page of the site.
 */

export type LegalPath = "impressum" | "datenschutz" | "agb" | "widerruf" | "kuendigen";
export const LEGAL_PATHS: readonly LegalPath[] = ["impressum", "datenschutz", "agb", "widerruf", "kuendigen"];
export type FormState = { values?: Record<string, string>; error?: string };
export type PageOptions = { signedIn?: boolean; form?: FormState };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The contracts a declaration can name; the keys are what the forms send. */
export const CONTRACTS: Record<string, [string, string]> = {
  abo: ["Cartag Premium (Abo)", "Cartag Premium (subscription)"],
  suchauftrag: ["Zusätzliche Suchaufträge (Abo)", "Further search orders (subscription)"],
  einmal: ["Cartag Premium (Einmalkauf)", "Cartag Premium (one-time purchase)"],
  kaufvertrag: ["Cartag Premium für einen geprüften Kaufvertrag", "Cartag Premium for a verified purchase contract"],
};

/** The contracts that run until cancelled: what the cancellation form offers. */
export const SUBSCRIPTIONS = ["abo", "suchauftrag"];

const LABEL: Record<LegalPath, [string, string]> = {
  impressum: ["Impressum", "Impressum"],
  datenschutz: ["Datenschutz", "Privacy"],
  agb: ["AGB", "Terms"],
  widerruf: ["Vertrag widerrufen", "Withdraw from contract"],
  kuendigen: ["Verträge hier kündigen", "Cancel contracts here"],
};
const TITLE: Record<LegalPath, [string, string]> = {
  impressum: ["Impressum", "Impressum"],
  datenschutz: ["Datenschutzerklärung", "Privacy notice"],
  agb: ["Allgemeine Geschäftsbedingungen", "Terms and conditions"],
  widerruf: ["Widerrufsbelehrung", "Withdrawal notice"],
  kuendigen: ["Vertrag kündigen", "Cancel a contract"],
};

function operator(en: boolean) {
  const or = (v: string, label: string) => (v ? esc(v) : `<span class="miss">[${esc(label)}]</span>`);
  return `<p>${or(OPERATOR.name, "Name")}<br>${REPRESENTED[0] ? esc(REPRESENTED[en ? 1 : 0]) + "<br>" : ""}${or(OPERATOR.street, en ? "Street" : "Straße")}<br>${or(OPERATOR.city, en ? "Postcode City" : "PLZ Ort")}, ${esc(OPERATOR.country)}<br>${en ? "Email" : "E-Mail"}: ${or(OPERATOR.email, "E-Mail")}${OPERATOR.phone ? `<br>${en ? "Phone" : "Telefon"}: ${esc(OPERATOR.phone)}` : ""}</p>`;
}

function sections(list: LegalSection[], en: boolean) {
  const i = en ? 1 : 0;
  return list
    .map((s) => `<h2>${esc(s.heading[i])}</h2>` + (s.list ? `<ul>${s.paragraphs.map((p) => `<li>${esc(p[i])}</li>`).join("")}</ul>` : s.paragraphs.map((p) => `<p>${esc(p[i])}</p>`).join("")))
    .join("");
}

const field = (f: FormState | undefined, name: string) => esc(f?.values?.[name] ?? "");
const picked = (f: FormState | undefined, name: string, value: string, fallback = false) => ((f?.values?.[name] ?? (fallback ? value : "")) === value ? " checked" : "");
const chosen = (f: FormState | undefined, name: string, value: string) => (f?.values?.[name] === value ? " selected" : "");
const formError = (f: FormState | undefined) => (f?.error ? `<p class="warn" role="alert">${esc(f.error)}</p>` : "");
// a field no person sees or fills in: what arrives with it filled in came from a script
const trap = `<p class="trap" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></p>`;

/** The withdrawal function (§ 356a BGB): name, contract and where the acknowledgement goes, then "Widerruf bestätigen". */
function withdrawalForm(en: boolean, f?: FormState) {
  const t = (de: string, e: string) => esc(en ? e : de);
  return `<h2 id="erklaerung">${t("Vertrag widerrufen", "Withdraw from contract")}</h2>
<p>${t("Hier erklären Sie den Widerruf online. Sie müssen sich dafür nicht anmelden. Die Eingangsbestätigung mit Datum und Uhrzeit schicken wir sofort an die angegebene E-Mail-Adresse.", "Declare your withdrawal online here. You need not sign in. We send the acknowledgement of receipt with date and time to the email address you give straight away.")}</p>
${formError(f)}
<form method="post" action="/widerruf${en ? "?lang=en" : ""}#erklaerung">
  <label for="w-name">${t("Ihr Name", "Your name")}</label>
  <input id="w-name" name="name" required maxlength="120" autocomplete="name" value="${field(f, "name")}">
  <label for="w-email">${t("E-Mail-Adresse Ihres Kontos (dorthin geht die Eingangsbestätigung)", "Email address of your account (the acknowledgement goes there)")}</label>
  <input id="w-email" name="email" type="email" required maxlength="254" autocomplete="email" value="${field(f, "email")}">
  <label for="w-vertrag">${t("Vertrag, den Sie widerrufen", "Contract you withdraw from")}</label>
  <select id="w-vertrag" name="vertrag">${Object.entries(CONTRACTS).map(([k, v]) => `<option value="${k}"${chosen(f, "vertrag", k)}>${esc(v[en ? 1 : 0])}</option>`).join("")}</select>
  <label for="w-user">${t("Benutzername (freiwillig, hilft beim Zuordnen)", "Username (optional, helps us find the contract)")}</label>
  <input id="w-user" name="benutzername" maxlength="60" autocomplete="username" value="${field(f, "benutzername")}">
  <label for="w-date">${t("Bestellt am (freiwillig)", "Ordered on (optional)")}</label>
  <input id="w-date" name="bestellt" type="date" value="${field(f, "bestellt")}">
  ${trap}
  <p class="say">${t("Hiermit widerrufe ich den oben bezeichneten Vertrag.", "I hereby withdraw from the contract named above.")}</p>
  <button type="submit">${t("Widerruf bestätigen", "Confirm withdrawal")}</button>
</form>`;
}

/** The confirmation page of the cancellation button (§ 312k Abs. 2 BGB): nothing but the entries the law names and "jetzt kündigen". */
function cancellationForm(en: boolean, f?: FormState) {
  const t = (de: string, e: string) => esc(en ? e : de);
  return `<p>${t("Hier kündigen Sie Ihr Abo, ohne sich anzumelden. Die Bestätigung mit Datum und Uhrzeit schicken wir sofort an die angegebene E-Mail-Adresse.", "Cancel your subscription here without signing in. We send the confirmation with date and time to the email address you give straight away.")}</p>
${formError(f)}
<form method="post" action="/kuendigen${en ? "?lang=en" : ""}">
  <label for="k-vertrag">${t("Vertrag", "Contract")}</label>
  <select id="k-vertrag" name="vertrag">${SUBSCRIPTIONS.map((k) => `<option value="${k}"${chosen(f, "vertrag", k)}>${esc(CONTRACTS[k][en ? 1 : 0])}</option>`).join("")}</select>
  <fieldset><legend>${t("Art der Kündigung", "Kind of cancellation")}</legend>
    <label class="pick"><input type="radio" name="art" value="ordentlich"${picked(f, "art", "ordentlich", true)}> ${t("Ordentliche Kündigung", "Ordinary cancellation")}</label>
    <label class="pick"><input type="radio" name="art" value="ausserordentlich"${picked(f, "art", "ausserordentlich")}> ${t("Außerordentliche Kündigung (fristlos, aus wichtigem Grund)", "Extraordinary cancellation (without notice, for good cause)")}</label>
    <label for="k-grund">${t("Grund (nur bei außerordentlicher Kündigung)", "Reason (for an extraordinary cancellation only)")}</label>
    <textarea id="k-grund" name="grund" rows="3" maxlength="1500">${field(f, "grund")}</textarea>
  </fieldset>
  <label for="k-email">${t("E-Mail-Adresse Ihres Kontos (dorthin geht die Bestätigung)", "Email address of your account (the confirmation goes there)")}</label>
  <input id="k-email" name="email" type="email" required maxlength="254" autocomplete="email" value="${field(f, "email")}">
  <label for="k-name">${t("Name oder Benutzername (freiwillig, hilft beim Zuordnen)", "Name or username (optional, helps us find the contract)")}</label>
  <input id="k-name" name="name" maxlength="120" value="${field(f, "name")}">
  <fieldset><legend>${t("Wann soll der Vertrag enden?", "When should the contract end?")}</legend>
    <label class="pick"><input type="radio" name="zeitpunkt" value="naechst"${picked(f, "zeitpunkt", "naechst", true)}> ${t("Zum nächstmöglichen Zeitpunkt", "At the earliest possible date")}</label>
    <label class="pick"><input type="radio" name="zeitpunkt" value="datum"${picked(f, "zeitpunkt", "datum")}> ${t("Zu diesem Datum:", "On this date:")} <input name="datum" type="date" aria-label="${t("Datum", "Date")}" value="${field(f, "datum")}"></label>
  </fieldset>
  ${trap}
  <button type="submit">${t("jetzt kündigen", "cancel now")}</button>
</form>`;
}

function shell(which: LegalPath | null, title: string, en: boolean, body: string, signedIn: boolean) {
  const q = en ? "?lang=en" : "";
  const link = (p: LegalPath) => `<a href="/${p}${q}">${esc(LABEL[p][en ? 1 : 0])}</a>`;
  return `<!doctype html>
<html lang="${en ? "en" : "de"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml" />
<meta name="theme-color" content="#16363c" />
<title>${esc(title)} – Cartag</title>
<style>
  /* the app's colours (src/index.css), dark with the system setting */
  :root { --bg:#f6f4ef; --panel:#fcfbf8; --line:#e0dbd2; --ink:#1f1d1a; --muted:#5e5952; --accent:#16363c; --on:#f6f4ef; --down:#a33a2b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#121412; --panel:#1a1c1a; --line:#2f3330; --ink:#eeeae1; --muted:#b4ada1; --accent:#729da4; --on:#121412; --down:#ee8a7a; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; padding:32px 16px 48px; }
  a { color:var(--accent); }
  main { max-width:680px; margin:0 auto; }
  h1 { font-family: Georgia, serif; font-weight:500; font-size:30px; margin:0 0 16px; }
  h2 { font-family: Georgia, serif; font-weight:500; font-size:19px; margin:28px 0 8px; }
  p { margin:0 0 10px; } ul { padding-left:20px; } li { margin-bottom:6px; }
  .warn { border:1px solid var(--down); color:var(--down); padding:10px 14px; margin:0 0 16px; }
  .miss { color:var(--down); }
  nav { display:flex; flex-wrap:wrap; gap:6px 18px; margin:0 0 24px; padding-bottom:12px; border-bottom:1px solid #c9a35e; font-size:13.5px; } nav a { color:var(--accent); text-decoration:none; }
  footer { margin-top:36px; padding-top:14px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); display:flex; flex-wrap:wrap; gap:6px 18px; }
  form { background:var(--panel); border:1px solid var(--line); border-top:2px solid #c9a35e; padding:18px 20px 22px; margin:14px 0 0; }
  label { display:block; margin:14px 0 4px; font-size:13.5px; color:var(--muted); }
  input, select, textarea { box-sizing:border-box; width:100%; font:inherit; color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:9px 10px; }
  input[type=radio] { width:auto; margin-right:6px; } input[type=date] { width:auto; }
  fieldset { border:1px solid var(--line); border-radius:4px; margin:16px 0 0; padding:6px 14px 14px; } legend { font-size:13.5px; color:var(--muted); padding:0 6px; }
  .pick { color:var(--ink); font-size:15px; margin:8px 0 0; }
  .say { margin:18px 0 0; }
  .trap { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
  button { margin-top:16px; font:inherit; font-weight:600; letter-spacing:.04em; color:var(--on); background:var(--accent); border:0; border-radius:4px; padding:12px 22px; cursor:pointer; }
  .jump { display:inline-block; margin:0 0 18px; font-weight:600; color:var(--on); background:var(--accent); border-radius:4px; padding:10px 18px; text-decoration:none; }
  dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 18px; background:var(--panel); border:1px solid var(--line); padding:14px 18px; margin:14px 0; } dt { color:var(--muted); } dd { margin:0; }
  @media print { nav, footer, .noprint { display:none; } body { background:#fff; color:#000; } }
</style>
</head>
<body>
<main>
  <nav><a href="${signedIn ? "/" : "/anmelden"}">← ${signedIn ? "Cartag" : en ? "Sign in" : "Anmelden"}</a>${LEGAL_PATHS.filter((p) => p !== which).map(link).join("")}${which ? `<a href="/${which}${en ? "" : "?lang=en"}">${en ? "Deutsch" : "English"}</a>` : ""}</nav>
  <h1>${esc(title)}</h1>
  ${body}
  <footer><span>© Cartag</span>${link("widerruf")}${link("kuendigen")}</footer>
</main>
</body>
</html>`;
}

export function legalPage(which: LegalPath, en: boolean, o: PageOptions = {}): string {
  const i = en ? 1 : 0;
  const warn = operatorComplete() ? "" : `<p class="warn">${esc(MISSING_NOTE[i])}</p>`;
  const body =
    which === "impressum"
      ? `<h2>${en ? "Information pursuant to § 5 DDG" : "Angaben gemäß § 5 DDG"}</h2>${operator(en)}` +
        (OPERATOR.register ? `<p>${esc(OPERATOR.register)}</p>` : "") +
        (OPERATOR.vatId ? `<p>${en ? "VAT identification number pursuant to § 27a UStG" : "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG"}: ${esc(OPERATOR.vatId)}</p>` : "") +
        `<h2>${en ? "Responsible for content pursuant to § 18 (2) MStV" : "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV"}</h2><p>${OPERATOR.responsible ? esc(OPERATOR.responsible) : `<span class="miss">[${en ? "Responsible person" : "Verantwortliche Person"}]</span>`}</p>` +
        sections(IMPRESSUM, en)
      : which === "datenschutz"
        ? `<h2>${en ? "1. Controller" : "1. Verantwortlicher"}</h2>${operator(en)}<p>${esc(CONTROLLER_NOTE[i])}</p>${sections(DATENSCHUTZ, en)}`
        : which === "agb"
          ? sections(AGB, en)
          : which === "widerruf"
            ? `<a class="jump noprint" href="#erklaerung">${esc(LABEL.widerruf[i])} ↓</a><p>${esc(WIDERRUF_INTRO[i])}</p>${sections(WIDERRUF, en)}${withdrawalForm(en, o.form)}`
            : cancellationForm(en, o.form);
  return shell(which, TITLE[which][i], en, warn + body, Boolean(o.signedIn));
}

/** What a submitted declaration is answered with: what arrived and when, to print or save (§ 312k Abs. 3 BGB). */
export function noticePage(title: string, en: boolean, o: { paragraphs: string[]; rows?: [string, string][]; error?: boolean; signedIn?: boolean }): string {
  const body =
    o.paragraphs.map((p, n) => `<p${o.error && n === 0 ? ' class="warn" role="alert"' : ""}>${esc(p)}</p>`).join("") +
    (o.rows?.length ? `<dl>${o.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "");
  return shell(null, title, en, body, Boolean(o.signedIn));
}

export function sendHtml(res: ServerResponse, status: number, html: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.end(html);
}

export function sendLegalPage(res: ServerResponse, which: LegalPath, lang: string | null, o: PageOptions = {}) {
  sendHtml(res, 200, legalPage(which, lang === "en", o));
}
