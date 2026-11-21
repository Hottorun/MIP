import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { OPERATOR } from "../src/legal.ts";
import { OPERATOR_LINE } from "../src/terms.ts";
import { currentUser, isDemo, throttled } from "./auth.ts";
import { readText } from "./body.ts";
import { db } from "./db.ts";
import { CONTRACTS, type LegalPath, noticePage, sendHtml, sendLegalPage } from "./legalPages.ts";
import { sendMail, textMail } from "./mail.ts";
import { stopRenewal } from "./payments.ts";

/**
 * The terms and the two declarations a customer can make without signing in (server/legalPages.ts has the pages):
 *
 *   GET  /agb         the terms
 *   GET  /widerruf    the withdrawal notice with the withdrawal function (§ 356a BGB)
 *   POST /widerruf    a withdrawal: stored, acknowledged by mail with date and time, reported to the operator
 *   GET  /kuendigen   the confirmation page of the cancellation button (§ 312k BGB)
 *   POST /kuendigen   a cancellation: stored, confirmed by mail with date, time and the end of the contract, reported
 *                     to the operator; the renewal at Stripe stops at once when the address belongs to an account
 *                     with a running subscription (a yearly one that has already renewed ends one month later, and
 *                     the operator refunds the rest)
 *
 * A declaration counts from the moment it arrives, whoever sent it and whether or not an account is found: it is
 * never turned away for lack of a match. So it is stored (contract_notices, db/migrations/018) and mailed to the
 * operator before anything else; only when both fail is the sender told to write an email instead. What only a
 * person can decide stays with the operator: the refund after a withdrawal, an extraordinary cancellation.
 *
 * The page a sender sees says nothing about the account behind an address (the form is open to everyone); the
 * details go to the address itself.
 */

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Kind = "widerruf" | "kuendigen";

const stamp = (d: Date, en: boolean) => new Intl.DateTimeFormat(en ? "en-GB" : "de-DE", { dateStyle: "long", timeStyle: "long", timeZone: "Europe/Berlin" }).format(d);
const day = (d: Date | string, en: boolean) => new Intl.DateTimeFormat(en ? "en-GB" : "de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00Z" : d) : d);

function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin === "null" || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

/** Handles the request if it is one of the pages above. Returns true then. */
export async function handleNoticePages(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.slice(1);
  if (path !== "agb" && path !== "widerruf" && path !== "kuendigen") return false;
  const lang = url.searchParams.get("lang");
  const user = await currentUser(req).catch(() => null);
  const signedIn = Boolean(user);
  if (req.method === "GET" || req.method === "HEAD") {
    // signed in, the forms start with what the account already says; the shared demo account has nothing of its own
    let values: Record<string, string> | undefined;
    if (user && !isDemo(user) && path !== "agb") {
      const [u] = await db()<{ email: string | null }[]>`select email from users where id = ${user.id}`.catch(() => []);
      values = { email: u?.email ?? "", benutzername: user.username, ...(path === "kuendigen" ? { name: user.username } : {}) };
    }
    sendLegalPage(res, path, lang, { signedIn, form: values ? { values } : undefined });
    return true;
  }
  if (req.method !== "POST" || path === "agb") {
    res.statusCode = 405;
    res.setHeader("Allow", path === "agb" ? "GET, HEAD" : "GET, HEAD, POST");
    res.end();
    return true;
  }
  await submit(req, res, path, lang === "en", signedIn);
  return true;
}

