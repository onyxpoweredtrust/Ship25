// Corvo
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMentions } from "../Store/Mentions.js";

test("extracts a single mention", () => {
  assert.deepEqual(parseMentions("hey @eggman95 check this out"), ["eggman95"]);
});

test("extracts multiple distinct mentions, de-duplicated", () => {
  assert.deepEqual(parseMentions("@a and @b, also @a again"), ["a", "b"]);
});

test("an email-shaped string isn't parsed as a mention (no preceding whitespace/start)", () => {
  assert.deepEqual(parseMentions("contact me at user@example.com"), []);
});

test("returns an empty array for no mentions or empty text", () => {
  assert.deepEqual(parseMentions("no mentions here"), []);
  assert.deepEqual(parseMentions(""), []);
  assert.deepEqual(parseMentions(undefined), []);
});

test("a mention at the very start of the text is caught", () => {
  assert.deepEqual(parseMentions("@starts-here right away"), ["starts-here"]);
});
