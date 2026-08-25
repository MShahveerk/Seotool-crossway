import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArticleHtml, plaintextToArticleHtml } from "./articleHtml.js";

const leaked = `When It Actually Pays to Charter a Private Jet
\\n
Business travelers often ask whether chartering a private jet is worth the cost.
\\n
When the Numbers Make Sense
\\n
Chartering a private jet makes sense when the total cost of commercial travel exceeds the charter fee.
\\n
Business Travel Scenarios That Justify the Spend
\\n
Last-minute client meetings in remote locations.
\\n
Team retreats or site visits that require equipment.
`;

test("literal backslash-n from the Humanizer does not survive", () => {
  const html = normalizeArticleHtml(leaked);
  assert.doesNotMatch(html, /\\n/);
  assert.match(html, /<h1>When It Actually Pays to Charter a Private Jet<\/h1>/);
  assert.match(html, /<h2>When the Numbers Make Sense<\/h2>/);
  assert.match(html, /<p>Business travelers often ask/);
});

test("already-valid HTML keeps tags and still drops leaked escapes", () => {
  const html = normalizeArticleHtml("<h1>Title</h1>\\n\\n<p>Body copy here.</p>");
  assert.equal(html.includes("\\n"), false);
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p>Body copy here\.<\/p>/);
});

test("plaintext headings become h1/h2", () => {
  const html = plaintextToArticleHtml("A Clear Title\n\nA longer paragraph that explains the point.");
  assert.match(html, /^<h1>A Clear Title<\/h1>/);
  assert.match(html, /<p>A longer paragraph/);
});
