// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashContent, generateDataKey, wrapDataKey, unwrapDataKey, encryptBlob, decryptBlob } from "../Mesh/Crypto.js";

test("hashContent is deterministic and content-addressed — same bytes, same hash", () => {
  const a = Buffer.from("hello world");
  const b = Buffer.from("hello world");
  assert.equal(hashContent(a), hashContent(b));
});

test("hashContent differs for different content", () => {
  assert.notEqual(hashContent(Buffer.from("a")), hashContent(Buffer.from("b")));
});

test("wrapDataKey + unwrapDataKey round-trips a real data key under a master key", () => {
  const masterKey = generateDataKey();
  const dataKey = generateDataKey();
  const wrapped = wrapDataKey(masterKey, dataKey);
  const unwrapped = unwrapDataKey(masterKey, wrapped);
  assert.deepEqual(unwrapped, dataKey);
});

test("unwrapDataKey rejects a wrapped key under the wrong master key", () => {
  const wrapped = wrapDataKey(generateDataKey(), generateDataKey());
  assert.throws(() => unwrapDataKey(generateDataKey(), wrapped));
});

test("encryptBlob + decryptBlob round-trips real plaintext bytes", () => {
  const dataKey = generateDataKey();
  const plaintext = Buffer.from("this is real media content, or close enough for a test");
  const encrypted = encryptBlob(dataKey, plaintext);
  assert.deepEqual(decryptBlob(dataKey, encrypted), plaintext);
});

test("decryptBlob rejects ciphertext under the wrong data key (GCM auth tag catches it)", () => {
  const encrypted = encryptBlob(generateDataKey(), Buffer.from("secret"));
  assert.throws(() => decryptBlob(generateDataKey(), encrypted));
});

test("decryptBlob rejects tampered ciphertext — GCM tag makes tampering detectable, not just theoretical", () => {
  const dataKey = generateDataKey();
  const encrypted = encryptBlob(dataKey, Buffer.from("secret"));
  encrypted.ciphertext[0] ^= 0xff;
  assert.throws(() => decryptBlob(dataKey, encrypted));
});

test("a Mesh node holding only the ciphertext cannot recover plaintext without the data key", () => {
  const dataKey = generateDataKey();
  const plaintext = Buffer.from("this must never appear in the ciphertext");
  const { ciphertext } = encryptBlob(dataKey, plaintext);
  assert.equal(ciphertext.includes(plaintext), false);
});
