import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.ts";
import { isAdmin, isDemo, premiumActive } from "./auth.ts";
import { allowanceOf, extraOrders } from "./searchPayments.ts";
import { AGENT_MODEL, MAX_LISTINGS, matchOrder, scanSource, type Candidate, type Market, type MatchResult, type ScanResult, type Usage } from "./searchAgent.ts";

/**
 * The search agent's work queue (db/migrations/017_search_agent.sql). A source or an order with `due_at` in the past
 * is waiting; a run claims it (scan_started_at / run_started_at), does the work and clears `due_at`.
 *
 *   daily run   queueDaily() puts every active source and order in the queue, then runChain() works it off
 *   one step    tick(): up to PARALLEL sources at once, and only when no source is waiting, the orders
 *   chain       on Vercel a function lives a few minutes, so after each step the next one starts as a new request
 *               to /api/suchagent/cron (CRON_SECRET); elsewhere the steps simply follow each other in this process
 *
 * Every source that was read puts the orders back in the queue. An order whose candidates did not change since its
 * last analysis is not sent to Claude again (last_input_hash), so that costs nothing.
 */

/** Sources (or orders) worked on at the same time in one step. */
const PARALLEL = 4;
/** One call's time limit: below a Vercel function's 300 seconds, with room for the database work around it. */
const JOB_MS = Math.min(Math.max(Number(process.env.MIP_AGENT_JOB_SECONDS) || 220, 30), 780) * 1000;
/** A claim older than this belongs to a run that died: the source or order can be claimed again. */
const STALE = "15 minutes";
/** Most cars of the stock that are put before Claude for one order (the newest first). */
const MAX_CANDIDATES = 400;
/** Matches below this score are not kept. */
const MIN_SCORE = 50;
/** Steps one chain may take: 4 sources or orders each. */
const MAX_STEPS = 60;

export const newId = () => randomBytes(9).toString("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const clipOrNull = (v: unknown, n: number) => clip(v, n) || null;
const intIn = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);

export type Source = { id: string; url: string; host: string; name: string; note: string };
export type Order = {
  id: string;
  user_id: string;
  query: string;
  variant_id: string | null;
  variant_title: string | null;
  price_max: number | null;
  year_from: number | null;
  year_to: number | null;
  km_max: number | null;
  lang: string;
  last_input_hash: string | null;
  summary: string | null;
};

// ------------------------------------------------------------------------------------------------------ addresses

/**
 * A source's address as entered by a reviewer: http(s) on a public host name, without credentials or fragment.
 * `host` is the name without "www.": the fetch tool is limited to it and its subdomains.
 */
export function sourceAddress(raw: string): { url: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  const name = u.hostname.toLowerCase().replace(/\.$/, "");
  // a name with a dot and a top-level domain of letters: no "localhost", no IP address
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(name)) return null;
  u.hash = "";
  const url = u.toString();
  return url.length <= 600 ? { url, host: name.replace(/^www\./, "") } : null;
}

/** A listing's address as read from the page: kept only when it is on the source's site (a page cannot plant links elsewhere). */
export function listingAddress(raw: unknown, source: { url: string; host: string }): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim(), source.url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const name = u.hostname.toLowerCase();
  if (name !== source.host && !name.endsWith(`.${source.host}`)) return null;
  u.hash = "";
  const url = u.toString();
  return url.length <= 600 ? url : null;
}

