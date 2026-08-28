import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFreeDiscoveryQueries,
  discoveryPageKind,
  MAX_FREE_DISCOVERY_QUERIES,
} from "./linkOpportunityQueries.js";

test("free discovery queries hunt write-for-us and listing forms", () => {
  const queries = buildFreeDiscoveryQueries("chicago plumber", {
    location: "Chicago, Illinois, United States",
  });
  assert.ok(queries.length <= MAX_FREE_DISCOVERY_QUERIES);
  assert.ok(queries.length >= 6);
  const blob = queries.join(" | ").toLowerCase();
  assert.match(blob, /write for us/);
  assert.match(blob, /guest post|contributor|add your business|free listing/);
});

test("a write-for-us URL is a guest-post prospect", () => {
  assert.equal(
    discoveryPageKind({
      link: "https://hvacweekly.example/write-for-us",
      title: "Write for us",
      snippet: "Pitch a guest post",
    }),
    "guest-post"
  );
});

test("chamber and add-listing SERPs are directories", () => {
  assert.equal(
    discoveryPageKind({
      link: "https://chicagochamber.example/",
      title: "Chicago Chamber of Commerce",
      snippet: "Add your business",
    }),
    "directory"
  );
});

test("organic results from a write-for-us query still count", () => {
  assert.equal(
    discoveryPageKind(
      {
        link: "https://localtradesmag.example/blog",
        title: "Local Trades Magazine",
        snippet: "Industry news for contractors",
      },
      'plumber "write for us"'
    ),
    "guest-post"
  );
});
