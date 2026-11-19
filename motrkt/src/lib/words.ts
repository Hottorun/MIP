/**
 * Word search for the search fields: every word of the query has to start a word of the text. A plain substring test
 * let "RS" find every Porsche ("Po-rs-che") and "S" every car, so "718 Spyder RS" listed the 718 Spyder too.
 * "993 turbo" still finds "911 (993) Turbo", "carr" finds "Carrera", "bat-12" finds "BAT-12345".
 */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Lower-case words without accents; dots stay inside a word ("997.2"), everything else separates. */
export function wordsOf(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** Whether every word of `query` (a string, or words already split) starts a word of `text`. An empty query matches. */
export function hasWords(text: string, query: string | string[]): boolean {
  const q = typeof query === "string" ? wordsOf(query) : query.flatMap(wordsOf);
  if (!q.length) return true;
  const words = wordsOf(text);
  return q.every((w) => words.some((x) => x.startsWith(w)));
}
