import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { readText } from "./body.ts";
import { currentUser, isAdmin, isDemo, publicUrl } from "./auth.ts";
import { db } from "./db.ts";
import { overLimit } from "./limits.ts";
import { AGENT_MODEL, PRICE_IN, PRICE_OUT, agentAvailable } from "./searchAgent.ts";
import { newId, queueDaily, runChain, runOrderNow, sourceAddress } from "./searchJobs.ts";
import { SESSION_ID } from "./payments.ts";
import { allowance, confirmSearchSession, searchCheckout, searchOffer, searchPortal, searchSubscriptions } from "./searchPayments.ts";

/**
 * The search agent's API (db/migrations/017_search_agent.sql, the work itself: server/searchJobs.ts).
 *
 * Customers with an account, their search orders and what the agent found for them. How many orders may run:
 * none with lite, three with premium, plus those of the subscription for further orders (server/searchPayments.ts).
 *   GET    /api/suchagent            -> { plan, addon, subscriptions, ai, sources, orders: [{ …, matches: [...] }] }
 *   POST   /api/suchagent            <- { query, title?, variantId?, variantTitle?, priceMax?, yearFrom?, yearTo?, kmMax?, lang? }
 *   PUT    /api/suchagent/:id        <- the same fields, or { active }
 *   DELETE /api/suchagent/:id
 *   POST   /api/suchagent/:id/lauf   analyse this order again now
 *   POST   /api/suchagent/abo/kaufen       { back, lang, quantity } -> { url }: Stripe's payment page for further orders
 *   POST   /api/suchagent/abo/bestaetigen  { session } -> { status }: back from the payment page
 *   POST   /api/suchagent/abo/verwalten    { back, lang } -> { url }: Stripe's customer portal (cancel, invoices)
 *
 * Reviewers (MIP_ADMINS), the dealer pages the agent reads:
 *   GET    /api/suchquellen               -> { sources, runs, usage, orders, ai, cron }
 *   POST   /api/suchquellen               <- { urls: "one address per line", note? }
 *   PUT    /api/suchquellen/:id           <- { name?, note?, active? }
 *   DELETE /api/suchquellen/:id
 *   GET    /api/suchquellen/:id/inserate  -> { listings }
 *   POST   /api/suchquellen/:id/lauf      read this source now
 *   POST   /api/suchquellen/lauf          the daily run, now
 *
 * The daily run: GET /api/suchagent/cron with "Authorization: Bearer <CRON_SECRET>", as Vercel's cron sends it
 * (vercel.json). The answer comes at once; the work goes on after it (waitUntil).
 */

/** Orders one account may keep, running or paused. How many may run is its allowance (server/searchPayments.ts). */
const MAX_KEPT = 40;
/** A match first seen less than this long ago is marked as new. */
const NEW_HOURS = 36;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const j: unknown = JSON.parse((await readText(req, 50_000)) || "{}");
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
/** A whole number in range, null for an empty field, undefined for anything else (a bad request). */
function limit(v: unknown, min: number, max: number): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** In the background: the function stays alive for it on Vercel, elsewhere the process is up anyway. */
const later = (work: Promise<unknown>) => waitUntil(work.catch((err) => console.error("search agent", err)));

export async function handleSearch(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    if (url.pathname === "/api/suchagent/cron") return await cron(req, res, url);
    const user = await currentUser(req);
    if (!user) return sendJson(res, 401, { error: "not signed in" });
    if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
    const [, area, id, sub] = url.pathname.split("/").filter(Boolean); // ["api", "suchagent" | "suchquellen", id?, sub?]
    if (area === "suchquellen") {
      if (!isAdmin(user)) return sendJson(res, 403, { error: "forbidden" });
      return await sources(req, res, user, id, sub);
    }
    return await orders(req, res, user, id, sub);
  } catch (err) {
    // "undefined table/column": the deploy came before the migration (npm run db:migrate:prod)
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "42703") {
      console.error("search agent: Migration 017 fehlt (npm run db:migrate)", err);
      return sendJson(res, 503, { error: "migration" });
    }
    throw err;
  }
}

// ----------------------------------------------------------------------------------------------------------- cron

