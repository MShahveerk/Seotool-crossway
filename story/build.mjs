import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
fs.mkdirSync(path.join(dist, "fonts"), { recursive: true });

fs.copyFileSync(
  path.join(root, "public", "roboseo-mark.png"),
  path.join(dist, "roboseo-mark.png")
);
for (const name of fs.readdirSync(path.join(root, "public", "fonts"))) {
  fs.copyFileSync(path.join(root, "public", "fonts", name), path.join(dist, "fonts", name));
}

const css = fs
  .readFileSync(path.join(root, "src", "style.css"), "utf8")
  .replaceAll('url("/fonts/', 'url("../fonts/');
fs.writeFileSync(path.join(dist, "assets", "style.css"), css);

const content = fs.readFileSync(path.join(root, "src", "content.js"), "utf8");
const main = fs
  .readFileSync(path.join(root, "src", "main.js"), "utf8")
  .replace('import { chapters, site } from "./content.js";\n', "")
  .replace('import "./style.css";\n', "");
fs.writeFileSync(path.join(dist, "assets", "app.js"), `${content}\n${main}`);

const html = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace("<!--build-css-->", '<link rel="stylesheet" href="./assets/style.css" />')
  .replace(
    '<script type="module" src="/src/main.js"></script>',
    '<script type="module" src="./assets/app.js"></script>'
  );
fs.writeFileSync(path.join(dist, "index.html"), html);

console.log("wrote", dist);
