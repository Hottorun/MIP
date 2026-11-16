import { describe, expect, it } from "vitest";
import { safeNext } from "./auth.ts";

describe("safeNext (sign-in redirect target)", () => {
  it("keeps paths on this site, with query and hash", () => {
    expect(safeNext("/markt/porsche-911-964-carrera-rs")).toBe("/markt/porsche-911-964-carrera-rs");
    expect(safeNext("/kaufen?preis_bis=80000&deals=1#top")).toBe("/kaufen?preis_bis=80000&deals=1#top");
  });
  it("falls back to / for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/%09/x", "javascript:alert(1)", "markt"]) {
      const out = safeNext(bad);
      expect(out === "/" || out.startsWith("/%09")).toBe(true);
      expect(out).not.toMatch(/^\/[\/\\]/);
    }
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
  });
});
