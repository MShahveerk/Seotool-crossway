/**
 * Global throttle for Common Crawl CDX — avoids 503/rate-limit from burst requests.
 * One CDX call every ~4s process-wide (safe for Render + shared cron).
 */
const MIN_GAP_MS = 4000;
let chain = Promise.resolve();
let lastAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Queue the next CDX request after the minimum gap. */
export function cdxThrottle() {
  chain = chain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_GAP_MS - (now - lastAt));
    if (wait) await sleep(wait);
    lastAt = Date.now();
  });
  return chain;
}
