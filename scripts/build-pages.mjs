import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const githubPages = process.env.GITHUB_ACTIONS === "true" || process.env.VERCEL !== "1";
const pagesBase = githubPages ? "/irtaza-website" : "";
const canonicalOrigin = "https://syedmustafabukhari123.github.io";
const canonicalBase = "/irtaza-website";
const canonicalRoot = canonicalOrigin + canonicalBase;
const sourceHtml = await readFile(path.join(root, "index.html"), "utf8");

function readLiteral(name, ending) {
  const marker = new RegExp(`var\\s+${name}\\s*=\\s*`).exec(sourceHtml);
  if (!marker) throw new Error(`Could not find ${name} in index.html`);
  const valueStart = marker.index + marker[0].length;
  const end = sourceHtml.indexOf(ending, valueStart);
  if (end < 0) throw new Error(`Could not parse ${name} in index.html`);
  return Function(`return (${sourceHtml.slice(valueStart, end + 1)})`)();
}

const categories = readLiteral("CATS", "];");
const categorySlugs = readLiteral("CATEGORY_SLUGS", "};") || {};
const categorySeo = readLiteral("CATEGORY_SEO", "};") || {};
const basicSeo = readLiteral("BASIC_SEO", "};") || {};
const imageWidths = readLiteral("IMGW", "};") || {};
const faqMatch = sourceHtml.match(/var faqs=(\[[\s\S]*?\]);\s*\n\s*var list=/);
if (!faqMatch) throw new Error("Could not find FAQ data in index.html");
const faqs = Function(`return (${faqMatch[1]})`)();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function canonicalUrl(route) {
  return canonicalRoot + (route === "/" ? "/" : route);
}

function assetUrl(asset) {
  return `${canonicalRoot}/assets/${asset.replace(/^\/?assets\//, "")}`;
}

