import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTE_META, SITE_ORIGIN } from "../src/data/routeMeta.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "dist");
const sourceHtml = await readFile(path.join(outputRoot, "index.html"), "utf8");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function replaceMetaContent(html, identityAttribute, identityValue, content) {
  const tagPattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${identityAttribute}="${identityValue}")[^>]*>`,
    "i",
  );
  const tag = html.match(tagPattern)?.[0];

  if (!tag || !/\bcontent="[^"]*"/i.test(tag)) {
    throw new Error(`Could not find meta[${identityAttribute}="${identityValue}"] content.`);
  }

  const updatedTag = tag.replace(/\bcontent="[^"]*"/i, `content="${escapeHtml(content)}"`);
  return html.replace(tag, updatedTag);
}

function buildFallback(pathname, meta) {
  const links = Object.entries(ROUTE_META)
    .filter(([, routeMeta]) => !routeMeta.noIndex)
    .map(([route, routeMeta]) => (
      `<a href="${route}">${escapeHtml(routeMeta.title.replace(" | Album Listening Club", ""))}</a>`
    ))
    .join(" · ");

  return [
    `<div id="root" data-prerendered-route="${pathname}">`,
    '  <main id="main-content">',
    `    <h1>${escapeHtml(meta.heading)}</h1>`,
    `    <p>${escapeHtml(meta.description)}</p>`,
    `    <nav aria-label="Public pages">${links}</nav>`,
    "  </main>",
    "</div>",
  ].join("\n");
}

function renderRoute(pathname, meta) {
  const canonicalUrl = `${SITE_ORIGIN}${pathname === "/" ? "" : pathname}`;
  let html = sourceHtml;

  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(meta.title)}</title>`);
  html = replaceMetaContent(html, "name", "description", meta.description);
  html = replaceMetaContent(html, "name", "robots", meta.noIndex ? "noindex, nofollow" : "index, follow");
  html = replaceMetaContent(html, "property", "og:title", meta.title);
  html = replaceMetaContent(html, "property", "og:description", meta.description);
  html = replaceMetaContent(html, "property", "og:url", canonicalUrl);
  html = replaceMetaContent(html, "name", "twitter:title", meta.title);
  html = replaceMetaContent(html, "name", "twitter:description", meta.description);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${canonicalUrl}" />`);
  html = html.replace(
    /<div id="root"[\s\S]*?<\/div>\s*<\/body>/i,
    `${buildFallback(pathname, meta)}\n  </body>`,
  );

  return html;
}

function verifyRoute(html, pathname, meta) {
  const canonicalUrl = `${SITE_ORIGIN}${pathname === "/" ? "" : pathname}`;
  const requiredFragments = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `content="${escapeHtml(meta.description)}"`,
    `href="${canonicalUrl}"`,
    `<h1>${escapeHtml(meta.heading)}</h1>`,
    `data-prerendered-route="${pathname}"`,
  ];

  for (const fragment of requiredFragments) {
    if (!html.includes(fragment)) {
      throw new Error(`Prerender verification failed for ${pathname}: missing ${fragment}`);
    }
  }
}

for (const [pathname, meta] of Object.entries(ROUTE_META)) {
  const html = renderRoute(pathname, meta);
  const routeDirectory = pathname === "/"
    ? outputRoot
    : path.join(outputRoot, pathname.slice(1));
  const outputPath = path.join(routeDirectory, "index.html");

  verifyRoute(html, pathname, meta);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(outputPath, html);
}

console.log(`Prerendered ${Object.keys(ROUTE_META).length} routes with unique metadata and HTML fallbacks.`);
