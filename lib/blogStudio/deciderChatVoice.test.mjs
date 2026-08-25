import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyUserTurn,
  editorialTitleFromSeed,
  fallbackGreeting,
  fallbackPitches,
  finalizeTurn,
  scrubReply,
} from "./deciderChatVoice.js";

const hala = {
  brandName: "Hala Jets",
  domain: "halajets.com",
  category: "Private jet charter",
  audience: "corporate and luxury travelers",
  geo: "Dubai",
  whatTheySell: ["private jet charter", "empty-leg flights"],
  seedBag: ["charter a private jet", "private jet charter near me", "how much does a private jet charter cost"],
  opportunities: ["Buyers comparing charter to first class", "Local pickup without the scavenger hunt"],
  hasResearch: true,
};

test("suggest topics never falls back to the blank brief prompt", () => {
  const turn = finalizeTurn(
    { reply: "Tell me what this article should do.", ready: false },
    { memory: hala, lastUser: "what should we write about, suggest topics" }
  );
  assert.equal(turn.ready, false);
  assert.match(turn.reply, /Three I'd actually publish for Hala Jets/);
  assert.doesNotMatch(turn.reply, /tell me what this article should do/i);
  assert.doesNotMatch(turn.reply, /["“]charter a private jet["”]/);
  assert.doesNotMatch(turn.reply, /Topic Decider/i);
});

test("fulfill keywords / anything / yes lock a title instead of stalling", () => {
  for (const lastUser of ["fulfill keywords", "anything", "yes"]) {
    const turn = finalizeTurn({ reply: "", ready: false }, { memory: hala, lastUser });
    assert.equal(classifyUserTurn(lastUser).kind, "go-ahead");
    assert.equal(turn.ready, true);
    assert.ok(turn.topic);
    assert.notEqual(turn.topic.toLowerCase(), "charter a private jet");
    assert.doesNotMatch(turn.reply, /tell me what this article should do/i);
    assert.doesNotMatch(turn.reply, /What tone or angle/);
  }
});

test("greeting is an article pitch, never an audit", () => {
  const greet = fallbackGreeting(hala);
  assert.match(greet, /I’d write/);
  assert.doesNotMatch(greet, /favicon/i);
  assert.doesNotMatch(greet, /orphan/i);
  assert.doesNotMatch(greet, /internal link/i);
  assert.doesNotMatch(greet, /["“]charter a private jet["”]/);
  assert.doesNotMatch(greet, /near me/);
  assert.doesNotMatch(greet, /tell me what this article should do/i);
  const poisoned = finalizeTurn(
    {
      reply:
        "Hala Jets is in the room, and I can already see the private jet charter domain shaping up. Given the 20 orphan pages and the missing favicon, I’d start by weaving those service pages into a tighter internal link map.",
      ready: false,
    },
    { memory: hala, greeting: true }
  );
  assert.equal(poisoned.reply, greet);
  assert.doesNotMatch(poisoned.reply, /favicon/i);
});

test("scrubs harvest-speak even if the model dumps it", () => {
  const cleaned = scrubReply(
    'The research shows strong interest in "charter a private jet" and local queries like "private jet charter near me". What tone or angle should the article take to meet your goals?',
    hala
  );
  assert.equal(cleaned, "");
});

test("picks numbered option", () => {
  const pitches = fallbackPitches(hala).pitches;
  const turn = finalizeTurn({ reply: "", ready: false }, { memory: hala, lastUser: "2" });
  assert.equal(turn.ready, true);
  assert.equal(turn.topic, pitches[1].title);
});

test("editorial titles rewrite charter seeds", () => {
  assert.match(editorialTitleFromSeed("charter a private jet"), /When it actually pays to charter a private jet/i);
  assert.match(editorialTitleFromSeed("private jet charter near me"), /without the local-search runaround/i);
});
