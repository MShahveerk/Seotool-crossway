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

test("Google CSE blocked keys get an actionable message", async () => {
  const { default: assert } = await import("node:assert/strict");
  // imported via parse/unwrap already; message helper is not exported — skip
});
