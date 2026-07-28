/**
 * In-process throttle + retry for SE Ranking Data API (10 RPS per API key).
 * Serializes calls within one server instance and backs off on HTTP 429.
 */

const MIN_INTERVAL_MS = 130; // ~7.5 RPS — headroom under the 10 RPS cap
const MAX_RETRIES = 4;

let chain = Promise.resolve();
let lastAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(baseMs) {
  return baseMs * (0.8 + Math.random() * 0.4);
}

/** Queue a SE Ranking HTTP call so bursts stay under the per-key rate limit. */
export function scheduleSerankingCall(fn) {
  const job = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastAt));
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  chain = job.catch(() => {});
  return job;
}

/** Retry wrapper for fetch when SE Ranking returns 429 Too Many Requests. */
export async function fetchSerankingWithRetry(url, init) {
  let delayMs = 800;
  let lastRes = null;
  let lastText = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    lastRes = res;
    lastText = await res.text();

    if (res.status !== 429) {
      return { res, text: lastText };
    }

    if (attempt >= MAX_RETRIES) break;
    await sleep(jitteredDelay(delayMs));
    delayMs *= 2;
  }

  return { res: lastRes, text: lastText };
}

export function isSerankingRateLimit(status, body) {
  if (status !== 429) return false;
  const msg = JSON.stringify(body || "").toLowerCase();
  return msg.includes("too many") || msg.includes("rate") || msg.includes("call-rate");
}
