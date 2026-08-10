import fetch from "node-fetch";

async function testGooglebot() {
  console.log("Testing Googlebot User-Agent...");
  try {
    const res = await fetch("https://www.crosswayconsulting.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    console.log("Googlebot Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Googlebot length:", text.length, "Title match:", text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  } catch (err) {
    console.error("Googlebot Error:", err.message);
  }
}

async function testBrowser() {
  console.log("Testing Full Browser Headers...");
  try {
    const res = await fetch("https://www.crosswayconsulting.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    console.log("Browser Status:", res.status, res.statusText);
    const text = await res.text();
    console.log("Browser length:", text.length, "Title match:", text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  } catch (err) {
    console.error("Browser Error:", err.message);
  }
}

async function main() {
  await testGooglebot();
  await testBrowser();
}

main();