async function cron(req: IncomingMessage, res: ServerResponse, url: URL) {
  const secret = process.env.CRON_SECRET;
  const given = String(req.headers.authorization ?? "");
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!secret || !timingSafeEqual(hash(given), hash(`Bearer ${secret}`))) return sendJson(res, 401, { error: "unauthorized" });
  // "schritt" is set by a running chain calling its next step (server/searchJobs.ts); without it this is the day's start
  const step = Math.max(0, Math.floor(Number(url.searchParams.get("schritt")) || 0));
  if (!agentAvailable()) return sendJson(res, 503, { error: "Kein Anthropic-API-Zugang konfiguriert" });
  if (step === 0) await queueDaily();
  later(runChain(publicUrl(req), step));
  return sendJson(res, 202, { ok: true, step });
}

// --------------------------------------------------------------------------------------------------------- orders

type OrderFields = { title: string; query: string; variant_id: string | null; variant_title: string | null; price_max: number | null; year_from: number | null; year_to: number | null; km_max: number | null; lang: string };

/** The order form's fields, checked. Returns the name of the first field that is wrong. */
function orderFields(b: Record<string, unknown>): OrderFields | string {
  const query = text(b.query, 1000);
  if (query.length < 10) return "query";
  const price_max = limit(b.priceMax, 1_000, 100_000_000);
  const year_from = limit(b.yearFrom, 1900, 2100);
  const year_to = limit(b.yearTo, 1900, 2100);
  const km_max = limit(b.kmMax, 0, 2_000_000);
  if (price_max === undefined) return "priceMax";
  if (year_from === undefined) return "yearFrom";
  if (year_to === undefined || (year_from !== null && year_to !== null && year_to < year_from)) return "yearTo";
  if (km_max === undefined) return "kmMax";
  const variant_id = text(b.variantId, 100) || null;
  const variant_title = variant_id ? text(b.variantTitle, 160) || null : null;
  const title = text(b.title, 80) || variant_title?.slice(0, 80) || (query.length > 60 ? `${query.slice(0, 59)}…` : query);
  return { title, query, variant_id: variant_title ? variant_id : null, variant_title, price_max, year_from, year_to, km_max, lang: b.lang === "en" ? "en" : "de" };
}

async function listOrders(userId: string, allowed: number) {
  const rows = await db()`
    select id, title, query, variant_id, variant_title, price_max, year_from, year_to, km_max, active, created_at, last_run_at, last_error, summary, summary_at,
           (due_at > now() - interval '10 minutes' or run_started_at > now() - interval '15 minutes') is true as running
    from search_orders where user_id = ${userId} order by created_at, id`;
  const matches = await db()`
    select m.order_id, m.score, m.reason, m.concerns, m.matched_at, m.matched_at > now() - interval '1 hour' * ${NEW_HOURS} as is_new,
           l.id, l.url, l.title, l.year, l.km, l.price, l.currency, l.price_prev, l.price_changed_at, l.location, l.gearbox, l.body, l.color, l.image, l.details,
           l.first_seen_at, l.gone_at is not null as gone, coalesce(nullif(s.name, ''), s.host) as dealer
    from search_matches m join search_listings l on l.id = m.listing_id join search_sources s on s.id = l.source_id
    where m.current and m.order_id in (select id from search_orders where user_id = ${userId})
    order by m.score desc, l.first_seen_at desc`;
  // the oldest running orders fill the allowance; the rest wait for a free place (server/searchJobs.ts decides the same way)
  const within = new Set(rows.filter((o) => o.active).slice(0, allowed).map((o) => o.id));
  return rows.map((o) => ({
    waiting: o.active && !within.has(o.id),
    id: o.id, title: o.title, query: o.query, variantId: o.variant_id, variantTitle: o.variant_title, priceMax: o.price_max, yearFrom: o.year_from, yearTo: o.year_to, kmMax: o.km_max,
    active: o.active, createdAt: o.created_at, lastRunAt: o.last_run_at, running: o.active && o.running && within.has(o.id), error: o.last_error, summary: o.summary, summaryAt: o.summary_at,
    matches: matches
      .filter((m) => m.order_id === o.id)
      .map((m) => ({
        id: m.id, score: m.score, reason: m.reason, concerns: m.concerns, matchedAt: m.matched_at, isNew: m.is_new, url: m.url, title: m.title, year: m.year, km: m.km, price: m.price,
        currency: m.currency, pricePrev: m.price_prev, priceChangedAt: m.price_changed_at, location: m.location, gearbox: m.gearbox, body: m.body, color: m.color, image: m.image,
        details: m.details, firstSeenAt: m.first_seen_at, gone: m.gone, dealer: m.dealer,
      })),
  }));
}

