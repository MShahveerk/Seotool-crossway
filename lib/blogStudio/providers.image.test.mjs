import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultImageModelForProvider,
  extractSvgMarkup,
  imageModelForReferences,
  normalizeAnthropicImageModel,
} from "./imageModels.js";

test("Anthropic image provider defaults to Claude Sonnet, not GPT Image", () => {
  assert.equal(defaultImageModelForProvider("anthropic"), "claude-sonnet-4-6");
  assert.equal(defaultImageModelForProvider("openai"), "gpt-image-2");
  assert.equal(defaultImageModelForProvider("openrouter"), "openai/gpt-image-2");
});

test("reference upgrade keeps Anthropic on Claude", () => {
  assert.equal(imageModelForReferences("anthropic", "claude-haiku-4-5"), "claude-sonnet-4-6");
  assert.equal(imageModelForReferences("anthropic", "claude-sonnet-4-6"), "claude-sonnet-4-6");
  assert.equal(imageModelForReferences("openai", "gpt-image-1-mini"), "gpt-image-2");
});

test("stale GPT Image ids are remapped when the provider is Anthropic", () => {
  assert.equal(normalizeAnthropicImageModel("gpt-image-2"), "claude-sonnet-4-6");
  assert.equal(normalizeAnthropicImageModel("anthropic/claude-opus-4-6"), "claude-opus-4-6");
});

test("extractSvgMarkup reads fenced or raw SVG", () => {
  const inner = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  assert.equal(extractSvgMarkup(`Sure.\n\`\`\`svg\n${inner}\n\`\`\``), inner);
  assert.equal(extractSvgMarkup(`prefix ${inner} suffix`), inner);
  assert.equal(extractSvgMarkup("no drawing"), "");
});
