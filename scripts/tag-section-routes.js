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
  { match: "post-automation", section: "post-automation" },
  { match: "blog-automation", section: "blog-automation" },
  { match: "post-publish-config", section: "post-automation" },
  { match: "blog-publish-config", section: "blog-automation" },
  { match: path.join("board", "posts"), section: "post-board" },
  { match: path.join("board", "blogs"), section: "blog-board" },
];

let n = 0;
for (const file of walk(path.join("app", "api", "admin"))) {
  const normalized = file.split(path.sep).join("/");
  const rule = rules.find((r) => normalized.includes(r.match.replace(/\\/g, "/")));
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
    console.log("tagged", file, section);
  }
}

console.log("done", n);
