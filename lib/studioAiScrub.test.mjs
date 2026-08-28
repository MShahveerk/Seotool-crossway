import assert from "node:assert/strict";
import test from "node:test";
import { scrubAiTics } from "./studioAiScrub.js";

test("scrubAiTics replaces em dashes and stock AI phrasing", () => {
  const out = scrubAiTics("In today's digital landscape — we leverage a robust stack.");
  assert.doesNotMatch(out, /[\u2014\u2013]/);
  assert.doesNotMatch(out, /leverage/i);
  assert.doesNotMatch(out, /robust/i);
  assert.doesNotMatch(out, /digital landscape/i);
  assert.match(out, /use/i);
});

test("scrubAiTics leaves ordinary copy alone", () => {
  assert.equal(scrubAiTics("Book a jet when commercial connections fall apart."), "Book a jet when commercial connections fall apart.");
});
