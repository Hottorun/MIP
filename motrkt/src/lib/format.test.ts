import { describe, expect, it } from "vitest";
import { safeUrl } from "./format";

describe("safeUrl (links from listing data)", () => {
  it("passes http(s) URLs through", () => {
    expect(safeUrl("https://www.classic-trader.com/de/auto/1")).toBe("https://www.classic-trader.com/de/auto/1");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
  });
  it("drops other schemes, whitespace and empty values", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x", "https://x y", "", null, undefined]) expect(safeUrl(bad)).toBeUndefined();
  });
});
