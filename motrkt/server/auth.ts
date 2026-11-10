import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";

/**
 * Accounts with username and password. Without a valid session the server hands out nothing but the sign-in page
 * (/anmelden) and /api/auth/*: the app, its data and the other APIs stay closed.
 *
 * Storage: MOTRKT_DATA_DIR (default motrkt/.data, not in git) – users.json (scrypt hash + salt per user, never the
 * password) and sessions.json (only the SHA-256 of each session token). Sessions last 30 days.
 */

const DIR = process.env.MOTRKT_DATA_DIR ?? fileURLToPath(new URL("../.data", import.meta.url));
const USERS = join(DIR, "users.json");
const SESSIONS = join(DIR, "sessions.json");
const COOKIE = "motrkt_sid";
const SESSION_DAYS = 30;
const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
const PW_MIN = 8;
const PW_MAX = 200;

type User = { id: string; username: string; salt: string; hash: string; created: string };
type Session = { userId: string; expires: number };

function load<T>(file: string, empty: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : empty;
  } catch {
    return empty;
  }
}
function save(file: string, data: unknown) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  renameSync(tmp, file); // atomic: a crash never leaves half a file
}

// Shared demo account (server/demo-account.json, password in README). The repository is public, so it is on in
// development only; the production server enables it with MOTRKT_DEMO_ACCOUNT=1.
let demo: User | null = null;
export function enableDemoAccount() {
  demo = JSON.parse(readFileSync(fileURLToPath(new URL("./demo-account.json", import.meta.url)), "utf8")) as User;
}
const users = () => {
  const stored = load<User[]>(USERS, []);
  return demo ? [demo, ...stored] : stored;
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function hashPassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// ------------------------------------------------------------------------------------------------ sessions
function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const isHttps = (req: IncomingMessage) => req.socket instanceof TLSSocket || req.headers["x-forwarded-proto"] === "https";

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`,
  );
}

function startSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const all = load<Record<string, Session>>(SESSIONS, {});
  const now = Date.now();
  for (const [k, s] of Object.entries(all)) if (s.expires < now) delete all[k];
  all[sha(token)] = { userId, expires: now + SESSION_DAYS * 86_400_000 };
  save(SESSIONS, all);
  setCookie(req, res, token, SESSION_DAYS * 86_400);
}

export function currentUser(req: IncomingMessage): { id: string; username: string } | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const s = load<Record<string, Session>>(SESSIONS, {})[sha(token)];
  if (!s || s.expires < Date.now()) return null;
  const u = users().find((x) => x.id === s.userId);
  return u ? { id: u.id, username: u.username } : null;
}

// ------------------------------------------------------------------------------------------------ brute-force brake
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
const MAX_FAILS = 8;
function blocked(key: string) {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW);
  failures.set(key, list);
  return list.length >= MAX_FAILS;
}
const fail = (key: string) => failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
const clientIp = (req: IncomingMessage) => req.socket.remoteAddress ?? "?";

// ------------------------------------------------------------------------------------------------ API
function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) throw new Error("json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 10_000) throw new Error("size");
    chunks.push(c as Buffer);
  }
  const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  return v && typeof v === "object" ? v : {};
}

/** POSTs must come from this site (another site cannot sign people in or out). */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname;
  if (path === "/api/auth/me" && req.method === "GET") {
    const u = currentUser(req);
    return u ? sendJson(res, 200, { username: u.username }) : sendJson(res, 401, { error: "not signed in" });
  }
  if (req.method !== "POST" || !sameOrigin(req)) return sendJson(res, 404, { error: "Not found" });

  if (path === "/api/auth/logout") {
    const token = readCookie(req, COOKIE);
    if (token) {
      const all = load<Record<string, Session>>(SESSIONS, {});
      delete all[sha(token)];
      save(SESSIONS, all);
    }
    setCookie(req, res, "", 0);
    return sendJson(res, 200, { ok: true });
  }

  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIp(req);

  if (path === "/api/auth/register") {
    if (blocked("reg:" + ip)) return sendJson(res, 429, { error: "too_many" });
    if (!USERNAME.test(username)) return sendJson(res, 400, { error: "username_invalid" });
    if (password.length < PW_MIN || password.length > PW_MAX) return sendJson(res, 400, { error: "password_length" });
    if (password.toLowerCase() === username.toLowerCase()) return sendJson(res, 400, { error: "password_is_username" });
    const all = users();
    if (all.some((u) => u.username.toLowerCase() === username.toLowerCase())) return sendJson(res, 409, { error: "username_taken" });
    const salt = randomBytes(16).toString("hex");
    const hash = (await hashPassword(password, salt)).toString("hex");
    const user: User = { id: randomUUID(), username, salt, hash, created: new Date().toISOString() };
    save(USERS, [...load<User[]>(USERS, []), user]); // the demo account is never written to the store
    fail("reg:" + ip); // counts sign-ups too: at most a few new accounts per address and quarter hour
    startSession(req, res, user.id);
    return sendJson(res, 201, { username });
  }

  if (path === "/api/auth/login") {
    const key = "login:" + username.toLowerCase();
    if (blocked(key) || blocked("ip:" + ip)) return sendJson(res, 429, { error: "too_many" });
    const user = users().find((u) => u.username.toLowerCase() === username.toLowerCase());
    // hash even for unknown names, so the answer time does not reveal which names exist
    const salt = user?.salt ?? "0000000000000000";
    const got = await hashPassword(password.slice(0, PW_MAX), salt);
    if (!user || !timingSafeEqual(got, Buffer.from(user.hash, "hex"))) {
      fail(key);
      fail("ip:" + ip);
      return sendJson(res, 401, { error: "wrong_credentials" });
    }
    failures.delete(key);
    startSession(req, res, user.id);
    return sendJson(res, 200, { username: user.username });
  }
  return sendJson(res, 404, { error: "Not found" });
}

// ------------------------------------------------------------------------------------------------ gate
const OPEN = new Set(["/anmelden", "/favicon.svg"]);

/** Handles the request if it must not reach the app (sign-in page, auth API, or no session). Returns true then. */
export async function authGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuth(req, res, url);
    return true;
  }
  if (url.pathname === "/anmelden") {
    if (currentUser(req)) return redirect(res, safeNext(url.searchParams.get("next")));
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.end(LOGIN_PAGE);
    return true;
  }
  if (OPEN.has(url.pathname) || currentUser(req)) return false;
  if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
    return redirect(res, "/anmelden" + (url.pathname !== "/" ? "?next=" + encodeURIComponent(url.pathname + url.search) : ""));
  }
  sendJson(res, 401, { error: "not signed in" });
  return true;
}

function redirect(res: ServerResponse, to: string) {
  res.statusCode = 302;
  res.setHeader("Location", to);
  res.setHeader("Cache-Control", "no-store");
  res.end();
  return true;
}
/** Only paths on this site ("/markt/…"), never "//other.site" or "https://…". */
const safeNext = (n: string | null) => (n && /^\/(?![/\\])/.test(n) ? n : "/");

// ------------------------------------------------------------------------------------------------ sign-in page
// Standalone page (no app bundle): the app and its data load only after sign-in.
const LOGIN_PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300..600&family=Libre+Caslon+Display&family=Libre+Caslon+Text&display=swap" rel="stylesheet" />
<meta name="theme-color" content="#efe7d7" />
<title>Anmelden – MOTRKT</title>
<style>
  :root { --bg:#efe7d7; --panel:#f7f2e8; --line:#dccfb8; --line2:#c6b699; --ink:#3a2a1d; --muted:#78624d; --faint:#a38f77; --gold:#8b6232; --down:#9a3b2c; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--bg); color:var(--ink); font:15px/1.5 "Jost","Futura","Century Gothic",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  main { width:100%; max-width:380px; }
  .logo { font-family:"Libre Caslon Display",Georgia,serif; font-size:30px; letter-spacing:.18em; text-align:center; margin:0 0 6px; }
  .tag { text-align:center; color:var(--muted); font-size:13.5px; margin:0 0 28px; }
  .card { background:var(--panel); border:1px solid var(--line); padding:26px 24px 22px; }
  .tabs { display:flex; border-bottom:1px solid var(--line); margin:-4px 0 20px; }
  .tabs button { flex:1; background:none; border:0; border-bottom:1.5px solid transparent; margin-bottom:-1px; padding:8px 0 10px;
                 font:inherit; font-size:14px; letter-spacing:.06em; color:var(--faint); cursor:pointer; }
  .tabs button[aria-selected="true"] { color:var(--ink); border-color:var(--ink); }
  label { display:block; font-size:12.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0 0 6px; }
  input { width:100%; font:inherit; font-size:16px; color:var(--ink); background:#fbf8f2; border:1px solid var(--line2); padding:10px 12px; margin:0 0 4px; border-radius:0; }
  input:focus { outline:1.5px solid var(--ink); outline-offset:0; }
  .hint { font-size:12.5px; color:var(--faint); margin:0 0 16px; min-height:1em; }
  .submit { width:100%; margin-top:6px; padding:12px; background:var(--ink); color:var(--bg); border:0; font:inherit; font-size:14px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }
  .submit:hover { background:var(--gold); }
  .submit:disabled { opacity:.6; cursor:default; }
  .err { color:var(--down); font-size:14px; margin:12px 0 0; min-height:1.2em; }
  .lang { text-align:center; margin-top:18px; font-size:12.5px; letter-spacing:.08em; }
  .lang button { background:none; border:0; font:inherit; color:var(--faint); cursor:pointer; padding:2px 4px; }
  .lang button[aria-pressed="true"] { color:var(--ink); }
</style>
</head>
<body>
<main>
  <h1 class="logo">MOTRKT</h1>
  <p class="tag" data-de="Marktintelligenz für klassische Sportwagen" data-en="Market intelligence for classic sports cars"></p>
  <div class="card">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-login" aria-selected="true" data-de="Anmelden" data-en="Sign in"></button>
      <button type="button" role="tab" id="tab-register" aria-selected="false" data-de="Konto anlegen" data-en="Create account"></button>
    </div>
    <form id="form" novalidate>
      <label for="username" data-de="Benutzername" data-en="Username"></label>
      <input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="30" />
      <p class="hint" id="uhint"></p>
      <label for="password" data-de="Passwort" data-en="Password"></label>
      <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="200" />
      <p class="hint" id="phint"></p>
      <div id="repeat-wrap" hidden>
        <label for="password2" data-de="Passwort wiederholen" data-en="Repeat password"></label>
        <input id="password2" type="password" autocomplete="new-password" maxlength="200" />
        <p class="hint"></p>
      </div>
      <button class="submit" id="submit" type="submit"></button>
      <p class="err" id="err" role="alert"></p>
    </form>
  </div>
  <div class="lang"><button type="button" data-lang="de">DE</button> | <button type="button" data-lang="en">EN</button></div>
</main>
<script>
(function () {
  var lang = "de";
  try { lang = localStorage.getItem("motrkt-lang") === "en" ? "en" : "de"; } catch (e) {}
  var mode = "login";
  var T = {
    de: { login: "Anmelden", register: "Konto anlegen", uhint: "3–30 Zeichen: Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich", phint: "Mindestens 8 Zeichen",
          wrong_credentials: "Benutzername oder Passwort stimmt nicht.", username_taken: "Dieser Benutzername ist schon vergeben.",
          username_invalid: "Benutzername: 3–30 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.",
          password_length: "Das Passwort braucht mindestens 8 Zeichen.", password_is_username: "Das Passwort darf nicht der Benutzername sein.",
          mismatch: "Die Passwörter stimmen nicht überein.", too_many: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
          empty: "Bitte Benutzername und Passwort eingeben.", network: "Keine Verbindung zum Server." },
    en: { login: "Sign in", register: "Create account", uhint: "3–30 characters: letters, digits, dot, hyphen, underscore", phint: "At least 8 characters",
          wrong_credentials: "Username or password is wrong.", username_taken: "This username is already taken.",
          username_invalid: "Username: 3–30 characters, only letters, digits, dot, hyphen, underscore.",
          password_length: "The password needs at least 8 characters.", password_is_username: "The password must not be the username.",
          mismatch: "The passwords do not match.", too_many: "Too many attempts. Please try again in 15 minutes.",
          empty: "Please enter username and password.", network: "No connection to the server." }
  };
  var $ = function (id) { return document.getElementById(id); };
  function render() {
    document.documentElement.lang = lang;
    document.title = (lang === "de" ? "Anmelden" : "Sign in") + " – MOTRKT";
    document.querySelectorAll("[data-de]").forEach(function (el) { el.textContent = el.getAttribute("data-" + lang); });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    var reg = mode === "register";
    $("tab-login").setAttribute("aria-selected", String(!reg));
    $("tab-register").setAttribute("aria-selected", String(reg));
    $("repeat-wrap").hidden = !reg;
    $("password").autocomplete = reg ? "new-password" : "current-password";
    $("uhint").textContent = reg ? T[lang].uhint : "";
    $("phint").textContent = reg ? T[lang].phint : "";
    $("submit").textContent = T[lang][mode];
    $("err").textContent = "";
  }
  $("tab-login").onclick = function () { mode = "login"; render(); };
  $("tab-register").onclick = function () { mode = "register"; render(); };
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.onclick = function () { lang = b.getAttribute("data-lang"); try { localStorage.setItem("motrkt-lang", lang); } catch (e) {} render(); };
  });
  $("form").onsubmit = function (e) {
    e.preventDefault();
    var u = $("username").value.trim(), p = $("password").value;
    if (!u || !p) { $("err").textContent = T[lang].empty; return; }
    if (mode === "register" && p !== $("password2").value) { $("err").textContent = T[lang].mismatch; return; }
    $("submit").disabled = true;
    fetch("/api/auth/" + mode, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ username: u, password: p }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          var next = new URLSearchParams(location.search).get("next") || "/";
          location.replace(/^\\/(?![\\/\\\\])/.test(next) ? next : "/");
        } else {
          $("err").textContent = T[lang][x.j.error] || T[lang].wrong_credentials;
          $("submit").disabled = false;
        }
      })
      .catch(function () { $("err").textContent = T[lang].network; $("submit").disabled = false; });
  };
  render();
  $("username").focus();
})();
</script>
</body>
</html>`;
