import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import variantIds from "../scripts/market/variant_ids.json" with { type: "json" };
import { readBuffer, readText } from "./body.ts";
import { checkDocument, hasCredentials, type Entered } from "./contractCheck.ts";
import { canStoreContracts, seal, unseal } from "./contractVault.ts";
import { currentUser, isAdmin, isDemo } from "./auth.ts";
import { db } from "./db.ts";
import { overLimit } from "./limits.ts";

/**
 * "Mein Fahrzeug melden": users enter a car and upload the document that proves it (db/migrations/004_user_cars.sql,
 * 011_appraisals.sql). Two kinds: a purchase contract for a car they bought or sold ("kaufvertrag"), or an appraisal
 * of a car they own ("gutachten", Wertgutachten). If the user allows it, Claude pre-checks the document; a reviewer
 * (MIP_ADMINS) approves or rejects it. Either decision deletes the document, and so does the clock a day after the
 * upload. Approval gives the user PREMIUM_MONTHS of free premium access. A purchase price enters the market model on
 * the next daily run (scripts/db/export-user-cars.ts); an appraised value is an opinion, not a sale, and stays out.
 *
 * Data protection (DATENSCHUTZ.md): the document is stored encrypted (server/contractVault.ts), the consent is kept
 * with its time and wording, every reviewer access is logged (contract_access), the user can delete any of their
 * reports at any time, and what is left undecided or rejected is removed after the periods below.
 *
 *   GET    /api/fahrzeuge                     the user's own reports
 *   POST   /api/fahrzeuge                     new report (JSON, kind: "kaufvertrag" | "gutachten") -> { id }
 *   PUT    /api/fahrzeuge/:id/vertrag         the document (PDF, JPEG, PNG or WebP as the raw body, at most 4 MB)
 *   DELETE /api/fahrzeuge/:id                 delete a report with its contract; an approved one is detached from the
 *                                             account instead and stays in the market model without chassis number
 *   GET    /api/pruefung                      reviewers: open reports and the latest decisions
 *   GET    /api/pruefung/:id/vertrag          reviewers: the contract
 *   POST   /api/pruefung/:id/ki               reviewers: run the AI check again
 *   POST   /api/pruefung/:id                  reviewers: { decision: "approve" | "reject", note, corrections }
 */

export const PREMIUM_MONTHS = 12;

/** Until when premium runs for approvals at these times (ascending): each adds PREMIUM_MONTHS to what is still running. */
export function premiumFrom(approvals: Date[]): Date | null {
  return approvals.reduce<Date | null>((until, at) => {
    const next = new Date(until && until > at ? until : at);
    next.setUTCMonth(next.getUTCMonth() + PREMIUM_MONTHS);
    return next;
  }, null);
}
/** The wording of the consent in the form (src/components/portfolio/UserCars.tsx); change it together with that text. */
export const CONSENT_VERSION = "2026-11-18-2";
// Retention: how long a report may sit before it is removed without anyone asking.
export const RETENTION = {
  documentHours: 24, // an uploaded contract or appraisal is gone this long after the upload at the latest, decided or not
  awaitingDays: 30, // entered, but no document uploaded: the report is deleted
  decidedDays: 90, // rejected or expired: the report is deleted this long after the decision
  accessLogDays: 365, // lines in contract_access
};
/**
 * The age at which a document is actually removed and no longer handed to anyone: an hour before the promised day is
 * over, because the sweeps run in steps (pg_cron every 15 minutes where the database has it,
 * db/migrations/011_appraisals.sql, which carries the same 23 hours; sweepUserCars on requests, hourly at most).
 */
const DOCUMENT_HOURS = RETENTION.documentHours - 1;
const MAX_CONTRACT = 4 * 1024 * 1024; // a Vercel function takes at most 4.5 MB per request
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
/** The file must really be what the Content-Type says (first bytes), not just claim it. */
function matchesType(type: string, b: Buffer) {
  switch (type) {
    case "application/pdf": return b.subarray(0, 5).toString("latin1") === "%PDF-";
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png": return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp": return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
    default: return false;
  }
}
const VARIANTS = new Map((variantIds as [string, string][]).map(([id, name]) => [id, name]));
const CURRENCIES = new Set(["EUR", "CHF", "GBP", "USD", "SEK", "DKK", "NOK", "CAD"]);
const COUNTRY = /^[A-Z]{2}$/;
const VIN = /^[A-HJ-NPR-Z0-9 -]{5,20}$/i; // older Porsches have short chassis numbers (e.g. 9113101234)
export const KINDS = ["kaufvertrag", "gutachten"] as const;
export type Kind = (typeof KINDS)[number];
/** What an appraisal states: the market value, or what replacing or rebuilding the car would cost. */
const VALUE_BASES = new Set(["marktwert", "wiederbeschaffungswert", "wiederherstellungswert"]);