/** A photo's address: https only, from wherever the dealer hosts it (the app loads photos from any https host). */
function imageAddress(raw: unknown, base: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "https:" && u.toString().length <= 600 ? u.toString() : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------------------------------------- sources

type CleanListing = {
  key: string;
  url: string;
  title: string;
  make: string | null;
  model: string | null;
  year: number | null;
  km: number | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  gearbox: string | null;
  body: string | null;
  color: string | null;
  image: string | null;
  details: string;
  sold: boolean;
};

/** What a scan returned, checked field by field: listings on other sites, without a title or beyond the cap are dropped. */
export function cleanScan(result: ScanResult, source: { url: string; host: string }): CleanListing[] {
  const year = new Date().getFullYear() + 1;
  const rows = (Array.isArray(result.listings) ? result.listings : []).flatMap((l) => {
    const url = listingAddress(l?.url, source);
    const title = clip(l?.title, 200);
    if (!url || !title) return [];
    const price = intIn(l.price, 100, 100_000_000);
    const currency = typeof l.currency === "string" && /^[A-Za-z]{3}$/.test(l.currency.trim()) ? l.currency.trim().toUpperCase() : null;
    return [
      {
        key: url,
        url,
        title,
        make: clipOrNull(l.make, 60),
        model: clipOrNull(l.model, 120),
        year: intIn(l.year, 1900, year),
        km: intIn(l.mileage_km, 0, 2_000_000),
        price,
        currency: price === null ? null : currency,
        location: clipOrNull(l.location, 120),
        gearbox: clipOrNull(l.gearbox, 60),
        body: clipOrNull(l.body, 60),
        color: clipOrNull(l.color, 80),
        image: imageAddress(l.image_url, url),
        details: clip(l.details, 900),
        sold: l.sold === true,
      },
    ];
  });
  // several cars on one page share its address: tell them apart by what they are
  const perUrl = new Map<string, number>();
  for (const r of rows) perUrl.set(r.url, (perUrl.get(r.url) ?? 0) + 1);
  const seen = new Set<string>();
  const out: CleanListing[] = [];
  for (const r of rows) {
    if ((perUrl.get(r.url) ?? 0) > 1) r.key = `${r.url}#${sha(`${r.title}|${r.year}|${r.km}`).slice(0, 10)}`;
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
    if (out.length >= MAX_LISTINGS + 50) break;
  }
  return out;
}

/** Stores a scan: new cars, changed prices, and the cars that are no longer offered. Returns how many are for sale. */
export async function applyScan(source: Source, result: ScanResult): Promise<number> {
  const listings = cleanScan(result, source);
  const forSale = listings.filter((l) => !l.sold);
  await db().begin(async (tx) => {
    for (const l of forSale) {
      await tx`
        insert into search_listings (id, source_id, key, url, title, make, model, year, km, price, currency, location, gearbox, body, color, image, details)
        values (${newId()}, ${source.id}, ${l.key}, ${l.url}, ${l.title}, ${l.make}, ${l.model}, ${l.year}, ${l.km}, ${l.price}, ${l.currency},
                ${l.location}, ${l.gearbox}, ${l.body}, ${l.color}, ${l.image}, ${l.details})
        on conflict (source_id, key) do update set
          url = excluded.url, title = excluded.title, make = excluded.make, model = excluded.model, year = excluded.year, km = excluded.km,
          currency = excluded.currency, location = excluded.location, gearbox = excluded.gearbox, body = excluded.body, color = excluded.color,
          image = coalesce(excluded.image, search_listings.image),
          details = case when excluded.details <> '' then excluded.details else search_listings.details end,
          price_prev = case when search_listings.price is not null and excluded.price is not null and search_listings.price <> excluded.price
                            then search_listings.price else search_listings.price_prev end,
          price_changed_at = case when search_listings.price is not null and excluded.price is not null and search_listings.price <> excluded.price
                                  then now() else search_listings.price_changed_at end,
          price = excluded.price, last_seen_at = now(), gone_at = null`;
    }
    const sold = listings.filter((l) => l.sold).map((l) => l.key);
    if (sold.length) await tx`update search_listings set gone_at = coalesce(gone_at, now()) where source_id = ${source.id} and key in ${tx(sold)}`;
    // a complete scan knows the whole stock: what it did not see is gone. An empty one proves nothing (a page that
    // failed to load looks the same), so then, and after an incomplete scan, a car goes only after five days unseen.
    const seen = forSale.map((l) => l.key);
    if (result.complete === true && seen.length) {
      await tx`update search_listings set gone_at = now() where source_id = ${source.id} and gone_at is null and key not in ${tx(seen)}`;
    } else {
      await tx`update search_listings set gone_at = now() where source_id = ${source.id} and gone_at is null and last_seen_at < now() - interval '5 days'`;
    }
    const name = clip(result.dealer_name, 120);
    await tx`update search_sources set name = case when name = '' then ${name} else name end where id = ${source.id}`;
    // the stock changed (or was confirmed): the orders look at it again
    await tx`update search_orders set due_at = now() where active and due_at is null`;
  });
  return forSale.length;
}

async function logRun(kind: "source" | "order", refId: string, started: number, ok: boolean, error: string | null, usage: Usage | null, found: number) {
  try {
    await db()`
      insert into search_runs (kind, ref_id, started_at, ok, error, model, tokens_in, tokens_out, fetches, found)
      values (${kind}, ${refId}, ${new Date(started)}, ${ok}, ${error}, ${usage ? AGENT_MODEL : null}, ${usage?.tokensIn ?? 0}, ${usage?.tokensOut ?? 0}, ${usage?.fetches ?? 0}, ${found})`;
    if (Math.random() < 0.05) await db()`delete from search_runs where started_at < now() - interval '90 days'`;
  } catch (err) {
    console.error("search agent: run log", err);
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function claimSources(limit: number): Promise<Source[]> {
  return db()<Source[]>`
    update search_sources set scan_started_at = now()
    where id in (
      select id from search_sources
      where active and due_at <= now() and (scan_started_at is null or scan_started_at < now() - ${STALE}::interval)
      order by due_at limit ${limit} for update skip locked)
    returning id, url, host, name, note`;
}

/** Reads one claimed source and stores what it found. Never throws: the outcome is on the source's row. */
export async function runSource(source: Source) {
  const started = Date.now();
  try {
    const { result, usage } = await scanSource(source, JOB_MS);
    if (result.readable === false) {
      const note = clip(result.note, 500) || "Der Bestand ließ sich nicht lesen.";
      await db()`update search_sources set due_at = null, scan_started_at = null, scanned_at = now(), scan_ok = false, scan_error = ${note}, scan_note = ${note} where id = ${source.id}`;
      return logRun("source", source.id, started, false, note, usage, 0);
    }
    const found = await applyScan(source, result);
    await db()`update search_sources set due_at = null, scan_started_at = null, scanned_at = now(), scan_ok = true, scan_error = null,
               scan_note = ${clip(result.note, 500) + (result.complete === true ? "" : " (Bestand unvollständig erfasst)")} where id = ${source.id}`;
    await logRun("source", source.id, started, true, null, usage, found);
  } catch (err) {
    console.error("search agent: source", source.url, err);
    await db()`update search_sources set due_at = null, scan_started_at = null, scanned_at = now(), scan_ok = false, scan_error = ${message(err)} where id = ${source.id}`.catch(() => {});
    await logRun("source", source.id, started, false, message(err), null, 0);
  }
}

// --------------------------------------------------------------------------------------------------------- orders

type Stock = Omit<Candidate, "n"> & { id: string };

/** The cars an order is compared with: for sale, from active sources, inside the order's hard limits (a missing figure passes). */
async function candidatesFor(o: Order): Promise<Stock[]> {
  const rows = await db()<
    { id: string; title: string; dealer: string; year: number | null; km: number | null; price: number | null; currency: string | null; price_prev: number | null; location: string | null; gearbox: string | null; body: string | null; color: string | null; details: string; first_seen_at: Date }[]
  >`
    select l.id, l.title, coalesce(nullif(s.name, ''), s.host) as dealer, l.year, l.km, l.price, l.currency, l.price_prev, l.location, l.gearbox, l.body, l.color, l.details, l.first_seen_at
    from search_listings l join search_sources s on s.id = l.source_id
    where l.gone_at is null and s.active
      and (${o.price_max}::int is null or l.price is null or l.currency is distinct from 'EUR' or l.price <= ${o.price_max})
      and (${o.year_from}::int is null or l.year is null or l.year >= ${o.year_from})
      and (${o.year_to}::int is null or l.year is null or l.year <= ${o.year_to})
      and (${o.km_max}::int is null or l.km is null or l.km <= ${o.km_max})
    order by l.first_seen_at desc, l.id limit ${MAX_CANDIDATES}`;
  return rows.map((r) => ({
    id: r.id, title: r.title, dealer: r.dealer, year: r.year, km: r.km, price: r.price, currency: r.currency, price_before: r.price_prev,
    location: r.location, gearbox: r.gearbox, body: r.body, color: r.color, details: r.details, first_seen: r.first_seen_at.toISOString().slice(0, 10),
  }));
}

/** Cartag's market value of the order's variant, where the order names one and the market data is in the database. */
async function marketFor(variantId: string | null): Promise<Market | null> {
  if (!variantId) return null;
  try {
    const [v] = await db()<{ value: number | null; lo: number | null; hi: number | null }[]>`select value, lo, hi from variant_values where variant_id = ${variantId}`;
    return v?.value ? { value: v.value, lo: v.lo, hi: v.hi } : null;
  } catch {
    return null; // market data not imported into this database
  }
}

/** Keeps the matches Claude named that point at a candidate, each once, with a score in range. */
export function cleanMatches(result: MatchResult, count: number) {
  const seen = new Set<number>();
  return (Array.isArray(result.matches) ? result.matches : [])
    .flatMap((m) => {
      const n = intIn(m?.n, 1, count);
      const score = intIn(m?.score, 0, 100);
      if (n === null || score === null || score < MIN_SCORE || seen.has(n)) return [];
      seen.add(n);
      return [{ n, score, reason: clip(m.reason, 600), concerns: clip(m.concerns, 600) }];
    })
    .slice(0, 20);
}

const NO_STOCK = (lang: string) =>
  lang === "en"
    ? "None of the cars currently offered by the dealers we watch falls within the limits of this order. The agent checks again every day."
    : "Im Bestand der Händler, die wir beobachten, steht derzeit kein Fahrzeug innerhalb der Grenzen dieses Auftrags. Der Agent prüft täglich erneut.";

async function claimOrders(limit: number, onlyId?: string): Promise<(Order & { username: string | null; premium_until: Date | null })[]> {
  return db()<(Order & { username: string | null; premium_until: Date | null })[]>`
    update search_orders o set run_started_at = now()
    from (
      select s.id, u.username, u.premium_until from search_orders s left join users u on u.id = s.user_id
      where s.active and (s.run_started_at is null or s.run_started_at < now() - ${STALE}::interval)
        and ${onlyId ? db()`s.id = ${onlyId}` : db()`s.due_at <= now()`}
      order by s.due_at nulls last limit ${limit} for update of s skip locked) c
    where o.id = c.id
    returning o.id, o.user_id, o.query, o.variant_id, o.variant_title, o.price_max, o.year_from, o.year_to, o.km_max, o.lang, o.last_input_hash, o.summary, c.username, c.premium_until`;
}

/** Analyses one claimed order. Never throws: the outcome is on the order's row. */
async function runOrder(o: Order & { username: string | null; premium_until: Date | null }) {
  const started = Date.now();
  const done = (fields: { error?: string | null; hash?: string | null; summary?: string }) =>
    db()`update search_orders set due_at = null, run_started_at = null, last_run_at = now(), last_error = ${fields.error ?? null},
         last_input_hash = coalesce(${fields.hash ?? null}, last_input_hash),
         summary = coalesce(${fields.summary ?? null}, summary), summary_at = case when ${fields.summary ?? null}::text is null then summary_at else now() end
         where id = ${o.id}`;
  try {
    // an account runs as many orders as its plan includes and it subscribed to (server/searchPayments.ts), the oldest
    // first: an order beyond that (premium ran out, a subscription ended) waits, with what it last found
    const owner = { id: o.user_id, username: o.username ?? "" };
    const { allowed } = allowanceOf(isDemo(owner) || isAdmin(owner) || premiumActive(o.premium_until), await extraOrders(o.user_id));
    const [{ ahead }] = await db()<{ ahead: number }[]>`
      select count(*)::int as ahead from search_orders a, search_orders me
      where me.id = ${o.id} and a.user_id = me.user_id and a.active and (a.created_at, a.id) < (me.created_at, me.id)`;
    if (ahead >= allowed) return void (await done({ error: "quota" }));

    const stock = await candidatesFor(o);
    const market = await marketFor(o.variant_id);
    const hash = sha(JSON.stringify([o.query, o.variant_id, o.price_max, o.year_from, o.year_to, o.km_max, o.lang, market?.value ?? null, stock.map((c) => [c.id, c.price])]));
    if (hash === o.last_input_hash && o.summary) return void (await done({})); // nothing new since the last analysis

    if (!stock.length) {
      await db()`update search_matches set current = false where order_id = ${o.id}`;
      return void (await done({ hash, summary: NO_STOCK(o.lang) }));
    }
    const candidates: Candidate[] = stock.map(({ id: _id, ...c }, i) => ({ n: i + 1, ...c }));
    const { result, usage } = await matchOrder(
      { query: o.query, variant: o.variant_title, price_max_eur: o.price_max, year_from: o.year_from, year_to: o.year_to, km_max: o.km_max, lang: o.lang === "en" ? "en" : "de" },
      market,
      candidates,
      JOB_MS,
    );
    const matches = cleanMatches(result, stock.length);
    await db().begin(async (tx) => {
      await tx`update search_matches set current = false where order_id = ${o.id}`;
      for (const m of matches) {
        await tx`
          insert into search_matches (order_id, listing_id, score, reason, concerns) values (${o.id}, ${stock[m.n - 1].id}, ${m.score}, ${m.reason}, ${m.concerns})
          on conflict (order_id, listing_id) do update set score = excluded.score, reason = excluded.reason, concerns = excluded.concerns, current = true, updated_at = now()`;
      }
    });
    await done({ hash, summary: clip(result.summary, 2000) || NO_STOCK(o.lang) });
    await logRun("order", o.id, started, true, null, usage, matches.length);
  } catch (err) {
    console.error("search agent: order", o.id, err);
    await done({ error: message(err) }).catch(() => {});
    await logRun("order", o.id, started, false, message(err), null, 0);
  }
}

/** Analyses one order right away (new or changed), unless a run already has it. */
export async function runOrderNow(id: string) {
  const [o] = await claimOrders(1, id);
  if (o) await runOrder(o);
}

// ---------------------------------------------------------------------------------------------------------- queue

/** The daily run's start: every active source that was not read in the last six hours, and every active order. */
export async function queueDaily() {
  await db()`update search_sources set due_at = now() where active and due_at is null and (scanned_at is null or scanned_at < now() - interval '6 hours')`;
  await db()`update search_orders set due_at = now() where active and due_at is null`;
}

/** One step: the waiting sources first, then the orders. `more` says whether another step should follow. */
export async function tick(): Promise<{ more: boolean }> {
  const sources = await claimSources(PARALLEL);
  if (sources.length) {
    await Promise.all(sources.map(runSource));
    return { more: true };
  }
  const orders = await claimOrders(PARALLEL * 2);
  if (orders.length) {
    await Promise.all(orders.map(runOrder));
    return { more: true };
  }
  return { more: false };
}

/**
 * Works the queue off, step by step. On Vercel each step is its own request (`base` is this site's address), since
 * a function ends after a few minutes; without CRON_SECRET there is no way to call the next one, so the rest waits
 * for the next run. Elsewhere the steps follow each other here.
 */
export async function runChain(base: string, step = 0): Promise<void> {
  const { more } = await tick();
  if (!more || step + 1 >= MAX_STEPS) return;
  if (!process.env.VERCEL) return runChain(base, step + 1);
  const secret = process.env.CRON_SECRET;
  if (!secret) return console.error("search agent: CRON_SECRET fehlt, die Warteschlange wird erst beim nächsten Lauf weiter abgearbeitet");
  // the next step answers at once (202) and works on in its own function
  await fetch(`${base}/api/suchagent/cron?schritt=${step + 1}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) }).catch((err) =>
    console.error("search agent: next step", err),
  );
}
