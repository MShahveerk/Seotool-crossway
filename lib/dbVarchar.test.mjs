import assert from "node:assert/strict";
import test from "node:test";
import { clipVarchar, DB_VARCHAR_TOPIC } from "./dbVarchar.js";

test("clipVarchar keeps short values", () => {
  assert.equal(clipVarchar("hello", 512), "hello");
  assert.equal(clipVarchar("", 512), "");
});

test("clipVarchar trims a Post Studio topic to the run column", () => {
  const brief = "x".repeat(DB_VARCHAR_TOPIC + 80);
  const clipped = clipVarchar(brief, DB_VARCHAR_TOPIC);
  assert.equal(clipped.length, DB_VARCHAR_TOPIC);
  assert.equal(clipped, "x".repeat(DB_VARCHAR_TOPIC));
});