type Row = Record<string, unknown> & { id: string; user_id: string; status: string };

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Changing requests must come from this site. */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** A calendar day that exists, as YYYY-MM-DD ("2024-02-31" has the right shape and is not one). */
const realDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
const optS = (v: unknown, max = 200) => s(v, max) || null;
const optB = (v: unknown) => (typeof v === "boolean" ? v : null);

/**
 * Validated report from the form, or the field errors. An appraisal ("gutachten") has no role and no counterparty but
 * names its appraiser and what the value stands for; `price` is the appraised value, `sale_date` the appraisal's date.
 */
export function parseReport(b: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const e: Record<string, string> = {};
  const kind: Kind = b.kind === undefined ? "kaufvertrag" : (s(b.kind) as Kind);
  if (!KINDS.includes(kind)) e.kind = "kind";
  const appraisal = kind === "gutachten";
  const role = appraisal ? null : s(b.role);
  if (!appraisal && role !== "kauf" && role !== "verkauf") e.role = "role";
  const variant_id = s(b.variant_id);
  if (!VARIANTS.has(variant_id)) e.variant_id = "variant";
  const title = s(b.title, 120) || VARIANTS.get(variant_id) || "";
  const build_year = Number(b.build_year);
  if (!Number.isInteger(build_year) || build_year < 1948 || build_year > Number(today.slice(0, 4)) + 1) e.build_year = "year";
  const vin = s(b.vin, 30).toUpperCase().replace(/\s+/g, "");
  if (!VIN.test(vin)) e.vin = "vin";
  const km = Number(b.km);
  if (!Number.isInteger(km) || km < 0 || km > 2_000_000) e.km = "km";
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 500 || price > 100_000_000) e.price = "price";
  const currency = s(b.currency).toUpperCase();
  if (!CURRENCIES.has(currency)) e.currency = "currency";
  const sale_date = s(b.sale_date);
  if (!realDate(sale_date) || sale_date > today || sale_date < "2000-01-01") e.sale_date = "date";
  const country = s(b.country).toUpperCase();
  if (!COUNTRY.test(country)) e.country = "country";
  const counterparty = appraisal ? null : s(b.counterparty);
  if (!appraisal && !["privat", "haendler", "auktion"].includes(counterparty ?? "")) e.counterparty = "counterparty";
  const appraiser = appraisal ? s(b.appraiser, 80) : null;
  if (appraisal && (appraiser ?? "").length < 2) e.appraiser = "appraiser";
  const value_basis = appraisal ? s(b.value_basis) : null;
  if (appraisal && !VALUE_BASES.has(value_basis ?? "")) e.value_basis = "value_basis";
  const steering = optS(b.steering);
  if (steering && steering !== "links" && steering !== "rechts") e.steering = "steering";
  const condition = optS(b.condition, 4);
  if (condition && !/^[1-5][+-]?$/.test(condition)) e.condition = "condition";
  if (b.consent !== true) e.consent = "consent";
  const report = {
    kind, role, variant_id, title, build_year, vin, km, price, currency, sale_date, country, counterparty, appraiser, value_basis,
    body: optS(b.body, 40), gearbox: optS(b.gearbox, 40), steering, color_ext: optS(b.color_ext, 60), color_int: optS(b.color_int, 60),
    condition, matching_numbers: optB(b.matching_numbers), accident_free: optB(b.accident_free), notes: optS(b.notes, 2000),
    ai_consent: b.ai_consent === true, // optional: the pre-check by Anthropic runs only with it
  };
  return { report, errors: e };
}

/** Columns the user and the reviewer see (never the document itself). */
const VISIBLE = [
  "id", "status", "created_at", "kind", "appraiser", "value_basis", "contract_at", "role", "variant_id", "title", "build_year", "vin", "km", "price", "currency", "sale_date", "country",
  "counterparty", "body", "gearbox", "steering", "color_ext", "color_int", "condition", "matching_numbers", "accident_free", "notes",
  "contract_name", "contract_type", "contract_size", "contract_deleted_at", "reviewed_at", "review_note", "ai_consent",
] as const;

