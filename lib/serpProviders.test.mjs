import assert from "node:assert/strict";
import test from "node:test";
import { parseDuckDuckGoHtml, unwrapDuckDuckGoHref } from "./serpProviders.js";

test("unwraps DuckDuckGo redirect links", () => {
  const href =
    "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.dallaschamber.org%2Fdirectory&rut=abc";
  assert.equal(unwrapDuckDuckGoHref(href), "https://www.dallaschamber.org/directory");
});

test("drops bare DuckDuckGo hosts", () => {
  assert.equal(unwrapDuckDuckGoHref("https://duckduckgo.com/dallas"), "");
});

test("parses html.duckduckgo.com result anchors", () => {
  const html = `
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.yelp.com%2F">Yelp</a>
    <a rel="nofollow" class="result__a" href="https://www.bbb.org/us/tx/dallas">BBB Dallas</a>
  `;
  const rows = parseDuckDuckGoHtml(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].link, "https://www.yelp.com/");
  assert.equal(rows[1].link, "https://www.bbb.org/us/tx/dallas");
});
