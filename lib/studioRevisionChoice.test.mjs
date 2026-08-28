import assert from "node:assert/strict";
import test from "node:test";
import {
  isStudioBlogSource,
  isStudioPostSource,
  parseRunStudioRevision,
} from "./studioRevisionChoice.js";

test("studio sources are exact", () => {
  assert.equal(isStudioPostSource("post_studio"), true);
  assert.equal(isStudioPostSource("manual"), false);
  assert.equal(isStudioBlogSource("blog_studio"), true);
  assert.equal(isStudioBlogSource("wordpress"), false);
});

test("omitted JSON flag defaults to true for older clients", () => {
  assert.equal(parseRunStudioRevision({}), true);
  assert.equal(parseRunStudioRevision({ body: {} }), true);
  assert.equal(parseRunStudioRevision({ body: { revisionTarget: "text" } }), true);
});

test("JSON body honors explicit true/false", () => {
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: true } }), true);
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: false } }), false);
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: "true" } }), true);
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: "false" } }), false);
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: "0" } }), false);
  assert.equal(parseRunStudioRevision({ body: { runStudioRevision: "1" } }), true);
});

test("email form with offer treats missing checkbox as false", () => {
  const form = new FormData();
  form.set("studioRevisionOffered", "1");
  form.set("reason", "Tone is off");
  assert.equal(parseRunStudioRevision({ form }), false);
});

test("email form with offer treats checked box as true", () => {
  const form = new FormData();
  form.set("studioRevisionOffered", "1");
  form.set("runStudioRevision", "1");
  assert.equal(parseRunStudioRevision({ form }), true);
});

test("legacy email form without offer still auto-revises", () => {
  const form = new FormData();
  form.set("reason", "Tone is off");
  form.set("revisionTarget", "both");
  assert.equal(parseRunStudioRevision({ form }), true);
});