function entered(r: Row): Entered {
  const car = {
    title: String(r.title), variantName: VARIANTS.get(String(r.variant_id)) ?? String(r.variant_id),
    build_year: Number(r.build_year), vin: String(r.vin), km: Number(r.km),
  };
  const day = String(r.sale_date instanceof Date ? r.sale_date.toISOString().slice(0, 10) : r.sale_date);
  if (r.kind === "gutachten")
    return {
      kind: "gutachten", ...car, value: Number(r.price), currency: String(r.currency), value_basis: String(r.value_basis ?? ""),
      appraisal_date: day, appraiser: String(r.appraiser ?? ""), condition: r.condition ? String(r.condition) : null, country: String(r.country),
    };
  return {
    kind: "kaufvertrag", role: r.role === "kauf" ? "Nutzer hat gekauft" : "Nutzer hat verkauft", ...car, price: Number(r.price),
    currency: String(r.currency), sale_date: day, country: String(r.country), counterparty: String(r.counterparty),
  };
}

/** Still within its day: an older document is treated as gone even before a sweep has removed it. */
const fresh = () => db()`coalesce(contract_at, created_at) > now() - make_interval(hours => ${DOCUMENT_HOURS})`;

/** Runs the AI check for a report with a document and stores the result (or the error) with it. Only with the user's consent. */
async function runCheck(id: string) {
  const [r] = await db()<Row[]>`select * from user_cars where id = ${id} and contract is not null and ai_consent and ${fresh()}`;
  if (!r) return;
  let result: unknown;
  try {
    result = await checkDocument(unseal(r.contract as Buffer, r.id), String(r.contract_type), entered(r));
  } catch (err) {
    console.error("contract check", err);
    result = { error: err instanceof Error ? err.message : "KI-Prüfung fehlgeschlagen" };
  }
  await db()`update user_cars set ai_check = ${db().json(result as never)}, ai_checked_at = now() where id = ${id}`;
}

let swept = 0;
/**
 * Removes what has outlived its purpose (RETENTION), at most once an hour per server instance. There is no scheduler:
 * the sweep rides on the requests to this API, which every visit to the portfolio page makes.
 */
export async function sweepUserCars(force = false) {
  if (!force && Date.now() - swept < 3_600_000) return;
  swept = Date.now();
  try {
    const sql = db();
    // every stored document, whatever the report's state: a pending report expires with it (the user may upload again)
    await sql`update user_cars set status = case when status = 'pending' then 'expired' else status end,
              contract = null, contract_name = null, contract_deleted_at = now()
              where contract is not null and coalesce(contract_at, created_at) < now() - make_interval(hours => ${DOCUMENT_HOURS})`;
    await sql`delete from user_cars where status = 'awaiting_contract' and created_at < now() - make_interval(days => ${RETENTION.awaitingDays})`;
    await sql`delete from user_cars where status in ('rejected', 'expired')
              and coalesce(reviewed_at, contract_deleted_at, created_at) < now() - make_interval(days => ${RETENTION.decidedDays})`;
    await sql`delete from contract_access where at < now() - make_interval(days => ${RETENTION.accessLogDays})`;
  } catch (err) {
    console.error("retention sweep (npm run db:migrate?)", err);
  }
}

const logAccess = (carId: string, reviewer: string, action: "view" | "ai_check" | "approve" | "reject") =>
  db()`insert into contract_access (car_id, reviewer, action) values (${carId}, ${reviewer}, ${action})`;

