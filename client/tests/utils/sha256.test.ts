import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/utils/sha256";

describe("sha256Hex", () => {
  it("matches the NIST vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("matches the reference on a 1,000-character string", () => {
    const text = "0123456789abcdef".repeat(63).slice(0, 1000);
    expect(text).toHaveLength(1000);
    expect(sha256Hex(text)).toBe(
      createHash("sha256").update(text).digest("hex")
    );
  });

  it("hashes multi-byte text as UTF-8", () => {
    expect(sha256Hex("日本語")).toBe(
      createHash("sha256").update("日本語", "utf8").digest("hex")
    );
  });
});
