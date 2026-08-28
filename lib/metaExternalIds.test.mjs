import assert from "node:assert/strict";
import test from "node:test";
import { encodeMetaExternalIds, parseMetaExternalIds } from "./metaExternalIds.js";

test("encode Meta ids as fb|ig and parse them back", () => {
  assert.equal(encodeMetaExternalIds({ facebookId: "111", instagramId: "222" }), "fb:111|ig:222");
  assert.deepEqual(parseMetaExternalIds("fb:111|ig:222"), { facebookId: "111", instagramId: "222" });
  assert.deepEqual(parseMetaExternalIds("ig:222"), { facebookId: null, instagramId: "222" });
  assert.deepEqual(parseMetaExternalIds("fb:111"), { facebookId: "111", instagramId: null });
});

test("legacy single Graph id is treated as Facebook", () => {
  assert.deepEqual(parseMetaExternalIds("109984572095648_99"), {
    facebookId: "109984572095648_99",
    instagramId: null,
  });
});

test("empty values stay empty", () => {
  assert.equal(encodeMetaExternalIds({}), null);
  assert.deepEqual(parseMetaExternalIds(""), { facebookId: null, instagramId: null });
});
