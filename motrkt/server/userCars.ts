import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import variantIds from "../scripts/market/variant_ids.json" with { type: "json" };
import { readBuffer, readText } from "./body.ts";
import { checkContract, type Entered } from "./contractCheck.ts";
import { currentUser, isAdmin } from "./auth.ts";
import { db } from "./db.ts";

/**
 * "Mein Fahrzeug melden": users enter a car they bought or sold and upload the purchase contract
 * (db/migrations/004_user_cars.sql). Claude pre-checks the contract, a reviewer (MIP_ADMINS) approves or rejects it.
 * Either decision deletes the contract. Approval gives the user PREMIUM_MONTHS of free premium access; the car's data
 * enter the market model on the next daily run (scripts/db/export-user-cars.ts).
 *
 *   GET    /api/fahrzeuge                     the user's own reports
 *   POST   /api/fahrzeuge                     new report (JSON) -> { id }
 *   PUT    /api/fahrzeuge/:id/vertrag         the contract (PDF, JPEG, PNG or WebP as the raw body, at most 4 MB)
 *   DELETE /api/fahrzeuge/:id                 withdraw a report that has not been decided yet
 *   GET    /api/pruefung                      reviewers: open reports and the latest decisions
 *   GET    /api/pruefung/:id/vertrag          reviewers: the contract
 *   POST   /api/pruefung/:id/ki               reviewers: run the AI check again
 *   POST   /api/pruefung/:id                  reviewers: { decision: "approve" | "reject", note, corrections }
 */

export const PREMIUM_MONTHS = 12;
const MAX_CONTRACT = 4 * 1024 * 1024; // a Vercel function takes at most 4.5 MB per request
const TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const VARIANTS = new Map((variantIds as [string, string][]).map(([id, name]) => [id, name]));
const CURRENCIES = new Set(["EUR", "CHF", "GBP", "USD", "SEK", "DKK", "NOK", "CAD"]);
const COUNTRY = /^[A-Z]{2}$/;
const VIN = /^[A-HJ-NPR-Z0-9 -]{5,20}$/i; // older Porsches have short chassis numbers (e.g. 9113101234)

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
const optS = (v: unknown, max = 200) => s(v, max) || null;
const optB = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Validated report from the form, or the field errors. */
export function parseReport(b: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const e: Record<string, string> = {};
  const role = s(b.role);
  if (role !== "kauf" && role !== "verkauf") e.role = "role";
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sale_date) || sale_date > today || sale_date < "2000-01-01") e.sale_date = "date";
  const country = s(b.country).toUpperCase();
  if (!COUNTRY.test(country)) e.country = "country";
  const counterparty = s(b.counterparty);
  if (!["privat", "haendler", "auktion"].includes(counterparty)) e.counterparty = "counterparty";
  const steering = optS(b.steering);
  if (steering && steering !== "links" && steering !== "rechts") e.steering = "steering";
  const condition = optS(b.condition, 4);
  if (condition && !/^[1-5][+-]?$/.test(condition)) e.condition = "condition";
  if (b.consent !== true) e.consent = "consent";
  const report = {
    role, variant_id, title, build_year, vin, km, price, currency, sale_date, country, counterparty,
    body: optS(b.body, 40), gearbox: optS(b.gearbox, 40), steering, color_ext: optS(b.color_ext, 60), color_int: optS(b.color_int, 60),
    condition, matching_numbers: optB(b.matching_numbers), accident_free: optB(b.accident_free), notes: optS(b.notes, 2000),
  };
  return { report, errors: e };
}

/** Columns the user and the reviewer see (never the contract itself). */
const VISIBLE = [
  "id", "status", "created_at", "role", "variant_id", "title", "build_year", "vin", "km", "price", "currency", "sale_date", "country",
  "counterparty", "body", "gearbox", "steering", "color_ext", "color_int", "condition", "matching_numbers", "accident_free", "notes",
  "contract_name", "contract_type", "contract_size", "contract_deleted_at", "reviewed_at", "review_note",
] as const;

function entered(r: Row): Entered {
  return {
    role: r.role === "kauf" ? "Nutzer hat gekauft" : "Nutzer hat verkauft",
    title: String(r.title), variantName: VARIANTS.get(String(r.variant_id)) ?? String(r.variant_id),
    build_year: Number(r.build_year), vin: String(r.vin), km: Number(r.km), price: Number(r.price), currency: String(r.currency),
    sale_date: String(r.sale_date instanceof Date ? r.sale_date.toISOString().slice(0, 10) : r.sale_date), country: String(r.country),
    counterparty: String(r.counterparty),
  };
}

/** Runs the AI check for a report with a contract and stores the result (or the error) with it. */
async function runCheck(id: string) {
  const [r] = await db()<Row[]>`select * from user_cars where id = ${id} and contract is not null`;
  if (!r) return;
  let result: unknown;
  try {
    result = await checkContract(r.contract as Buffer, String(r.contract_type), entered(r));
  } catch (err) {
    console.error("contract check", err);
    result = { error: err instanceof Error ? err.message : "KI-Prüfung fehlgeschlagen" };
  }
  await db()`update user_cars set ai_check = ${db().json(result as never)}, ai_checked_at = now() where id = ${id}`;
}