function assetSrcset(asset) {
  const key = asset.replace(/^\/?assets\//, "").replace(/\.webp$/i, "");
  const widths = imageWidths[key];
  if (!widths) return "";
  const stem = asset.replace(/\.webp$/i, "");
  const candidates = [`${stem}-sm.webp ${widths[0]}w`];
  if (widths[1] !== widths[0]) candidates.push(`${stem}-md.webp ${widths[1]}w`);
  if (widths[2] !== widths[1]) candidates.push(`${asset} ${widths[2]}w`);
  return candidates.join(", ");
}

function replaceTagContent(html, tag, id, content) {
  const expression = new RegExp(`(<${tag}\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(<\\/${tag}>)`);
  if (!expression.test(html)) throw new Error(`Missing <${tag} id="${id}">`);
  return html.replace(expression, `$1${content}$2`);
}

// Pull the original templates/data once, then render crawlable route files.
function productFor(category, index) {
  const override = (category.overrides && category.overrides[index]) || {};
  const image = override.img ? `${override.img}.webp` : `${category.id}-${["a", "b", "c"][index % 3]}.webp`;
  return {
    category, index, override, image, name: category.products[index],
    sku: `IS-${category.code}-${String(index + 1).padStart(2, "0")}`,
    fabric: override.fabric || category.fabric,
    sizes: override.sizes || category.sizes,
    design: override.design || category.design,
    logo: override.logo || category.logo,
    moq: override.moq || category.moq,
    specBasis: ["fabric", "sizes", "design", "logo", "moq"].some((key) => override[key]) ? "Per-design specification" : "Category standard",
  };
}

function productUrl(product) {
  return `/products/${product.sku.toLowerCase()}/`;
}

function categoryUrl(category) {
  return `/categories/${categorySlugs[category.id]}/`;
}

function cardMarkup(product) {
  const image = `assets/${product.image}`;
  const href = `${pagesBase}${productUrl(product)}`;
  const srcset = assetSrcset(image);
  const set = srcset ? ` srcset="${escapeHtml(srcset)}"` : "";
  return `<div class="pcard"><a class="ph" href="${href}" data-nav="product" data-sku="${product.sku}"><img loading="lazy" decoding="async" src="${image}"${set} sizes="(max-width: 700px) 46vw, (max-width: 1200px) 31vw, 400px" alt="${escapeHtml(product.name)} by Irtaza Sports — custom ${escapeHtml(product.category.name.toLowerCase())} with Irtaza Sports branding" /></a><div class="inf"><h3>${escapeHtml(product.name)}</h3><div class="sku">SKU · ${product.sku}</div><div class="meta">${escapeHtml(product.design)} · MOQ ${escapeHtml(product.moq)}</div><a class="go" href="${href}" data-nav="product" data-sku="${product.sku}">View Specs →</a></div></div>`;
}

function categoryCardMarkup(category) {
  const image = `assets/tile-${category.id}.webp`;
  const srcset = assetSrcset(image);
  const set = srcset ? ` srcset="${escapeHtml(srcset)}"` : "";
  return `<a class="cat-tile reveal" href="${pagesBase}${categoryUrl(category)}" data-nav="shop" data-cat="${category.id}"><span class="ph"><img loading="lazy" decoding="async" src="${image}"${set} sizes="(max-width: 700px) 46vw, (max-width: 1080px) 31vw, 300px" alt="Custom ${escapeHtml(category.name.toLowerCase())} by Irtaza Sports — made to order in Sialkot" /></span><span class="lb"><b>${escapeHtml(category.name)}</b><span>→</span></span></a>`;
}

function structuredData(page, category, product) {
  const organization = {
    "@type": "Organization", "@id": `${canonicalRoot}/#organization`, name: "Irtaza Sports",
    url: `${canonicalRoot}/`, logo: assetUrl("logo.png"), email: "irtazasport@gmail.com", telephone: "+92-329-1633435",
    address: { "@type": "PostalAddress", streetAddress: "Jodhay Wali, Kalan, Zafarwal Road", addressLocality: "Sialkot", addressCountry: "PK" },
    description: "Manufacturer and exporter of custom teamwear and sportswear from Sialkot, Pakistan.",
  };
  const graph = [organization, { "@type": "WebSite", "@id": `${canonicalRoot}/#website`, name: "Irtaza Sports", url: `${canonicalRoot}/` }];
  graph.push({ "@type": "WebPage", "@id": `${canonicalUrl(page.route)}#webpage`, url: canonicalUrl(page.route), name: page.title, description: page.description, isPartOf: { "@id": `${canonicalRoot}/#website` }, publisher: { "@id": `${canonicalRoot}/#organization` } });

  if (product) {
    graph.push({
      "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: product.category.name, item: canonicalUrl(categoryUrl(product.category)) },
        { "@type": "ListItem", position: 3, name: product.name, item: canonicalUrl(productUrl(product)) },
      ],
    });
    graph.push({
      "@type": "Product", name: product.name, image: assetUrl(product.image), sku: product.sku,
      category: product.category.name,
      description: `${product.name}, made to order in Sialkot with your team colours and branding. ${product.design}. Request a free mockup in 24 hours.`,
      brand: { "@type": "Brand", name: "Irtaza Sports" },
    });
  } else if (category) {
    graph.push({
      "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
        { "@type": "ListItem", position: 2, name: category.name, item: canonicalUrl(categoryUrl(category)) },
      ],
    });
    graph.push({
      "@type": "ItemList", name: `Custom ${category.name} products`, itemListElement: category.products.map((_, index) => {
        const item = productFor(category, index);
        return { "@type": "ListItem", position: index + 1, name: item.name, url: canonicalUrl(productUrl(item)) };
      }),
    });
  } else if (page.route === "/") {
    graph.push({
      "@type": "ItemList", name: "Irtaza Sports product categories", itemListElement: categories.map((item, index) => ({
        "@type": "ListItem", position: index + 1, name: item.name, url: canonicalUrl(categoryUrl(item)),
      })),
    });
  }

  if (page.route === "/faq/") {
    graph.push({
      "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({
        "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function setStructuredData(html, page, category, product) {
  const json = structuredData(page, category, product);
  return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${json}</script>`);
}

function setHead(html, page, category, product) {
  const image = product ? product.image : category ? `tile-${category.id}.webp` : "basketball-a.webp";
  const url = canonicalUrl(page.route);
  const imageUrl = assetUrl(image);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  const replacements = [
    [/name="description"/, page.description],
    [/property="og:url"/, url], [/property="og:title"/, page.title], [/property="og:description"/, page.description], [/property="og:image"/, imageUrl],
    [/name="twitter:title"/, page.title], [/name="twitter:description"/, page.description], [/name="twitter:image"/, imageUrl],
  ];
  for (const [selector, value] of replacements) {
    const expression = new RegExp(`(<meta\\s+${selector.source}\\s+content=")[^"]*("\\s*\\/?>)`);
    html = html.replace(expression, `$1${escapeHtml(value)}$2`);
  }
  return setStructuredData(html, page, category, product);
}

function setActiveView(html, name) {
  if (name === "about" || name === "contact") {
    return html.replace('<div class="view" id="view-home">', `<div class="view active focus-${name}" id="view-home">`);
  }
  const source = `<div class="view" id="view-${name}">`;
  if (!html.includes(source)) throw new Error(`Missing view ${name}`);
  return html.replace(source, `<div class="view active" id="view-${name}">`);
}

function setBase(html) {
  const baseHref = pagesBase ? `${pagesBase}/` : "/";
  html = html.replace('var PAGES_BASE="/irtaza-website";', `var PAGES_BASE="${pagesBase}";`)
    .replace('var ASSET_BASE = location.protocol === "file:" ? "assets/" : "/assets/";', `var ASSET_BASE = location.protocol === "file:" ? "assets/" : "${pagesBase}/assets/";`);
  if (pagesBase) html = html.replaceAll('href="/', `href="${pagesBase}/`);
  return html.replace('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />', `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n<base href="${baseHref}" />`);
}

function staticPage(page, category, product) {
  let html = setBase(sourceHtml);
  if (page.route === "/") {
    html = setActiveView(html, "home");
    html = replaceTagContent(html, "div", "catGrid", categories.map(categoryCardMarkup).join(""));
  } else if (product) {
    html = setActiveView(html, "product");
    const image = `assets/${product.image}`;
    const srcset = assetSrcset(image);
    const backAnchor = html.match(/<a\b[^>]*\bid="pdBack"[^>]*>/)?.[0];
    if (backAnchor) {
      const updatedBackAnchor = backAnchor.replace(/href="[^"]*"/, `href="${pagesBase}${categoryUrl(product.category)}"`).replace(/data-cat="[^"]*"/, `data-cat="${product.category.id}"`);
      html = html.replace(backAnchor, updatedBackAnchor);
    }
    html = replaceTagContent(html, "span", "pdBackCat", escapeHtml(product.category.name));
    html = replaceTagContent(html, "div", "pdCat", `${escapeHtml(product.category.name)} — Custom Range`);
    html = replaceTagContent(html, "h1", "pdName", escapeHtml(product.name));
    html = replaceTagContent(html, "div", "pdSku", `SKU · ${product.sku}`);
    html = html.replace(/(<caption\b[^>]*\bid="pdSpecCap"[^>]*>)[\s\S]*?(<\/caption>)/, `$1Specification — ${escapeHtml(product.category.name)} ${escapeHtml(product.specBasis.toLowerCase())}, confirmed on your factory quotation$2`);
    const rows = [
      ["Design", `${product.name} (${product.sku})`], ["Fabric", product.fabric], ["Sizes", product.sizes],
      ["Design Method", product.design], ["Logo Method", product.logo], ["Minimum Order", product.moq],
      ["Specification Basis", `${product.specBasis} for the ${product.category.name} range — design-specific details are confirmed on your written quotation`],
      ["Mockup", "Free digital mockup within 24 hours"], ["Sample", "Physical sample in 5–7 days on request"],
      ["Production", "Bulk typically 15–25 business days after approval"], ["Price", "Per order — confirmed on your written factory quotation"],
    ];
    html = replaceTagContent(html, "tbody", "pdSpec", rows.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join(""));
    const imageTag = html.match(/<img\b[^>]*\bid="pdImg"[^>]*>/)?.[0];
    if (imageTag) {
      let next = imageTag.replace(/\s+src="[^"]*"/, ` src="${image}"`).replace(/\s+alt="[^"]*"/, ` alt="${escapeHtml(product.name)} by Irtaza Sports — custom ${escapeHtml(product.category.name.toLowerCase())}"`);
      if (srcset) next = next.replace(/\s+decoding="async"/, ` srcset="${escapeHtml(srcset)}" decoding="async"`);
      html = html.replace(imageTag, next);
    }
  } else if (category) {
    html = setActiveView(html, "shop");
    html = replaceTagContent(html, "div", "shopKick", `Products — ${category.products.length} Designs`);
    html = replaceTagContent(html, "h1", "shopTitle", escapeHtml(category.name));
    html = replaceTagContent(html, "p", "shopBlurb", escapeHtml(category.blurb));
    const categoryLinks = categories.map((item) => `<a class="chip${item.id === category.id ? " on" : ""}" href="${pagesBase}${categoryUrl(item)}" data-nav="shop" data-cat="${item.id}">${escapeHtml(item.name)}</a>`).join("");
    html = replaceTagContent(html, "div", "catChips", categoryLinks);
    html = replaceTagContent(html, "div", "shopGrid", category.products.map((_, index) => cardMarkup(productFor(category, index))).join(""));
  } else if (page.route === "/faq/") {
    html = setActiveView(html, "faq");
    html = html.replace(/<div class="sec-head reveal">\s*<div><h2>FAQ<\/h2><\/div>/, '<div class="sec-head reveal"><div><h1 style="font-size:clamp(38px,6vw,64px)">Frequently Asked Questions</h1></div>');
    html = replaceTagContent(html, "div", "faqList", faqs.map(([question, answer]) => `<details class="faq"><summary>${escapeHtml(question)}</summary><div class="a">${escapeHtml(answer)}</div></details>`).join(""));
  } else if (page.route === "/about/" || page.route === "/contact/") {
    html = setActiveView(html, page.route === "/about/" ? "about" : "contact");
    if (page.route === "/about/") html = html.replace("<h2>Made in Sialkot.<br />Worn Worldwide.</h2>", "<h1>Made in Sialkot.<br />Worn Worldwide.</h1>");
    else html = html.replace("<h2>Talk to the Factory</h2>", "<h1>Talk to the Factory</h1>");
  } else {
    const name = page.route.replace(/^\//, "").replace(/\/$/, "");
    html = setActiveView(html, name);
  }
  return setHead(html, page, category, product);
}

function categoryPage(category) {
  const seo = categorySeo[category.id] || categorySeo.basketball;
  return { title: seo[0], description: seo[1], route: categoryUrl(category), category };
}

const pages = [{ title: "Custom Sportswear Manufacturer in Sialkot, Pakistan | Irtaza Sports", description: "Custom team uniforms for basketball, baseball and football, made in Sialkot and shipped worldwide. Get a free mockup in 24 hours; teamwear starts at 10 pieces.", route: "/" }];
for (const category of categories) {
  pages.push(categoryPage(category));
  for (let index = 0; index < category.products.length; index++) {
    const product = productFor(category, index);
    pages.push({ title: `${product.name} | Custom ${category.name} | Irtaza Sports`, description: `Explore ${product.name} by Irtaza Sports. Custom ${category.name.toLowerCase()} made to order in Sialkot with your colours and branding. Request a free mockup in 24 hours.`, route: productUrl(product), category, product });
  }
}
for (const [name, [title, description]] of Object.entries(basicSeo)) {
  pages.push({ title, description, route: `/${name}/` });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.name === "assets" && entry.isDirectory()) {
    const destination = path.join(output, "assets");
    await mkdir(destination, { recursive: true });
    for (const asset of await readdir(path.join(root, "assets"), { withFileTypes: true })) {
      if (asset.isFile() && /\.(png|webp|svg|jpe?g)$/i.test(asset.name)) await cp(path.join(root, "assets", asset.name), path.join(destination, asset.name));
    }
  }
}

for (const page of pages) {
  const html = staticPage(page, page.category, page.product);
  if (page.route === "/") {
    await writeFile(path.join(output, "index.html"), html);
    continue;
  }
  const directory = path.join(output, page.route.replace(/^\//, ""));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html);
}

const notFound = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${pagesBase ? `${pagesBase}/` : "/"}"><title>Page not found | Irtaza Sports</title><style>body{font:18px/1.6 Arial,sans-serif;background:#fbf8f0;color:#171717;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px}main{max-width:620px}a{color:#e51b27;font-weight:700}</style></head><body><main><p>IRTaza Sports · Sialkot, Pakistan</p><h1>Page not found</h1><p>The page may have moved. Browse our sportswear ranges or return to the homepage.</p><a href="${pagesBase}/">Go to Irtaza Sports</a></main></body></html>`;
await writeFile(path.join(output, "404.html"), notFound);

const sitemapRoutes = pages.map((page) => canonicalUrl(page.route));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(output, "sitemap.xml"), sitemap);
await writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${canonicalRoot}/sitemap.xml\n`);
await writeFile(path.join(output, ".nojekyll"), "");
console.log(`Built ${pages.length} crawlable HTML pages at ${output}`);
