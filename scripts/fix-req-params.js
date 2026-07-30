const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name === "route.js") files.push(p);
  }
  return files;
}

let n = 0;
for (const file of walk(path.join("app", "api", "admin"))) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("requireAdminRoute")) continue;
  const orig = s;
  s = s.replace(/export async function (GET|POST|PATCH|PUT|DELETE)\(\s*_req/g, (_, m) => `export async function ${m}(req`);
  s = s.replace(/export async function (GET|POST|PATCH|PUT|DELETE)\(\s*\)/g, (_, m) => `export async function ${m}(req)`);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    n++;
    console.log("fixed", file);
  }
}

console.log("done", n);
