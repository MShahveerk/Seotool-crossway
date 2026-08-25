import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompeteFromSerp,
  compactSerpCompete,
  defaultWriterRules,
  isOwnOrListingHost,
  ownHostFromSiteLink,
  suggestWordCountRange,
  uncoveredQuestions,
} from "./serpCompete.js";

test("ownHostFromSiteLink handles urls, hosts, and GSC sc-domain", () => {
  assert.equal(ownHostFromSiteLink("https://www.halajets.com/blog"), "halajets.com");
  assert.equal(ownHostFromSiteLink("halajets.com"), "halajets.com");
  assert.equal(ownHostFromSiteLink("sc-domain:halajets.com"), "halajets.com");
});

test("own and listing hosts are skipped for on-page scans", () => {
  assert.equal(isOwnOrListingHost("www.halajets.com", "halajets.com"), true);
  assert.equal(isOwnOrListingHost("youtube.com", "halajets.com"), true);
  assert.equal(isOwnOrListingHost("netjets.com", "halajets.com"), false);
});

test("word count beats thin 1200-word defaults when rivals are long", () => {
  assert.equal(suggestWordCountRange(2400, "1200-1800"), "2300-3000");
  const bumped = suggestWordCountRange(null, "1200-1800");
  const [min, max] = bumped.split("-").map(Number);
  assert.ok(min >= 1800);
  assert.ok(max >= 2200);
  assert.match(suggestWordCountRange(900, "3000-3600"), /^3000-/);
});

test("uncoveredQuestions keeps PAA rivals did not title", () => {
  const gaps = uncoveredQuestions(
    ["How much does a private jet charter cost", "Empty leg flights last minute"],
    [{ h2s: ["How much does a private jet charter cost", "Safety and insurance"] }]
  );
  assert.ok(gaps.some((q) => /empty leg/i.test(q)));
  assert.equal(
    gaps.some((q) => /how much does a private jet charter cost/i.test(q)),
    false
  );
});

test("compact brief keeps titles, PAA, and writer rules", () => {
  const pack = buildCompeteFromSerp(
    {
      keyword: "private jet charter",
      provider: "serpapi",
      organic: [
        {
          position: 1,
          title: "Private Jet Charter Cost Guide",
          domain: "competitor.com",
          snippet: "Typical hourly rates and when charter beats first class.",
          link: "https://competitor.com/cost",
        },
      ],
      relatedQuestions: ["Is a private jet cheaper than first class?"],
      relatedSearches: ["empty leg flights"],
    },
    { query: "private jet charter", ownHost: "halajets.com", configuredRange: "1200-1800" }
  );
  const compact = compactSerpCompete(pack);
  assert.equal(compact.skipped, false);
  assert.equal(compact.titles[0].title, "Private Jet Charter Cost Guide");
  assert.ok(compact.peopleAlsoAsk.includes("Is a private jet cheaper than first class?"));
  assert.ok(compact.writerRules.some((r) => /comparison table/i.test(r)));
});

test("skipped pack still tells the writer to go long", () => {
  const rules = defaultWriterRules({ skipped: true });
  assert.ok(rules.some((r) => /1800/i.test(r)));
  assert.ok(rules.some((r) => /do not invent prices/i.test(r) || /Never invent prices/i.test(r)));
});
