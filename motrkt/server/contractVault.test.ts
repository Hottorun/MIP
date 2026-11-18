import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { canStoreContracts, isSealed, seal, unseal } from "./contractVault.ts";

const file = Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(5000)]);
const before = { key: process.env.MIP_CONTRACT_KEY, vercel: process.env.VERCEL };

afterEach(() => {
  for (const [name, value] of [["MIP_CONTRACT_KEY", before.key], ["VERCEL", before.vercel]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("contract vault", () => {
  it("encrypts with the key and returns the same file", () => {
    process.env.MIP_CONTRACT_KEY = randomBytes(32).toString("base64");
    const stored = seal(file, "car-1");
    expect(isSealed(stored)).toBe(true);
    expect(stored.includes(Buffer.from("%PDF-"))).toBe(false);
    expect(unseal(stored, "car-1").equals(file)).toBe(true);
  });
  it("accepts a hex key", () => {
    process.env.MIP_CONTRACT_KEY = randomBytes(32).toString("hex");
    expect(unseal(seal(file, "car-1"), "car-1").equals(file)).toBe(true);
  });
  it("refuses a file moved to another report, a changed file and a wrong key", () => {
    process.env.MIP_CONTRACT_KEY = randomBytes(32).toString("base64");
    const stored = seal(file, "car-1");
    expect(() => unseal(stored, "car-2")).toThrow();
    const changed = Buffer.from(stored);
    changed[changed.length - 1] ^= 1;
    expect(() => unseal(changed, "car-1")).toThrow();
    process.env.MIP_CONTRACT_KEY = randomBytes(32).toString("base64");
    expect(() => unseal(stored, "car-1")).toThrow();
  });
  it("rejects a key of the wrong length", () => {
    process.env.MIP_CONTRACT_KEY = "zu-kurz";
    expect(() => seal(file, "car-1")).toThrow();
    expect(canStoreContracts()).toBe(false);
  });
  it("without a key: plain storage in development, none on Vercel; older plain files stay readable", () => {
    delete process.env.MIP_CONTRACT_KEY;
    delete process.env.VERCEL;
    expect(canStoreContracts()).toBe(true);
    expect(seal(file, "car-1").equals(file)).toBe(true);
    expect(unseal(file, "car-1").equals(file)).toBe(true);
    process.env.VERCEL = "1";
    expect(canStoreContracts()).toBe(false);
  });
});
