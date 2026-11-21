import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const base = "/irtaza-website";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  const source = path.join(root, entry.name);
  const destination = path.join(output, entry.name);

  if (entry.name === "assets" && entry.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const asset of await readdir(source, { withFileTypes: true })) {
      if (asset.isFile() && /\.(png|webp|svg|jpe?g)$/i.test(asset.name)) {
        await cp(path.join(source, asset.name), path.join(destination, asset.name));
      }
    }
    continue;
  }

  if (entry.name === "index.html") {
    let html = await readFile(source, "utf8");
    html = html.replaceAll('href="/', `href="${base}/`);
    html = html.replaceAll('"/assets/', `"${base}/assets/`);
    html = html.replace('var key=img.replace(/^\\/?assets\\//,"").replace(/\\.webp$/,"")', 'var key=img.slice(img.lastIndexOf("assets/")+7).replace(/\\.webp$/,"")');
    html = html.replaceAll("https://irtaza-sports.vercel.app", "https://syedmustafabukhari123.github.io/irtaza-website");
    html = html.replace('var url=SITE_ORIGIN+path, imageUrl=', 'var url=SITE_ORIGIN+(path.indexOf(PAGES_BASE)===0?path.slice(PAGES_BASE.length):path), imageUrl=');
    html = html.replace('function categoryPath(id){return "/categories/"', 'function categoryPath(id){return PAGES_BASE+"/categories/"');
    html = html.replace('function productPath(sku){return "/products/"', 'function productPath(sku){return PAGES_BASE+"/products/"');
    html = html.replace('var WA = "https://wa.me/923291633435";', `var PAGES_BASE="${base}";\nvar WA = "https://wa.me/923291633435";`);
    const routeLine = String.raw`var path=decodeURIComponent(location.pathname).replace(/\/+$/,"")||"/";`;
    html = html.replace(routeLine, `${routeLine}\n  if(path===PAGES_BASE||path.indexOf(PAGES_BASE+"/")===0)path=path.slice(PAGES_BASE.length)||"/";`);
    html = html.replace('function navigateTo(path){', `function navigateTo(path){\n  if(path.indexOf(PAGES_BASE)!==0)path=PAGES_BASE+(path.charAt(0)==="/"?path:"/"+path);`);
    await writeFile(destination, html);
    await writeFile(path.join(output, "404.html"), html);
  } else if (["sitemap.xml", "robots.txt"].includes(entry.name)) {
    const text = await readFile(source, "utf8");
    await writeFile(destination, text.replaceAll("https://irtaza-sports.vercel.app", `https://syedmustafabukhari123.github.io${base}`));
  }
}

await writeFile(path.join(output, ".nojekyll"), "");
console.log(`GitHub Pages site built at ${output}`);