export async function handleUserCars(req: IncomingMessage, res: ServerResponse, url: URL) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  await sweepUserCars();
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "fahrzeuge" | "pruefung", id?, sub?]
  const [, area, id, sub] = parts;
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });

  if (area === "fahrzeuge") {
    if (!id && req.method === "GET") {
      const rows = await db()`select ${db()(VISIBLE as unknown as string[])} from user_cars where user_id = ${user.id} and status <> 'withdrawn' order by created_at desc`;
      const [u] = await db()<{ premium_until: Date | null }[]>`select premium_until from users where id = ${user.id}`;
      return sendJson(res, 200, { cars: rows, premiumUntil: u?.premium_until ?? null, premiumMonths: PREMIUM_MONTHS });
    }
    // The demo account is shared and its password is public: a report made with it would show its chassis number to
    // everyone who signs in as demo. Only the development server (where the demo account reviews) takes them.
    if (isDemo(user) && !isAdmin(user) && req.method !== "GET") return sendJson(res, 403, { error: "demo" });
    if (!id && req.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse((await readText(req, 20_000)) || "{}");
      } catch {
        return sendJson(res, 400, { error: "bad request" });
      }
      const { report, errors } = parseReport(body);
      if (Object.keys(errors).length) return sendJson(res, 400, { error: "invalid", fields: errors });
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from user_cars where user_id = ${user.id} and created_at > now() - interval '1 day'`;
      if (n >= 10) return sendJson(res, 429, { error: "too_many" });
      const newId = randomUUID();
      await db()`insert into user_cars ${db()({ id: newId, user_id: user.id, ...report, consent_at: new Date(), consent_version: CONSENT_VERSION })}`;
      return sendJson(res, 201, { id: newId });
    }
    const [own] = id ? await db()<Row[]>`select id, user_id, status, ai_consent from user_cars where id = ${id} and user_id = ${user.id}` : [];
    if (!own) return sendJson(res, 404, { error: "Not found" });
    if (sub === "vertrag" && req.method === "PUT") {
      // an expired report (its document was deleted after a day without a decision) takes a fresh upload
      if (!["awaiting_contract", "pending", "expired"].includes(own.status)) return sendJson(res, 409, { error: "decided" });
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!TYPES.has(type)) return sendJson(res, 415, { error: "type" });
      let file: Buffer;
      try {
        file = await readBuffer(req, MAX_CONTRACT);
      } catch {
        return sendJson(res, 413, { error: "size" });
      }
      if (file.length < 1000) return sendJson(res, 400, { error: "empty" });
      if (!matchesType(type, file)) return sendJson(res, 415, { error: "type" });
      if (!canStoreContracts()) {
        console.error("Dokument abgelehnt: MIP_CONTRACT_KEY fehlt oder ist ungültig (32 Byte, openssl rand -base64 32).");
        return sendJson(res, 503, { error: "storage" });
      }
      // each upload runs an AI check (paid): a budget per user and day, over the 10 reports a day
      if (await overLimit("contract", user.id)) return sendJson(res, 429, { error: "too_many" });
      let name = "dokument";
      try {
        name = s(decodeURIComponent(String(req.headers["x-file-name"] ?? "")), 120) || name;
      } catch {
        return sendJson(res, 400, { error: "bad request" });
      }
      // the status again in the statement: a decision made while the file was uploading stays a decision
      const stored = await db()`update user_cars set contract = ${seal(file, own.id)}, contract_type = ${type}, contract_name = ${name}, contract_size = ${file.length},
                 contract_at = now(), contract_deleted_at = null, status = 'pending', ai_check = null, ai_checked_at = null
                 where id = ${own.id} and status in ('awaiting_contract', 'pending', 'expired')`;
      if (!stored.count) return sendJson(res, 409, { error: "decided" });
      // The AI check takes a while (Opus reads the whole contract): answer now, check in the background. On Vercel
      // waitUntil keeps the function alive for it; elsewhere it is a no-op and the process stays up anyway.
      // Without the user's consent the contract never leaves this server: the reviewer checks it by hand.
      if (own.ai_consent && hasCredentials()) waitUntil(runCheck(own.id).catch((err) => console.error("contract check", err)));
      return sendJson(res, 200, { ok: true });
    }
    if (!sub && req.method === "DELETE") {
      // Withdrawing the consent. An approved car is part of the market values, so it stays, but without anything that
      // leads to a person: no account, no chassis number, no notes (what deleting the account does too,
      // server/auth.ts). The premium it earned goes with it: what is left is what the user's other approved cars
      // give, none without any. Every other report goes with its contract and everything entered.
      if (own.status === "approved") {
        await db().begin(async (tx) => {
          await tx`select 1 from users where id = ${user.id} for update`;
          const done = await tx`update user_cars set user_id = ${"removed:" + randomUUID()}, vin = '', notes = null, appraiser = null, contract = null,
                                contract_name = null, ai_check = null, contract_deleted_at = coalesce(contract_deleted_at, now())
                                where id = ${own.id} and user_id = ${user.id} and status = 'approved'`;
          if (!done.count) return;
          const rest = await tx<{ at: Date }[]>`select coalesce(reviewed_at, created_at) as at from user_cars
                                                where user_id = ${user.id} and status = 'approved' order by 1`;
          await tx`update users set premium_until = ${premiumFrom(rest.map((r) => r.at))} where id = ${user.id}`;
        });
      } else await db()`delete from user_cars where id = ${own.id}`;
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  if (area === "pruefung") {
    if (!isAdmin(user)) return sendJson(res, 403, { error: "forbidden" });
    if (!id && req.method === "GET") {
      const cols = db()([...VISIBLE, "ai_check", "ai_checked_at", "reviewer"] as string[]);
      const open = await db()`select ${cols}, coalesce((select username from users u where u.id = c.user_id), 'Demo-Konto') as username
                              from user_cars c where status = 'pending' order by coalesce(contract_at, created_at)`;
      const done = await db()`select ${cols}, coalesce((select username from users u where u.id = c.user_id), 'Demo-Konto') as username
                              from user_cars c where status in ('approved', 'rejected') order by reviewed_at desc limit 50`;
      return sendJson(res, 200, { open, done });
    }
    const [r] = id ? await db()<Row[]>`select id, user_id, status, contract_type, contract_name, ai_consent from user_cars where id = ${id}` : [];
    if (!r) return sendJson(res, 404, { error: "Not found" });
    if (sub === "vertrag" && req.method === "GET") {
      const [f] = await db()<{ contract: Buffer | null }[]>`select contract from user_cars where id = ${r.id} and ${fresh()}`;
      if (!f?.contract) {
        await sweepUserCars(true); // past its day: remove it now rather than at the next sweep
        return sendJson(res, 410, { error: "deleted" });
      }
      let contract: Buffer;
      try {
        contract = unseal(f.contract, r.id);
      } catch (err) {
        console.error("contract unseal", err);
        return sendJson(res, 500, { error: "key" });
      }
      await logAccess(r.id, user.username, "view");
      res.statusCode = 200;
      res.setHeader("Content-Type", String(r.contract_type));
      res.setHeader("Content-Disposition", `inline; filename="${String(r.contract_name).replace(/[^\w.-]/g, "_")}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // an uploaded file is untrusted content: it renders in the reviewer's viewer with no script, origin or navigation
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      return res.end(contract);
    }
    if (sub === "ki" && req.method === "POST") {
      if (r.status !== "pending") return sendJson(res, 409, { error: "decided" });
      if (!r.ai_consent) return sendJson(res, 409, { error: "no_ai_consent" });
      await logAccess(r.id, user.username, "ai_check");
      await runCheck(r.id);
      const [x] = await db()`select ai_check, ai_checked_at from user_cars where id = ${r.id}`;
      return sendJson(res, 200, x);
    }
    if (!sub && req.method === "POST") {
      if (r.status !== "pending") return sendJson(res, 409, { error: "decided" });
      let body: Record<string, unknown>;
      try {
        body = JSON.parse((await readText(req, 20_000)) || "{}");
      } catch {
        return sendJson(res, 400, { error: "bad request" });
      }
      const decision = body.decision;
      if (decision !== "approve" && decision !== "reject") return sendJson(res, 400, { error: "decision" });
      const note = optS(body.note, 1000);
      if (decision === "reject" && !note) return sendJson(res, 400, { error: "note" });
      // the reviewer may correct what the contract shows differently (variant, price, date, km, year)
      const c = (body.corrections ?? {}) as Record<string, unknown>;
      const fix: Record<string, unknown> = {};
      if (c.variant_id !== undefined) {
        if (!VARIANTS.has(String(c.variant_id))) return sendJson(res, 400, { error: "variant" });
        fix.variant_id = String(c.variant_id);
      }
      // the same bounds as for the user's own entries (parseReport): a slip of the reviewer must not enter the model
      const today = new Date().toISOString().slice(0, 10);
      for (const k of ["price", "km", "build_year"] as const) {
        if (c[k] === undefined || c[k] === "") continue;
        const v = k === "price" ? Number(c[k]) : Math.round(Number(c[k]));
        const ok = k === "price" ? v >= 500 && v <= 100_000_000 : k === "km" ? v >= 0 && v <= 2_000_000 : v >= 1948 && v <= Number(today.slice(0, 4)) + 1;
        if (!Number.isFinite(v) || !ok) return sendJson(res, 400, { error: k });
        fix[k] = v;
      }
      if (c.sale_date !== undefined && c.sale_date !== "") {
        const d = String(c.sale_date);
        if (!realDate(d) || d > today || d < "2000-01-01") return sendJson(res, 400, { error: "sale_date" });
        fix.sale_date = d;
      }
      const decided = await db().begin(async (tx) => {
        // the status in the statement, not only checked before: two reviewers deciding at once must not grant premium twice
        const done = await tx`update user_cars set ${tx({ ...fix, status: decision === "approve" ? "approved" : "rejected", reviewer: user.username, review_note: note })},
                 reviewed_at = now(), contract = null, contract_name = null, contract_deleted_at = now() where id = ${r.id} and status = 'pending'`;
        if (!done.count) return false;
        await tx`insert into contract_access (car_id, reviewer, action) values (${r.id}, ${user.username}, ${decision})`;
        if (decision === "approve")
          await tx`update users set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(months => ${PREMIUM_MONTHS})
                   where id = ${r.user_id}`;
        return true;
      });
      if (!decided) return sendJson(res, 409, { error: "decided" });
      return sendJson(res, 200, { ok: true });
    }
  }
  return sendJson(res, 404, { error: "Not found" });
}
