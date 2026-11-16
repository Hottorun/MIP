import { describe, expect, it } from "vitest";
import { cleanState } from "./userState.ts";

describe("cleanState (user state document)", () => {
  it("keeps the known lists and the last variant, drops the rest", () => {
    const out = cleanState({ watchlist: ["a"], portfolio: [], chat: [{ x: 1 }], lastVariantId: "v", evil: true });
    expect(out).toEqual({ watchlist: ["a"], portfolio: [], lastVariantId: "v" });
  });
  it("rejects documents that are not objects or whose lists are not arrays", () => {
    expect(cleanState(null)).toBeNull();
    expect(cleanState([1])).toBeNull();
    expect(cleanState({ watchlist: "a" })).toBeNull();
  });
  it("caps list lengths", () => {
    const out = cleanState({ readNotifications: Array.from({ length: 5000 }, (_, i) => String(i)) });
    expect((out?.readNotifications as string[]).length).toBe(2000);
  });
});