async function submit(req: IncomingMessage, res: ServerResponse, kind: Kind, en: boolean, signedIn: boolean) {
  const t = (de: string, e: string) => (en ? e : de);
  const contact = t(`Bitte schicken Sie Ihre Erklärung per E-Mail an ${OPERATOR.email}; sie gilt mit dem Eingang dort.`, `Please send your declaration by email to ${OPERATOR.email}; it counts from its arrival there.`);
  const fail = (status: number, text: string) => sendHtml(res, status, noticePage(t("Das hat nicht geklappt", "That did not work"), en, { paragraphs: [text, contact], error: true, signedIn }));
  if (!sameOrigin(req)) return fail(403, t("Die Anfrage kam nicht von dieser Seite.", "The request did not come from this site."));
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await readText(req, 20_000));
  } catch {
    return fail(413, t("Die Angaben sind zu lang.", "The entries are too long."));
  }
  const get = (name: string, max: number) => (form.get(name) ?? "").trim().slice(0, max);
  const v = {
    name: get("name", 120), email: get("email", 254), benutzername: get("benutzername", 60), vertrag: get("vertrag", 20), bestellt: get("bestellt", 10),
    art: get("art", 20), grund: get("grund", 1500), zeitpunkt: get("zeitpunkt", 10), datum: get("datum", 10),
  };
  const again = (error: string) => sendLegalPage(res, kind as LegalPath, en ? "en" : null, { signedIn, form: { values: v, error } });
  if (!EMAIL.test(v.email)) return again(t("Bitte geben Sie eine gültige E-Mail-Adresse an: dorthin schicken wir die Bestätigung.", "Please give a valid email address: we send the confirmation there."));
  if (kind === "widerruf" && !v.name) return again(t("Bitte geben Sie Ihren Namen an.", "Please give your name."));
  if (v.bestellt && !DAY.test(v.bestellt)) v.bestellt = "";
  if (kind === "kuendigen" && v.zeitpunkt === "datum" && (!DAY.test(v.datum) || Number.isNaN(Date.parse(v.datum)))) return again(t("Bitte geben Sie das Datum an, zu dem der Vertrag enden soll, oder wählen Sie „zum nächstmöglichen Zeitpunkt“.", "Please give the date on which the contract should end, or choose “at the earliest possible date”."));
  const contract = CONTRACTS[kind === "kuendigen" ? "abo" : v.vertrag] ? (kind === "kuendigen" ? "abo" : v.vertrag) : "abo";
  const extraordinary = kind === "kuendigen" && v.art === "ausserordentlich";
  const onDate = kind === "kuendigen" && v.zeitpunkt === "datum" ? v.datum : "";

  // a filled-in trap field: a script. It gets the same page as everyone and nothing happens.
  const bot = Boolean(get("website", 10));
  if (!bot && (await throttled(req, "erklaerung", 6).catch(() => false))) return fail(429, t("Von Ihrer Adresse kamen gerade zu viele Erklärungen.", "Too many declarations have just come from your address."));

  const at = new Date();
  const id = randomUUID();
  const title = kind === "widerruf" ? t("Ihr Widerruf ist eingegangen", "Your withdrawal has been received") : t("Ihre Kündigung ist eingegangen", "Your cancellation has been received");
  const rowsIn = (en: boolean): [string, string][] => {
    const t = (de: string, e: string) => (en ? e : de);
    return [
    [t("Erklärung", "Declaration"), kind === "widerruf" ? t("Widerruf des Vertrags", "Withdrawal from the contract") : extraordinary ? t("Außerordentliche Kündigung", "Extraordinary cancellation") : t("Ordentliche Kündigung", "Ordinary cancellation")],
    [t("Vertrag", "Contract"), CONTRACTS[contract][en ? 1 : 0]],
    ...(extraordinary && v.grund ? [[t("Grund", "Reason"), v.grund] as [string, string]] : []),
    ...(kind === "kuendigen" ? [[t("Vertragsende", "End of contract"), onDate ? day(onDate, en) : extraordinary ? t("sofort (fristlos)", "at once (without notice)") : t("zum nächstmöglichen Zeitpunkt", "at the earliest possible date")] as [string, string]] : []),
    ...(v.name ? [[t("Name", "Name"), v.name] as [string, string]] : []),
    ...(v.benutzername ? [[t("Benutzername", "Username"), v.benutzername] as [string, string]] : []),
    ...(v.bestellt ? [[t("Bestellt am", "Ordered on"), day(v.bestellt, en)] as [string, string]] : []),
    [t("E-Mail-Adresse", "Email address"), v.email],
    [t("Abgegeben über", "Made with"), kind === "widerruf" ? t("Schaltfläche „Widerruf bestätigen“", "the “Confirm withdrawal” button") : t("Schaltfläche „jetzt kündigen“", "the “cancel now” button")],
    [t("Eingegangen am", "Received on"), stamp(at, en)],
    [t("Vorgang", "Reference"), id.slice(0, 8)],
    ];
  };
  const rows = rowsIn(en);
  const done = (mailed: boolean) =>
    sendHtml(
      res,
      200,
      noticePage(title, en, {
        signedIn,
        rows,
        paragraphs: [
          mailed
            ? t(`Wir haben Ihre Erklärung erhalten und die Bestätigung an ${v.email} geschickt.`, `We have received your declaration and sent the confirmation to ${v.email}.`)
            : t("Wir haben Ihre Erklärung erhalten. Die Bestätigung per E-Mail ließ sich gerade nicht verschicken; bitte speichern oder drucken Sie deshalb diese Seite.", "We have received your declaration. The confirmation email could not be sent just now, so please save or print this page."),
          t("Sie können diese Seite als Nachweis speichern oder drucken.", "You can save or print this page as proof."),
        ],
      }),
    );
  if (bot) return done(true);

  // ------------------------------------------------------------------------------------------ keep the declaration
  let account: { id: string; username: string } | null = null;
  try {
    [account = null] = await db()<{ id: string; username: string }[]>`select id, username from users where lower(email) = ${v.email.toLowerCase()}`;
  } catch (err) {
    console.error("Erklärung: Konto nicht gesucht", err);
  }
  let stored = false;
  try {
    await db()`insert into contract_notices (id, kind, email, name, username, contract, details, user_id, received_at)
               values (${id}, ${kind === "widerruf" ? "widerruf" : "kuendigung"}, ${v.email}, ${v.name || null}, ${v.benutzername || null}, ${contract},
                       ${db().json({ art: kind === "kuendigen" ? (extraordinary ? "ausserordentlich" : "ordentlich") : null, grund: v.grund || null, zum: onDate || null, bestellt: v.bestellt || null, lang: en ? "en" : "de" })},
                       ${account?.id ?? null}, ${at})`;
    stored = true;
  } catch (err) {
    console.error("Erklärung nicht gespeichert (npm run db:migrate:prod, Migration 018)", err);
  }

  // ------------------------------------------------------------------- stop the renewal, where there is one to stop
  // Not for a date later than the paid period (the subscription must then run on until that date: by hand).
  let outcome = account ? "Konto gefunden, kein laufendes Abo bei Stripe." : "Kein Konto mit dieser E-Mail-Adresse gefunden: bitte von Hand zuordnen (Name, Benutzername, Stripe).";
  let until: string | null = null;
  let stopped = false;
  let early = false; // ends before the period it paid for: a longer billing period that had already renewed (terms, section 6)
  if (account && contract === "abo") {
    try {
      const sub = await stopRenewal(account.id, onDate && !extraordinary ? onDate : null, kind === "kuendigen");
      if (sub) {
        until = sub.until;
        stopped = sub.stopped;
        early = sub.early;
        outcome = sub.early
          ? `Abo mit längerem Abrechnungszeitraum, bereits verlängert: Kündigung mit Monatsfrist (AGB Nr. 6). Das Abo endet bei Stripe am ${sub.until ? day(sub.until, false) : "unbekannt"}, vor dem Ende des bezahlten Zeitraums; es wird nichts mehr abgebucht.`
          : sub.stopped
          ? `Verlängerung bei Stripe beendet; bezahlt bis ${sub.until ? day(sub.until, false) : "unbekannt"}.`
          : `Abo läuft bei Stripe weiter (bezahlt bis ${sub.until ? day(sub.until, false) : "unbekannt"}): gewünschtes Ende ${day(onDate, false)} liegt später, bitte in Stripe das Kündigungsdatum von Hand setzen.`;
      }
    } catch (err) {
      console.error("Erklärung: Stripe", err);
      outcome = "Stripe war nicht erreichbar: das Abo bitte von Hand in Stripe kündigen.";
    }
  }
  if (stored) await db()`update contract_notices set outcome = ${outcome} where id = ${id}`.catch(() => {});

  // ---------------------------------------------------------------------------------------------- tell the operator
  const todo =
    kind === "widerruf"
      ? `Zu tun: Prüfen, ob der Widerruf in der Frist liegt (14 Tage ab Vertragsschluss; ohne Bestellbestätigung mit Widerrufsbelehrung länger). Wenn ja: alle Zahlungen dieses Vertrags spätestens bis ${day(new Date(at.getTime() + 14 * 86_400_000), false)} in Stripe erstatten (Zahlung → Erstatten; Premium entfällt dann von selbst) und das Abo in Stripe sofort beenden.`
      : extraordinary
        ? "Zu tun: Den wichtigen Grund prüfen. Trägt er, das Abo in Stripe sofort beenden und den Rest des bezahlten Zeitraums anteilig erstatten; sonst gilt die Kündigung als ordentliche zum Ende des bezahlten Zeitraums. Dem Kunden antworten." +
          (early ? " Als ordentliche Kündigung mit Monatsfrist ist sie bereits eingetragen (siehe „Automatisch“): Den Betrag für die Zeit nach dem Vertragsende in jedem Fall anteilig erstatten." : "")
        : early
          ? "Zu tun: Den Betrag, der für die Zeit nach dem Vertragsende bereits bezahlt ist, anteilig erstatten (Stripe: Zahlung → Erstatten → Teilbetrag). Premium endet mit dem Abo von selbst."
        : stopped
          ? "Zu tun: nichts, außer der Kunde meldet sich."
          : "Zu tun: Das Abo in Stripe zum genannten Zeitpunkt kündigen und dem Kunden das Vertragsende bestätigen.";
  let reported = false;
  if (OPERATOR.email) {
    try {
      await sendMail(
        textMail({
          to: OPERATOR.email,
          subject: `[Cartag] ${kind === "widerruf" ? "Widerruf" : extraordinary ? "Außerordentliche Kündigung" : "Kündigung"} eingegangen (${id.slice(0, 8)})`,
          text: [
            `Über die Seite /${kind} ist eine Erklärung eingegangen. Der Kunde hat bereits eine Bestätigung erhalten.`,
            rowsIn(false).map(([k, x]) => `${k}: ${x}`).join("\n"),
            `Konto: ${account ? `${account.username} (${account.id})` : "nicht gefunden"}\nAutomatisch: ${outcome}`,
            todo,
            stored ? "Die Erklärung ist in der Tabelle contract_notices gespeichert." : "ACHTUNG: Die Erklärung konnte nicht in der Datenbank gespeichert werden (Migration 018?). Diese Mail ist der einzige Beleg: bitte aufbewahren.",
          ].join("\n\n"),
        }),
      );
      reported = true;
    } catch (err) {
      console.error("Erklärung: Mail an den Betreiber", err);
    }
  }
  if (!stored && !reported) return fail(500, t("Ihre Erklärung konnte gerade nicht entgegengenommen werden.", "Your declaration could not be taken just now."));

  // --------------------------------------------------------------------------------------------- confirm the sender
  const end = until ? day(until, en) : "";
  const what =
    kind === "widerruf"
      ? [
          t("wir bestätigen den Eingang Ihres Widerrufs.", "we confirm that we have received your withdrawal."),
          t("Inhalt Ihrer Erklärung: „Hiermit widerrufe ich den oben bezeichneten Vertrag.“", "Content of your declaration: “I hereby withdraw from the contract named above.”"),
          t(
            `Ist der Widerruf wirksam, erstatten wir Ihnen die erhaltenen Zahlungen unverzüglich, spätestens binnen vierzehn Tagen ab heute, auf das Zahlungsmittel, mit dem Sie bezahlt haben.${stopped ? " Die Verlängerung Ihres Abos haben wir bereits beendet; es wird nichts mehr abgebucht." : ""}`,
            `If the withdrawal is effective, we refund the payments received without undue delay, within fourteen days from today at the latest, to the means of payment you used.${stopped ? " We have already stopped the renewal of your subscription; nothing more will be charged." : ""}`,
          ),
        ]
      : [
          t("wir bestätigen den Eingang Ihrer Kündigung.", "we confirm that we have received your cancellation."),
          early
            ? t(`Ihr Abo endet am ${end}; es wird nichts mehr abgebucht, und Premium bleibt bis dahin erhalten. Den Betrag, den Sie für die Zeit danach bereits gezahlt haben, erstatten wir Ihnen anteilig auf das Zahlungsmittel, mit dem Sie bezahlt haben.`, `Your subscription ends on ${end}; nothing more will be charged, and premium stays until then. We refund the share you have already paid for the time after that to the means of payment you used.`) +
              (extraordinary ? t(" Ob das Abo wegen des genannten Grundes schon früher endet, prüfen wir und melden uns bei Ihnen.", " We will check whether the subscription ends earlier because of the reason you gave and get back to you.") : "")
            : stopped
            ? t(`Die Verlängerung Ihres Abos ist beendet; es wird nichts mehr abgebucht.${end ? ` Der bezahlte Zeitraum und damit Premium läuft bis zum ${end}.` : ""}${extraordinary ? " Ob das Abo wegen des genannten Grundes schon früher endet, prüfen wir und melden uns bei Ihnen." : ""}`, `The renewal of your subscription has been stopped; nothing more will be charged.${end ? ` The paid period, and with it premium, runs until ${end}.` : ""}${extraordinary ? " We will check whether the subscription ends earlier because of the reason you gave and get back to you." : ""}`)
            : t("Wir ordnen Ihre Kündigung Ihrem Vertrag zu und beenden ihn zum genannten Zeitpunkt. Sollten wir dazu eine Rückfrage haben, melden wir uns. Ihre Kündigung ist unabhängig davon zum unten genannten Zeitpunkt eingegangen.", "We will match your cancellation to your contract and end it at the time stated. If we have a question about it, we will get in touch. Your cancellation was received at the time stated below regardless."),
        ];
  let mailed = false;
  try {
    await sendMail(
      textMail({
        to: v.email,
        subject: kind === "widerruf" ? t("Eingangsbestätigung Ihres Widerrufs – Cartag", "Acknowledgement of your withdrawal – Cartag") : t("Bestätigung Ihrer Kündigung – Cartag", "Confirmation of your cancellation – Cartag"),
        text: [
          t("Guten Tag,", "Hello,"),
          ...what,
          rows.map(([k, x]) => `${k}: ${x}`).join("\n"),
          t(`Haben Sie diese Erklärung nicht selbst abgegeben? Dann schreiben Sie uns bitte gleich an ${OPERATOR.email}.`, `Did you not make this declaration yourself? Then please write to us at ${OPERATOR.email} straight away.`),
          `Cartag\n${OPERATOR_LINE[en ? 1 : 0]}`,
        ].join("\n\n"),
      }),
    );
    mailed = true;
  } catch (err) {
    console.error("Erklärung: Bestätigung an den Absender", err);
  }
  done(mailed);
}
