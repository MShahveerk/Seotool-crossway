import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStudioCalendarToDraft,
  rewriteStalePresentYears,
  rewriteStalePresentYearsHtml,
  stalePresentYears,
  studioCalendar,
  studioClockSystemPreamble,
} from "./studioClock.js";

const NOW = new Date("2026-08-27T12:00:00Z");

test("studio calendar is UTC and current", () => {
  const clock = studioCalendar(NOW);
  assert.equal(clock.year, 2026);
  assert.match(clock.dateLabel, /27 August 2026/);
  assert.deepEqual(stalePresentYears(2026), [2024, 2025]);
});

test("titles drop stuffed 2024/2025 unless the query already has that year", () => {
  assert.equal(
    rewriteStalePresentYears("Private jet charter in 2024", { now: NOW, mode: "title" }),
    "Private jet charter"
  );
  assert.equal(
    rewriteStalePresentYears("SEO trends (2025)", { now: NOW, mode: "title" }),
    "SEO trends"
  );
  assert.equal(
    rewriteStalePresentYears("Best tools for 2024", { now: NOW, mode: "title" }),
    "Best tools"
  );
  assert.equal(
    rewriteStalePresentYears("Tax changes in 2024", {
      now: NOW,
      mode: "title",
      keepText: "tax changes in 2024",
    }),
    "Tax changes in 2024"
  );
});

test("body copy rewrites present-tense 2024/2025 to the current year", () => {
  assert.equal(
    rewriteStalePresentYears("In 2025, operators book earlier.", { now: NOW, mode: "body" }),
    "In 2026, operators book earlier."
  );
  assert.equal(
    rewriteStalePresentYears("as of 2024 the market moved", { now: NOW, mode: "body" }),
    "as of 2026 the market moved"
  );
});

test("HTML text nodes rewrite; tags stay put", () => {
  const html = rewriteStalePresentYearsHtml(
    '<p>In 2024 demand rose</p><a href="/blog/2024-recap">x</a>',
    { now: NOW }
  );
  assert.match(html, /In 2026 demand rose/);
  assert.match(html, /href="\/blog\/2024-recap"/);
});

test("draft helper covers title and caption", () => {
  const next = applyStudioCalendarToDraft(
    {
      title: "Empty legs in 2025",
      caption: "In 2024 we still see last-minute inventory.",
      article_html: "<h1>Charter in 2024</h1><p>In 2025 book early.</p>",
    },
    { now: NOW }
  );
  assert.equal(next.title, "Empty legs");
  assert.match(next.caption, /In 2026/);
  assert.match(next.article_html, /In 2026 book early/);
});

test("every agent system prompt is dated", () => {
  const sys = studioClockSystemPreamble("You are the Writer.", NOW);
  assert.match(sys, /current year is 2026/i);
  assert.match(sys, /2024 or 2025/);
  assert.match(sys, /You are the Writer/);
  const twice = studioClockSystemPreamble(sys, NOW);
  assert.equal(twice, sys);
});
