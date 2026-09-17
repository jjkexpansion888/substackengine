import { describe, expect, it } from "vitest";
import { createSecretBox, loadEncryptionKey } from "./secretBox";

const KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex",
);

describe("createSecretBox", () => {
  it("round-trips a plaintext through encrypt/decrypt", () => {
    const box = createSecretBox(KEY);
    const plaintext =
      "s%3AmVX0cckeIqpwT0CXKxWB0x0y6r9YcyE.6YcxG8utbmilCuAWFqiweedLbyMZviLk";
    const decrypted = box.decrypt(box.encrypt(plaintext));
    expect(decrypted).toBe(plaintext);
  });

  it("never produces the same ciphertext twice (random IV)", () => {
    const box = createSecretBox(KEY);
    const first = box.encrypt("same input");
    const second = box.encrypt("same input");
    expect(first.equals(second)).toBe(false);
  });

  it("fails decryption when the ciphertext is tampered", () => {
    const box = createSecretBox(KEY);
    const payload = box.encrypt("secret");
    payload[payload.length - 1] ^= 0xff;
    expect(() => box.decrypt(payload)).toThrow();
  });

  it("fails decryption with a different key (HKDF subkeys per master)", () => {
    const box = createSecretBox(KEY);
    const otherKey = Buffer.alloc(32, 7);
    const ciphertext = box.encrypt("secret");
    expect(() => createSecretBox(otherKey).decrypt(ciphertext)).toThrow();
  });

  it("hashes emails deterministically for equality lookups", () => {
    const box = createSecretBox(KEY);
    expect(box.hash("Reader@Example.com ")).toBe(box.hash("reader@example.com"));
    expect(box.hash("a@example.com")).not.toBe(box.hash("b@example.com"));
    expect(box.hash("reader@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("truncates or rejects short payloads", () => {
    const box = createSecretBox(KEY);
    expect(() => box.decrypt(Buffer.alloc(10))).toThrow(/truncated/);
  });
});

describe("loadEncryptionKey", () => {
  it("accepts a 32-byte hex key", () => {
    expect(loadEncryptionKey(KEY.toString("hex"))).toEqual(KEY);
  });

  it("accepts a 32-byte base64 key", () => {
    const b64 = KEY.toString("base64");
    expect(loadEncryptionKey(b64)).toEqual(KEY);
  });

  it("refuses missing or wrongly-sized keys with actionable messages", () => {
    expect(() => loadEncryptionKey(undefined)).toThrow(/COOKIE_ENCRYPTION_KEY is not set/);
    expect(() => loadEncryptionKey("aabbcc")).toThrow(/32 bytes/);
  });
});
