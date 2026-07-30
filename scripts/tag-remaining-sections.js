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

const rules = [
  { match: "/approvals/", section: "admin-approvals" },
  { match: "/approvals/route.js", section: "admin-approvals" },
  { match: "/blogs/", section: "admin-blogs" },
  { match: "/blogs/route.js", section: "admin-blogs" },
  { match: "/wordpress/", section: "admin-blogs" },
  { match: "/meta/pull/", section: "post-automation" },
  { match: "/email-inbound/", section: "post-automation" },
];

function normalize(p) {
  return p.split(path.sep).join("/");
}

let n = 0;
for (const file of walk(path.join("app", "api", "admin"))) {
  const rel = normalize(file);
  const rule = rules.find((r) => rel.includes(r.match));
  if (!rule) continue;

  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("requireAdminRoute(req)")) continue;

  const section = rule.section;
  const next = s
    .replace(/await requireAdminRoute\(req\)/g, `await requireAdminRoute(req, "${section}")`)
    .replace(
      /const session = await requireAdminRoute\(req\)/g,
      `const session = await requireAdminRoute(req, "${section}")`
    );

  if (next !== s) {
    fs.writeFileSync(file, next);
    n++;
    console.log("tagged", rel, section);
  }
}

console.log("done", n);
