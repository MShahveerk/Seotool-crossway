import assert from "node:assert/strict";
import test from "node:test";
import { canManuallyMoveBlog, canManuallyMovePost } from "./boardMeta.js";
import { describeBoardMove } from "./boardMoveEffects.js";

test("posts can drop onto Published from approved, failed, pending, or edited", () => {
  assert.equal(canManuallyMovePost("approved", "published"), true);
  assert.equal(canManuallyMovePost("failed", "published"), true);
  assert.equal(canManuallyMovePost("pending", "published"), true);
  assert.equal(canManuallyMovePost("edited", "published"), true);
  assert.equal(canManuallyMovePost("draft", "published"), false);
  assert.equal(canManuallyMovePost("declined", "published"), false);
  assert.equal(canManuallyMovePost("published", "approved"), false);
});

test("blogs can drop onto Published the same way", () => {
  assert.equal(canManuallyMoveBlog("approved", "published"), true);
  assert.equal(canManuallyMoveBlog("failed", "published"), true);
  assert.equal(canManuallyMoveBlog("draft", "published"), false);
  assert.equal(canManuallyMoveBlog("published", "pending"), false);
});

test("describeBoardMove warns that Published publishes now and ignores schedule", () => {
  const effect = describeBoardMove("post", "approved", "published", {
    title: "Charter same day",
    scheduledFor: "2099-12-01T08:00:00.000Z",
  });
  assert.equal(effect.willPublishNow, true);
  assert.equal(effect.severity, "danger");
  assert.equal(effect.title, "Publish now?");
  assert.equal(effect.confirmLabel, "Publish now");
  assert.match(effect.summary, /immediately/);
  assert.ok(effect.implications.some((line) => /ignored/i.test(line)));
  assert.ok(effect.implications.some((line) => /immediately/i.test(line)));
});

test("describeBoardMove flags skipped review when dropping from pending", () => {
  const effect = describeBoardMove("post", "pending", "published", { title: "Hold" });
  assert.ok(effect.implications.some((line) => /Remaining review is skipped/i.test(line)));
});
