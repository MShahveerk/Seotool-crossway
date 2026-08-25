import assert from "node:assert/strict";
import test from "node:test";
import { clampSourceKey, SOURCE_KEY_MAX } from "./sourceKey.js";

test("short keys pass through unchanged", () => {
  assert.equal(clampSourceKey("lo-v24:us:desktop:10x200:abc"), "lo-v24:us:desktop:10x200:abc");
  assert.equal(clampSourceKey(""), "");
});

test("long qualify keys fit VARCHAR(64) and stay stable", () => {
  const raw = "qualify-v6:www.dallasbusinessjournal.com:email marketing dallas:guest-post";
  assert.ok(raw.length > SOURCE_KEY_MAX);
  const a = clampSourceKey(raw);
  const b = clampSourceKey(raw);
  assert.equal(a.length, SOURCE_KEY_MAX);
  assert.equal(a, b);
  assert.notEqual(a, clampSourceKey(`${raw}:other`));
});

test("near-limit keys are not hashed", () => {
  const raw = "x".repeat(SOURCE_KEY_MAX);
  assert.equal(clampSourceKey(raw), raw);
});