export async function handleUserCars(req: IncomingMessage, res: ServerResponse, url: URL) {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "fahrzeuge" | "pruefung", id?, sub?]
  const [, area, id, sub] = parts;
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });

  if (area === "fahrzeuge") {
    if (!id && req.method === "GET") {
      const rows = await db()`select ${db()(VISIBLE as unknown as string[])} from user_cars where user_id = ${user.id} and status <> 'withdrawn' order by created_at desc`;
      const [u] = await db()<{ premium_until: Date | null }[]>`select premium_until from users where id = ${user.id}`;
      return sendJson(res, 200, { cars: rows, premiumUntil: u?.premium_until ?? null, premiumMonths: PREMIUM_MONTHS });
    }
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
      await db()`insert into user_cars ${db()({ id: newId, user_id: user.id, ...report })}`;
      return sendJson(res, 201, { id: newId });
    }
    const [own] = id ? await db()<Row[]>`select id, user_id, status from user_cars where id = ${id} and user_id = ${user.id}` : [];
    if (!own) return sendJson(res, 404, { error: "Not found" });
    if (sub === "vertrag" && req.method === "PUT") {
      if (own.status !== "awaiting_contract" && own.status !== "pending") return sendJson(res, 409, { error: "decided" });
      const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!TYPES.has(type)) return sendJson(res, 415, { error: "type" });
      let file: Buffer;
      try {
        file = await readBuffer(req, MAX_CONTRACT);
      } catch {
        return sendJson(res, 413, { error: "size" });
      }
      if (file.length < 1000) return sendJson(res, 400, { error: "empty" });
      const name = s(decodeURIComponent(String(req.headers["x-file-name"] ?? "")), 120) || "vertrag";
      await db()`update user_cars set contract = ${file}, contract_type = ${type}, contract_name = ${name}, contract_size = ${file.length},
                 status = 'pending', ai_check = null, ai_checked_at = null where id = ${own.id}`;
      await runCheck(own.id); // a few seconds; the reviewer can repeat it
      return sendJson(res, 200, { ok: true });
    }
    if (!sub && req.method === "DELETE") {
      if (own.status !== "awaiting_contract" && own.status !== "pending") return sendJson(res, 409, { error: "decided" });
      await db()`update user_cars set status = 'withdrawn', contract = null, contract_deleted_at = now() where id = ${own.id}`;
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: "Not found" });
  }

  if (area === "pruefung") {
    if (!isAdmin(user)) return sendJson(res, 403, { error: "forbidden" });
    if (!id && req.method === "GET") {
      const cols = db()([...VISIBLE, "ai_check", "ai_checked_at", "reviewer"] as string[]);
      const open = await db()`select ${cols}, coalesce((select username from users u where u.id = c.user_id), 'Demo-Konto') as username
                              from user_cars c where status = 'pending' order by created_at`;
      const done = await db()`select ${cols}, coalesce((select username from users u where u.id = c.user_id), 'Demo-Konto') as username
                              from user_cars c where status in ('approved', 'rejected') order by reviewed_at desc limit 50`;
      return sendJson(res, 200, { open, done });
    }
    const [r] = id ? await db()<Row[]>`select id, user_id, status, contract_type, contract_name from user_cars where id = ${id}` : [];
    if (!r) return sendJson(res, 404, { error: "Not found" });
    if (sub === "vertrag" && req.method === "GET") {
      const [f] = await db()<{ contract: Buffer | null }[]>`select contract from user_cars where id = ${r.id}`;
      if (!f?.contract) return sendJson(res, 410, { error: "deleted" });
      res.statusCode = 200;
      res.setHeader("Content-Type", String(r.contract_type));
      res.setHeader("Content-Disposition", `inline; filename="${String(r.contract_name).replace(/[^\w.-]/g, "_")}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.end(f.contract);
    }
    if (sub === "ki" && req.method === "POST") {
      if (r.status !== "pending") return sendJson(res, 409, { error: "decided" });
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
      for (const k of ["price", "km", "build_year"] as const) {
        if (c[k] === undefined || c[k] === "") continue;
        const v = Number(c[k]);
        if (!Number.isFinite(v) || v < 0) return sendJson(res, 400, { error: k });
        fix[k] = k === "price" ? v : Math.round(v);
      }
      if (c.sale_date !== undefined && c.sale_date !== "") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.sale_date))) return sendJson(res, 400, { error: "sale_date" });
        fix.sale_date = String(c.sale_date);
      }
      await db().begin(async (tx) => {
        if (Object.keys(fix).length) await tx`update user_cars set ${tx(fix)} where id = ${r.id}`;
        await tx`update user_cars set status = ${decision === "approve" ? "approved" : "rejected"}, reviewer = ${user.username},
                 reviewed_at = now(), review_note = ${note}, contract = null, contract_deleted_at = now() where id = ${r.id}`;
        if (decision === "approve")
          await tx`update users set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(months => ${PREMIUM_MONTHS})
                   where id = ${r.user_id}`;
      });
      return sendJson(res, 200, { ok: true });
    }
  }
  return sendJson(res, 404, { error: "Not found" });
}
