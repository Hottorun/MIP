import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { handleMobileDe } from "./mobilede.ts";
import { readText } from "./body.ts";

// Load secrets from .env (ANTHROPIC_API_KEY, MOBILEDE_USERNAME, MOBILEDE_PASSWORD) without overriding the shell environment.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file – rely on the environment */
}

const MODEL = "claude-haiku-5-5";
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_CONTEXT_CHARS = 40_000;

const SYSTEM_PROMPT = `Du bist der "MIP AI Co-Pilot", ein Analyst für den Markt klassischer und moderner Sammler-Sportwagen (Porsche).

So arbeitest du:
- Antworte auf Deutsch, außer der Nutzer schreibt in einer anderen Sprache.
- Stütze dich auf die MIP-Marktdaten im Kontextblock (Marktwerte, Renditen, Volatilität, Verkäufe, Auktionen, Inserate, Portfolio). Nenne konkrete Zahlen daraus, wenn sie die Antwort tragen.
- Wenn die Daten eine Frage nicht abdecken, sag das offen und ergänze allgemeines Fachwissen, klar als solches gekennzeichnet. Erfinde keine Verkäufe, Fahrgestellnummern oder Auktionsergebnisse.
- Fasse dich kurz: meist 80–220 Wörter. Nutze knappe Zwischenzeilen in **fett** und Aufzählungen mit "- ", keine Tabellen und keine Überschriften mit "#".
- Bei Prognosen: gib eine Spanne und die wichtigsten Treiber und Risiken an, keine Scheingenauigkeit.
- Kauf- oder Verkaufsfragen beantwortest du als Einschätzung, nicht als Anlageberatung; ein kurzer Hinweis darauf genügt einmal pro Gespräch.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return JSON.parse((await readText(req, 1_000_000)) || "{}");
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (content) msgs.push({ role: m.role, content });
  }
  // The API expects the conversation to start with a user turn and end with one.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

/** Best-effort check whether the SDK will find credentials (env vars or an `ant auth login` profile). */
function hasCredentials() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_PROFILE ||
      existsSync(join(homedir(), ".config", "anthropic")),
  );
}

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

async function handleCopilot(req: IncomingMessage, res: ServerResponse) {
  let body: { messages?: unknown; context?: unknown; lang?: unknown };
  try {
    body = (await readJson(req)) as typeof body;
  } catch {
    return sendJson(res, 400, { error: "Ungültiger Request" });
  }
  const messages = parseMessages(body.messages);
  if (!messages) return sendJson(res, 400, { error: "Ungültiger Gesprächsverlauf" });
  const context = typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT_CHARS) : "";
  // The app's UI language; the market data block stays German either way.
  const english = body.lang === "en";

  if (!hasCredentials()) {
    return sendJson(res, 503, { error: "Kein Anthropic-API-Zugang konfiguriert", fallback: true });
  }

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
  };

  try {
    // Claude Haiku 5.5 has no server-side refusal fallback: a declined request ends with stop_reason "refusal" (below).
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 64_000,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: `<mip_marktdaten>\n${context}\n</mip_marktdaten>` },
        ...(english
          ? [{ type: "text" as const, text: "Die Oberfläche ist auf Englisch eingestellt: Antworte auf Englisch (britische Schreibweise, Beträge als €378,000), außer der Nutzer schreibt in einer anderen Sprache. Übersetze deutsche Begriffe aus dem Kontextblock." }]
          : []),
      ],
      messages,
    });
    req.on("close", () => {
      if (!res.writableEnded) stream.abort();
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        start();
        res.write(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    start();
    if (final.stop_reason === "refusal") {
      res.write(english ? "\n\n_The Co-Pilot can’t answer this request._" : "\n\n_Diese Anfrage kann der Co-Pilot leider nicht beantworten._");
    } else if (final.stop_reason === "max_tokens") {
      res.write(english ? "\n\n_(answer truncated)_" : "\n\n_(Antwort gekürzt)_");
    }
    res.end();
  } catch (error) {
    if (res.writableEnded) return;
    const fallback =
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      (!(error instanceof Anthropic.APIError) && !started);
    const message =
      error instanceof Anthropic.RateLimitError
        ? english
          ? "Rate limit reached – please try again shortly."
          : "Rate-Limit erreicht – bitte gleich erneut versuchen."
        : error instanceof Anthropic.APIError
          ? `${english ? "API error" : "API-Fehler"} ${error.status ?? ""}`.trim()
          : english
            ? "Connection to the Claude API failed."
            : "Verbindung zur Claude API fehlgeschlagen.";
    if (!started) return sendJson(res, fallback ? 503 : 502, { error: message, fallback });
    res.end(`\n\n_[${message}]_`);
  }
}

export async function handleApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/copilot/status" && req.method === "GET") {
    return sendJson(res, 200, { ai: hasCredentials(), model: MODEL });
  }
  if (url.pathname === "/api/copilot" && req.method === "POST") {
    return handleCopilot(req, res);
  }
  if (url.pathname.startsWith("/api/mobilede/")) return handleMobileDe(req, res, url);
  sendJson(res, 404, { error: "Not found" });
}
