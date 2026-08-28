import assert from "node:assert/strict";
import test from "node:test";
import {
  appendHashtagsIfMissing,
  mergeHumanizedPost,
  normalizeCaption,
  pickCaption,
  scrubPostJson,
} from "./humanizerText.js";
import { mergeHumanizerConfig } from "./humanizerFields.js";

test("normalizeCaption turns leaked backslash-n into real line breaks", () => {
  const out = normalizeCaption("Line one\\n\\nLine two");
  assert.equal(out.includes("\\n"), false);
  assert.match(out, /Line one\n\nLine two/);
});

test("pickCaption prefers caption over body_text", () => {
  assert.equal(pickCaption({ caption: " Feed copy ", body_text: "internal" }), "Feed copy");
  assert.equal(pickCaption({ body_text: "internal note" }), "internal note");
});

test("scrubPostJson strips em dashes from caption and title", () => {
  const out = scrubPostJson({
    title: "Charter — same day",
    caption: "In today's digital landscape we leverage this.\\nCall us.",
    hashtags: ["#jets"],
  });
  assert.doesNotMatch(out.title, /[\u2014\u2013]/);
  assert.doesNotMatch(out.caption, /leverage/i);
  assert.doesNotMatch(out.caption, /digital landscape/i);
  assert.equal(out.caption.includes("\\n"), false);
  assert.equal(out.hashtags[0], "#jets");
});

test("mergeHumanizedPost keeps copywriter caption when the model omits it", () => {
  const merged = mergeHumanizedPost(
    { title: "Old title", caption: "Keep this caption.", platform: "both" },
    { title: "New title", platform: "instagram" }
  );
  assert.equal(merged.caption, "Keep this caption.");
  assert.equal(merged.title, "New title");
  assert.equal(merged.platform, "instagram");
});

test("appendHashtagsIfMissing only adds when caption has none", () => {
  assert.equal(appendHashtagsIfMissing("Hello", ["jets", "#charter"]), "Hello\n\n#jets #charter");
  assert.equal(appendHashtagsIfMissing("Hello #already", ["jets"]), "Hello #already");
});

test("mergeHumanizerConfig defaults off and fills prompt/skill", () => {
  const merged = mergeHumanizerConfig(
    { agent2Provider: "anthropic", agent2Model: "claude-sonnet-4-6" },
    {}
  );
  assert.equal(merged.humanizerEnabled, false);
  assert.equal(merged.humanizerProvider, "anthropic");
  assert.equal(merged.humanizerModel, "claude-sonnet-4-6");
  assert.match(merged.humanizerPrompt, /Humanizer for Crossway Post/);
  assert.match(merged.humanizerSkill, /Ban em dashes/);
});

test("mergeHumanizerConfig honors stored enable flag", () => {
  const merged = mergeHumanizerConfig({}, { humanizerEnabled: true, humanizerProvider: "openai" });
  assert.equal(merged.humanizerEnabled, true);
  assert.equal(merged.humanizerProvider, "openai");
});
