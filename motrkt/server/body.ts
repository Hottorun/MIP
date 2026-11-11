import type { IncomingMessage } from "node:http";

/**
 * The request body as text, at most `limit` bytes. Reads through "data"/"end" events rather than async iteration:
 * on Vercel the Node launcher may read the body first and replays it only through those events.
 */
export function readText(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      if (size > limit) return; // over the limit: keep draining, so the handler can still answer
      size += c.length;
      if (size > limit) reject(new Error("size"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
