/**
 * Pull brand logos from crosswayconsulting.com (WP media library + known paths).
 * Usage: node scripts/scrape-crossway-logo.mjs
 *
 * Note: Node fetch often gets 403 from their CDN; this script shells out to
 * PowerShell Invoke-WebRequest with a browser UA when needed.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const outDir = path.join(process.cwd(), "public");

const DOWNLOADS = {
  "crossway-logo.png":
    "https://www.crosswayconsulting.com/wp-content/uploads/2025/08/Crossway-Consulting-Logo-with-slogan.png",
  "crossway-logo-white.png":
    "https://www.crosswayconsulting.com/wp-content/uploads/2025/10/Crossway-Consulting-Logo-Web-With-Slogan-White-Smallest-V1-Transparent-2.png",
  "crossway-logo-black.png":
    "https://www.crosswayconsulting.com/wp-content/uploads/2024/11/Crossway-Consulting-Logo-Web-With-Slogan-Black-Smallest-V1-Transparent.png",
  "crossway-logo-email.png":
    "https://www.crosswayconsulting.com/wp-content/uploads/2025/03/crossway-watermark-logo.png",
};

function downloadViaPowershell(url, dest) {
  const ps = `
$ErrorActionPreference = 'Stop'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
$headers = @{ Referer = 'https://www.crosswayconsulting.com/'; Accept = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
Invoke-WebRequest -Uri '${url}' -OutFile '${dest.replace(/'/g, "''")}' -UserAgent $ua -Headers $headers
`;
  execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
}

for (const [file, url] of Object.entries(DOWNLOADS)) {
  const dest = path.join(outDir, file);
  console.log("Downloading", file);
  downloadViaPowershell(url, dest);
  const buf = fs.readFileSync(dest);
  if (buf.length < 800 || buf[0] !== 0x89) {
    throw new Error(`Invalid PNG for ${file} (${buf.length} bytes)`);
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`  ${w}x${h} · ${buf.length} bytes · ${url}`);
}

console.log("Done — logos saved under public/");