async function orders(req: IncomingMessage, res: ServerResponse, user: { id: string; username: string }, id: string | undefined, sub: string | undefined) {
  if (!id && req.method === "GET") {
    const plan = await allowance(user);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from search_sources where active`;
    return sendJson(res, 200, {
      plan,
      // what one further order costs; null where the subscription is not on sale
      addon: isDemo(user) ? null : await searchOffer(),
      subscriptions: isDemo(user) ? [] : (await searchSubscriptions(user.id)).map(({ quantity, status, until }) => ({ quantity, status, until })),
      ai: agentAvailable(),
      sources: n,
      orders: await listOrders(user.id, plan.allowed),
    });
  }
  // the shared demo account keeps and buys nothing; only the development server, where it reviews, takes its orders
  if (isDemo(user) && (!isAdmin(user) || id === "abo")) return sendJson(res, 403, { error: "demo" });
  if (id === "abo") return await addon(req, res, user, sub);

  /** Running orders of the account next to `except`, and whether one more may run. */
  const room = async (except = "") => {
    const { allowed } = await allowance(user);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from search_orders where user_id = ${user.id} and active and id <> ${except}`;
    return n < allowed;
  };

  if (!id && req.method === "POST") {
    const body = await readBody(req);
    const fields = body && orderFields(body);
    if (!fields || typeof fields === "string") return sendJson(res, 400, { error: "field", field: fields ?? "body" });
    // the lock that counts: none with lite, three with premium, plus what the account subscribed to
    if (!(await room())) return sendJson(res, 409, { error: "max" });
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from search_orders where user_id = ${user.id}`;
    if (n >= MAX_KEPT) return sendJson(res, 409, { error: "kept" });
    if (await overLimit("suchauftrag", user.id)) return sendJson(res, 429, { error: "too_many" });
    const orderId = newId();
    await db()`insert into search_orders ${db()({ id: orderId, user_id: user.id, ...fields })}`;
    if (agentAvailable()) later(runOrderNow(orderId));
    return sendJson(res, 200, { ok: true, id: orderId });
  }
  if (!id) return sendJson(res, 404, { error: "Not found" });
  const [own] = await db()<{ id: string }[]>`select id from search_orders where id = ${id} and user_id = ${user.id}`;
  if (!own) return sendJson(res, 404, { error: "Not found" });

  if (!sub && req.method === "DELETE") {
    await db()`delete from search_orders where id = ${id}`;
    return sendJson(res, 200, { ok: true });
  }
  if (!sub && req.method === "PUT") {
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "field", field: "body" });
    if (typeof body.active === "boolean" && body.query === undefined) {
      if (body.active && !(await room(id))) return sendJson(res, 409, { error: "max" });
      // switched back on: the order looks at today's stock right away
      await db()`update search_orders set active = ${body.active}, due_at = case when ${body.active} then now() else null end, updated_at = now() where id = ${id}`;
      if (body.active && agentAvailable()) later(runOrderNow(id));
      return sendJson(res, 200, { ok: true });
    }
    const fields = orderFields(body);
    if (typeof fields === "string") return sendJson(res, 400, { error: "field", field: fields });
    if (await overLimit("suchauftrag", user.id)) return sendJson(res, 429, { error: "too_many" });
    // a changed order starts over: its old matches answered a different question
    await db().begin(async (tx) => {
      await tx`update search_orders set ${tx(fields)}, due_at = now(), updated_at = now(), last_input_hash = null, last_error = null, summary = null, summary_at = null where id = ${id}`;
      await tx`delete from search_matches where order_id = ${id}`;
    });
    if (agentAvailable()) later(runOrderNow(id));
    return sendJson(res, 200, { ok: true });
  }
  if (sub === "lauf" && req.method === "POST") {
    if (!agentAvailable()) return sendJson(res, 503, { error: "ai" });
    if (await overLimit("suchauftrag", user.id)) return sendJson(res, 429, { error: "too_many" });
    await db()`update search_orders set due_at = now(), last_input_hash = null where id = ${id} and active`;
    later(runOrderNow(id));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: "Not found" });
}

/** The subscription for further orders: to Stripe's payment page, back from it, and to Stripe's customer portal. */
async function addon(req: IncomingMessage, res: ServerResponse, user: { id: string; username: string }, action: string | undefined) {
  if (req.method !== "POST") return sendJson(res, 404, { error: "Not found" });
  const body = await readBody(req);
  if (!body) return sendJson(res, 400, { error: "bad request" });
  if (await overLimit("checkout", user.id)) return sendJson(res, 429, { error: "too_many" });
  try {
    if (action === "kaufen") {
      const url = await searchCheckout(req, user, body);
      return url ? sendJson(res, 200, { url }) : sendJson(res, 503, { error: "unavailable" });
    }
    if (action === "verwalten") {
      const url = await searchPortal(req, user, body);
      return url ? sendJson(res, 200, { url }) : sendJson(res, 404, { error: "none" });
    }
    if (action === "bestaetigen") {
      const session = typeof body.session === "string" ? body.session : "";
      if (!SESSION_ID.test(session)) return sendJson(res, 400, { error: "session" });
      // somebody else's session id (from a shared link, say) grants nothing and tells nothing
      const status = await confirmSearchSession(session, user.id);
      if (!status) return sendJson(res, 404, { error: "Not found" });
      // the orders that waited for a free place start now
      if (status === "paid" && agentAvailable()) later(runChain(publicUrl(req)));
      return sendJson(res, 200, { status });
    }
  } catch (err) {
    console.error("stripe (Suchaufträge)", err);
    return sendJson(res, 502, { error: "stripe" });
  }
  return sendJson(res, 404, { error: "Not found" });
}

// -------------------------------------------------------------------------------------------------------- sources

async function sources(req: IncomingMessage, res: ServerResponse, user: { id: string; username: string }, id: string | undefined, sub: string | undefined) {
  const sql = db();
  if (!id && req.method === "GET") {
    const rows = await sql`
      select s.id, s.url, s.host, s.name, s.note, s.active, s.created_by, s.created_at, s.scanned_at, s.scan_ok, s.scan_error, s.scan_note,
             (s.active and (s.due_at > now() - interval '10 minutes' or s.scan_started_at > now() - interval '15 minutes')) is true as running,
             (select count(*)::int from search_listings l where l.source_id = s.id and l.gone_at is null) as listings,
             (select count(*)::int from search_listings l where l.source_id = s.id and l.gone_at is not null) as gone
      from search_sources s order by s.created_at desc`;
    const runs = await sql`
      select r.id, r.kind, r.started_at, extract(epoch from r.finished_at - r.started_at)::int as seconds, r.ok, r.error, r.tokens_in, r.tokens_out, r.fetches, r.found,
             coalesce(nullif(s.name, ''), s.host, o.title, '–') as label
      from search_runs r left join search_sources s on r.kind = 'source' and s.id = r.ref_id left join search_orders o on r.kind = 'order' and o.id = r.ref_id
      order by r.started_at desc limit 40`;
    const [usage] = await sql<{ runs: number; tokens_in: number; tokens_out: number }[]>`
      select count(*)::int as runs, coalesce(sum(tokens_in), 0)::bigint::float8 as tokens_in, coalesce(sum(tokens_out), 0)::bigint::float8 as tokens_out
      from search_runs where started_at > now() - interval '30 days'`;
    const [o] = await sql<{ active: number; users: number }[]>`select count(*) filter (where active)::int as active, count(distinct user_id)::int as users from search_orders`;
    return sendJson(res, 200, {
      ai: agentAvailable(),
      cron: Boolean(process.env.CRON_SECRET),
      model: AGENT_MODEL,
      orders: o,
      usage: { runs: usage.runs, tokensIn: usage.tokens_in, tokensOut: usage.tokens_out, usd: (usage.tokens_in * PRICE_IN + usage.tokens_out * PRICE_OUT) / 1_000_000 },
      sources: rows.map((s) => ({
        id: s.id, url: s.url, host: s.host, name: s.name, note: s.note, active: s.active, createdBy: s.created_by, createdAt: s.created_at, scannedAt: s.scanned_at, scanOk: s.scan_ok,
        scanError: s.scan_error, scanNote: s.scan_note, running: s.running, listings: s.listings, gone: s.gone,
      })),
      runs: runs.map((r) => ({
        id: String(r.id), kind: r.kind, label: r.label, startedAt: r.started_at, seconds: r.seconds, ok: r.ok, error: r.error, tokensIn: r.tokens_in, tokensOut: r.tokens_out,
        fetches: r.fetches, found: r.found, usd: (r.tokens_in * PRICE_IN + r.tokens_out * PRICE_OUT) / 1_000_000,
      })),
    });
  }
  if (!id && req.method === "POST") {
    const body = await readBody(req);
    const lines = text(body?.urls, 20_000).split(/[\s,;]+/).filter(Boolean).slice(0, 100);
    if (!lines.length) return sendJson(res, 400, { error: "urls" });
    const note = text(body?.note, 300);
    const skipped: { line: string; reason: "invalid" | "exists" }[] = [];
    let added = 0;
    for (const line of lines) {
      const a = sourceAddress(line);
      if (!a) {
        skipped.push({ line: line.slice(0, 200), reason: "invalid" });
        continue;
      }
      const inserted = await sql`
        insert into search_sources (id, url, host, note, created_by) values (${newId()}, ${a.url}, ${a.host}, ${note}, ${user.username})
        on conflict (lower(url)) do nothing returning id`;
      if (inserted.length) added++;
      else skipped.push({ line: a.url, reason: "exists" });
    }
    // a new source is in the queue from its first second: read it now
    if (added && agentAvailable()) later(runChain(publicUrl(req)));
    return sendJson(res, 200, { ok: true, added, skipped });
  }
  if (id === "lauf" && !sub && req.method === "POST") {
    if (!agentAvailable()) return sendJson(res, 503, { error: "ai" });
    await sql`update search_sources set due_at = now() where active and due_at is null`;
    await sql`update search_orders set due_at = now() where active and due_at is null`;
    later(runChain(publicUrl(req)));
    return sendJson(res, 200, { ok: true });
  }
  if (!id) return sendJson(res, 404, { error: "Not found" });
  const [source] = await sql<{ id: string }[]>`select id from search_sources where id = ${id}`;
  if (!source) return sendJson(res, 404, { error: "Not found" });

  if (sub === "inserate" && req.method === "GET") {
    const listings = await sql`
      select id, url, title, year, km, price, currency, price_prev, location, details, first_seen_at, last_seen_at, gone_at
      from search_listings where source_id = ${id} order by gone_at nulls first, first_seen_at desc, title limit 400`;
    return sendJson(res, 200, {
      listings: listings.map((l) => ({
        id: l.id, url: l.url, title: l.title, year: l.year, km: l.km, price: l.price, currency: l.currency, pricePrev: l.price_prev, location: l.location, details: l.details,
        firstSeenAt: l.first_seen_at, lastSeenAt: l.last_seen_at, goneAt: l.gone_at,
      })),
    });
  }
  if (sub === "lauf" && req.method === "POST") {
    if (!agentAvailable()) return sendJson(res, 503, { error: "ai" });
    await sql`update search_sources set due_at = now() where id = ${id} and active`;
    later(runChain(publicUrl(req)));
    return sendJson(res, 200, { ok: true });
  }
  if (!sub && req.method === "PUT") {
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "bad request" });
    if (typeof body.name === "string") await sql`update search_sources set name = ${text(body.name, 120)} where id = ${id}`;
    if (typeof body.note === "string") await sql`update search_sources set note = ${text(body.note, 300)} where id = ${id}`;
    // a paused source keeps its cars in the database, but the orders no longer see them
    if (typeof body.active === "boolean") {
      await sql`update search_sources set active = ${body.active}, due_at = case when ${body.active} then now() else null end where id = ${id}`;
      await sql`update search_orders set due_at = now() where active and due_at is null`;
      if (agentAvailable()) later(runChain(publicUrl(req)));
    }
    return sendJson(res, 200, { ok: true });
  }
  if (!sub && req.method === "DELETE") {
    await sql`delete from search_sources where id = ${id}`; // its listings and their matches go with it
    await sql`update search_orders set due_at = now() where active and due_at is null`;
    if (agentAvailable()) later(runChain(publicUrl(req)));
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: "Not found" });
}
