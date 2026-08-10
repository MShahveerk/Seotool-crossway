import fetch from "node-fetch";

async function debug() {
  console.log("Debugging fetch to https://www.crosswayconsulting.com...");
  try {
    const res = await fetch("https://www.crosswayconsulting.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    console.log("Status:", res.status, res.statusText);
    console.log("Redirected:", res.redirected);
    console.log("Final URL:", res.url);
    const body = await res.text();
    console.log("Body length:", body.length);
    console.log("Body preview:", body.slice(0, 300));
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

debug();
