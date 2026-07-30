const fs = require("fs");

const single = [
  ["app/api/admin/blogs/[id]/logs/route.js", "GET"],
  ["app/api/admin/blogs/[id]/publish-now/route.js", "POST"],
  ["app/api/admin/blogs/[id]/revisions/route.js", "GET"],
  ["app/api/admin/blogs/[id]/revisions/[revisionId]/restore/route.js", "POST"],
  ["app/api/admin/post-automation/runs/[id]/route.js", "GET"],
  ["app/api/admin/post-automation/runs/[id]/cancel/route.js", "POST"],
  ["app/api/admin/blog-automation/runs/[id]/route.js", "GET"],
  ["app/api/admin/blog-automation/runs/[id]/cancel/route.js", "POST"],
];

for (const [file, method] of single) {
  let s = fs.readFileSync(file, "utf8");
  const next = s.replace(
    "export async function (req",
    `export async function ${method}(req`
  );
  if (next === s) {
    console.log("NO CHANGE", file);
    continue;
  }
  fs.writeFileSync(file, next);
  console.log("fixed", method, file);
}

const blogsPath = "app/api/admin/blogs/[id]/route.js";
let blogs = fs.readFileSync(blogsPath, "utf8");
const parts = blogs.split("export async function (req");
if (parts.length !== 3) {
  console.error("Unexpected blogs/[id]/route.js shape", parts.length);
  process.exit(1);
}
blogs = parts[0] + "export async function GET(req" + parts[1] + "export async function DELETE(req" + parts[2];
fs.writeFileSync(blogsPath, blogs);
console.log("fixed GET+DELETE", blogsPath);

const remaining = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${ent.name}`;
    if (ent.isDirectory()) walk(p);
    else if (ent.name === "route.js") {
      const s = fs.readFileSync(p, "utf8");
      if (/export async function\s*\(/.test(s)) remaining.push(p);
    }
  }
}
walk("app/api");
if (remaining.length) {
  console.error("Still broken:", remaining);
  process.exit(1);
}
console.log("all clear");
