const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "app", "api", "admin");

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name === "route.js") files.push(p);
  }
  return files;
}

function depthToAdminAuth(file) {
  const rel = path.relative(path.join(__dirname, "..", "app", "api", "admin"), file);
  const depth = rel.split(path.sep).length - 1;
  return "../".repeat(depth + 3) + "lib/adminAuth";
}

let updated = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("requirePermission(PERMISSIONS.VIEW_ALL_DATA)")) continue;

  const adminAuthImport = depthToAdminAuth(file);

  src = src.replace(
    /await requirePermission\(PERMISSIONS\.VIEW_ALL_DATA\)/g,
    "await requireAdminRoute(req)"
  );
  src = src.replace(
    /const session = await requirePermission\(PERMISSIONS\.VIEW_ALL_DATA\)/g,
    "const session = await requireAdminRoute(req)"
  );

  if (!src.includes("requireAdminRoute")) continue;

  if (!src.includes("adminAuth")) {
    if (src.includes('from "../../../../lib/middleware/auth"')) {
      src = src.replace(
        'import { requirePermission } from "../../../../lib/middleware/auth";',
        `import { requireAdminRoute } from "${adminAuthImport}";`
      );
    } else if (src.includes("requirePermission") && src.includes("PERMISSIONS")) {
      const permImport = src.match(/import \{ PERMISSIONS \} from ([\"'][^\"']+[\"']);/);
      if (permImport) {
        src = src.replace(permImport[0], "");
        src = `import { requireAdminRoute } from "${adminAuthImport}";\n` + src;
      }
    } else {
      src = `import { requireAdminRoute } from "${adminAuthImport}";\n` + src;
    }
  }

  if (src.includes("PERMISSIONS") && !src.match(/PERMISSIONS\./)) {
    src = src.replace(/import \{ PERMISSIONS \} from [^\n]+\n/g, "");
  }

  fs.writeFileSync(file, src);
  updated++;
  console.log("updated", file);
}

console.log("done", updated);
