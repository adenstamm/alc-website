import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve("dist-e2e");
const env = {
  ...process.env,
  VITE_ENABLE_SITE_EVENTS: "false",
  VITE_SUPABASE_URL: "https://playwright.supabase.co",
  VITE_SUPABASE_ANON_KEY: "playwright-anon-key",
  VITE_TURNSTILE_SITE_KEY: "",
};
for (const args of [
  ["node_modules/vite/bin/vite.js", "build", "--outDir", root],
  ["scripts/prerender.mjs", root],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const config = JSON.parse(
  await readFile(path.join(root, "staticwebapp.config.json"), "utf8"),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const route = config.routes.find((r) =>
      r.route.endsWith("*")
        ? pathname.startsWith(r.route.slice(0, -1))
        : pathname === r.route,
    );
    const headers = { ...config.globalHeaders, ...route?.headers };
    // Local HTTP cannot exercise HTTPS upgrading; all other policy is retained.
    headers["Content-Security-Policy"] = headers[
      "Content-Security-Policy"
    ].replace("; upgrade-insecure-requests", "");
    if (route?.redirect) {
      response.writeHead(route.statusCode || 302, {
        ...headers,
        Location: route.redirect + url.search,
      });
      response.end();
      return;
    }
    let file = path.resolve(root, "." + (route?.rewrite || pathname));
    if (!file.startsWith(root + path.sep) && file !== root) {
      response.writeHead(400);
      response.end();
      return;
    }
    let status = 200;
    try {
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      await stat(file);
    } catch {
      status = 404;
      file = path.join(root, "404.html");
    }
    const body = await readFile(file);
    response.writeHead(status, {
      ...headers,
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(500);
    response.end("Test server failed");
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Production fixture server listening on 4173"),
);
