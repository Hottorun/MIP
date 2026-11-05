import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BarChart2, GitCompare, MessageSquare, SendHorizontal, ShieldAlert, Sparkles, Square, Trash2, TrendingUp } from "lucide-react";
import { askCopilot, fetchCopilotStatus, suggestions, type CopilotStatus } from "../lib/copilot";
import { uid, useStore, type ChatMessage } from "../state/store";
import { cn } from "../lib/format";
import { Pill } from "./ui";

let statusPromise: Promise<CopilotStatus> | null = null;
function useCopilotStatus() {
  const [status, setStatus] = useState<CopilotStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetchCopilotStatus();
    let alive = true;
    statusPromise.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** Minimal markdown: **bold**, _italic_, "- " bullets, blank-line paragraphs. */
export function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
      if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i} className="text-muted">{part.slice(1, -1)}</em>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="my-1 space-y-0.5 pl-4">
          {list.map((l, i) => (
            <li key={i} className="list-disc marker:text-gold">
              {inline(l)}
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const t = line.trimEnd();
    if (/^\s*[-•*]\s+/.test(t)) {
      list.push(t.replace(/^\s*[-•*]\s+/, ""));
      continue;
    }
    flush();
    if (!t.trim()) continue;
    blocks.push(
      <p key={blocks.length} className="my-1">
        {inline(t.replace(/^#+\s*/, ""))}
      </p>,
    );
  }
  flush();
  return <div className="text-[13px] leading-relaxed text-ink/90">{blocks}</div>;
}

const SUGGESTION_ICONS = [TrendingUp, GitCompare, ShieldAlert, BarChart2];

export function Copilot({
  focusVariantId,
  mode = "card",
  prompt,
}: {
  focusVariantId?: string;
  mode?: "card" | "full";
  /** Send a prompt from outside (e.g. a prompt library). Change `nonce` to send the same text again. */
  prompt?: { text: string; nonce: number };
}) {
  const { chat, setChat, portfolio, watchlist, toast } = useStore();
  const status = useCopilotStatus();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = streaming !== null;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat.length, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: ChatMessage = { id: uid(), role: "user", content };
    const history = [...chat, userMsg];
    setChat(history);
    setInput("");
    setStreaming("");
    const controller = new AbortController();
    abort.current = controller;
    let acc = "";
    try {
      const source = await askCopilot({
        turns: history.slice(-12).map(({ role, content }) => ({ role, content })),
        focusVariantId,
        portfolio,
        watchlist,
        signal: controller.signal,
        onDelta: (d) => {
          acc += d;
          setStreaming(acc);
        },
      });
      setChat((c) => [...c, { id: uid(), role: "assistant", content: acc || "_Keine Antwort erhalten._", source }]);
    } catch (e) {
      if (controller.signal.aborted) {
        if (acc) setChat((c) => [...c, { id: uid(), role: "assistant", content: `${acc}\n\n_(abgebrochen)_` }]);
      } else {
        toast(e instanceof Error ? e.message : "Co-Pilot-Fehler", "error");
      }
    } finally {
      setStreaming(null);
      abort.current = null;
    }
  }

  const lastPrompt = useRef<number | null>(null);
  useEffect(() => {
    if (!prompt || prompt.nonce === lastPrompt.current) return;
    lastPrompt.current = prompt.nonce;
    void send(prompt.text);
  }, [prompt?.nonce]); // send() is recreated every render; only a new nonce should trigger it

  const items = mode === "card" ? chat.slice(-2) : chat;
  const sugg = suggestions(focusVariantId);
  const full = mode === "full";

  return (
    <div className={cn("flex min-h-0 flex-col", full ? "h-full" : "")}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <MessageSquare className="size-3.5" />
        <span className="flex-1">Wie kann ich Ihnen helfen?</span>
        {status && (
          <Pill tone={status.ai ? "gold" : "neutral"} className="text-[10px]">
            {status.ai ? `Claude · ${status.model?.replace("claude-", "").replace(/-/g, " ")}` : "Lokaler Modus"}
          </Pill>
        )}
        {full && chat.length > 0 && (
          <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setChat([])} disabled={busy}>
            <Trash2 className="size-3.5" /> Verlauf löschen
          </button>
        )}
      </div>

      <div ref={scroller} className={cn("min-h-0 space-y-2 overflow-y-auto", full ? "flex-1 pr-1" : "max-h-64")}>
        {(items.length === 0 || full) && !busy && chat.length === 0 && (
          <ul className="space-y-1.5">
            {sugg.map((s, i) => {
              const Icon = SUGGESTION_ICONS[i];
              return (
                <li key={s}>
                  <button
                    onClick={() => send(s)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-left text-xs text-ink/90 transition-colors hover:border-gold/50 hover:bg-panel-3"
                  >
                    <Icon className="size-3.5 shrink-0 text-gold" />
                    {s}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {busy && <Bubble msg={{ id: "streaming", role: "assistant", content: streaming ?? "" }} streaming />}
      </div>

      {!full && chat.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sugg.slice(0, 2).map((s) => (
            <button key={s} className="chip max-w-full truncate" disabled={busy} onClick={() => send(s)}>
              {s}
            </button>
          ))}
          <Link to="/ai" className="chip ml-auto">
            Verlauf <ArrowUpRight className="size-3" />
          </Link>
        </div>
      )}

      <form
        className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-1.5 focus-within:border-gold/60"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Sparkles className="size-3.5 shrink-0 text-gold" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Frage an den AI Co-Pilot …"
          className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-faint focus:outline-none"
          aria-label="Frage an den AI Co-Pilot"
        />
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()} className="text-muted hover:text-ink" aria-label="Stopp">
            <Square className="size-4" />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="text-gold disabled:text-faint" aria-label="Senden">
            <SendHorizontal className="size-4" />
          </button>
        )}
      </form>
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: ChatMessage; streaming?: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-gold/15 px-3 py-1.5 text-[13px] text-ink">{msg.content}</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl rounded-bl-sm border border-line bg-panel-2 px-3 py-2">
      {msg.content ? <RichText text={msg.content} /> : null}
      {streaming && <span className={cn("text-xs text-muted", "caret")}>{msg.content ? "" : "Analysiere Marktdaten "}</span>}
      {msg.source && !streaming && (
        <div className="mt-1 text-right text-[10px] text-faint">{msg.source === "claude" ? "Claude" : "MOTRKT Lokal-Analyse"}</div>
      )}
    </div>
  );
}
