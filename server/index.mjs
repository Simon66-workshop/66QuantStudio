#!/usr/bin/env node
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStudio, MAX_BODY } from "./lib/studio.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3198);
const HOST = process.env.HOST || "0.0.0.0";
const dist = path.join(root, "apps/web/dist");

const studio = await createStudio(root);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {
    "content-type": headers["content-type"] || "application/json; charset=utf-8",
    "content-length": payload.length,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": headers["cache-control"] || "no-store",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'",
    "access-control-allow-origin": headers.origin || "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    ...headers,
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "not-found" });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const err = new Error("payload-too-large");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function serveStatic(req, res, url) {
  if (!existsSync(dist)) {
    send(res, 503, {
      error: "web-ui-not-built",
      hint: "Run npm run build, then npm start. For hot reload: npm run dev and open http://127.0.0.1:5173/",
    });
    return true;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.resolve(dist, `.${rel}`);
  if (!file.startsWith(dist + path.sep) && file !== dist) {
    send(res, 400, { error: "bad-path" });
    return true;
  }
  let target = file;
  if (!existsSync(target) || statSync(target).isDirectory()) {
    target = path.join(dist, "index.html");
  }
  const ext = path.extname(target);
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'self'",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600",
  });
  createReadStream(target).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/health") {
      send(res, 200, {
        ok: true,
        product: "66QuantStudio",
        catalog: studio.hashCatalog(),
        url: `http://127.0.0.1:${PORT}/`,
      });
      return;
    }
    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      send(res, 200, studio.snapshot());
      return;
    }
    if (url.pathname === "/api/settings" && req.method === "GET") {
      send(res, 200, studio.settings());
      return;
    }
    if (url.pathname === "/api/settings" && req.method === "PUT") {
      send(res, 200, await studio.updateSettings(await readBody(req)));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/skills/".length));
      if (url.searchParams.get("source") === "1") {
        const md = await studio.skillSource(id);
        if (!md) return notFound(res);
        send(res, 200, { id, markdown: md });
        return;
      }
      const skill = studio.getSkill(id);
      if (!skill) return notFound(res);
      send(res, 200, skill);
      return;
    }
    if (url.pathname === "/api/skills" && req.method === "POST") {
      send(res, 201, await studio.createSkill(await readBody(req)));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.slice("/api/skills/".length));
      send(res, 200, await studio.uninstallSkill(id));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "POST" && url.pathname.endsWith("/install")) {
      const id = decodeURIComponent(url.pathname.slice("/api/skills/".length, -"/install".length));
      send(res, 200, await studio.installSkill(id));
      return;
    }
    if (url.pathname === "/api/conversations" && req.method === "GET") {
      send(res, 200, studio.conversations());
      return;
    }
    if (url.pathname === "/api/conversations" && req.method === "POST") {
      send(res, 201, await studio.startConversation(await readBody(req)));
      return;
    }
    let m = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (m && req.method === "GET") {
      const conv = studio.conversation(m[1]);
      if (!conv) return notFound(res);
      send(res, 200, conv);
      return;
    }
    m = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (m && req.method === "POST") {
      const body = await readBody(req);
      const conv = await studio.postMessage(m[1], body.text);
      if (!conv) return notFound(res);
      send(res, 200, conv);
      return;
    }
    m = url.pathname.match(/^\/api\/conversations\/([^/]+)\/skills$/);
    if (m && req.method === "POST") {
      const body = await readBody(req);
      send(res, 200, await studio.loadSkill(m[1], body.skillId));
      return;
    }
    m = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
    if (m && req.method === "GET") {
      const art = studio.artifact(m[1]);
      if (!art) return notFound(res);
      send(res, 200, art.html, { "content-type": "text/html; charset=utf-8" });
      return;
    }
    if (url.pathname === "/api/datasets" && req.method === "GET") {
      send(res, 200, studio.datasets());
      return;
    }
    if (url.pathname === "/api/datasets" && req.method === "POST") {
      send(res, 201, await studio.addDataset(await readBody(req)));
      return;
    }
    m = url.pathname.match(/^\/api\/datasets\/([^/]+)$/);
    if (m && req.method === "GET") {
      const ds = studio.dataset(m[1]);
      if (!ds) return notFound(res);
      send(res, 200, ds);
      return;
    }
    if (m && req.method === "DELETE") {
      send(res, 200, await studio.removeDataset(m[1]));
      return;
    }
    if (url.pathname === "/api/favorites" && req.method === "POST") {
      send(res, 200, await studio.toggleFavorite(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/contest" && req.method === "POST") {
      send(res, 200, await studio.setContest(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/contest/inspect" && req.method === "GET") {
      send(res, 200, studio.inspectAccount());
      return;
    }
    m = url.pathname.match(/^\/api\/contest\/plans\/([^/]+)\/confirm$/);
    if (m && req.method === "POST") {
      const plan = await studio.confirmPlan(m[1]);
      if (!plan) return notFound(res);
      send(res, 200, plan);
      return;
    }
    m = url.pathname.match(/^\/api\/contest\/plans\/([^/]+)\/cancel$/);
    if (m && req.method === "POST") {
      const plan = await studio.cancelPlan(m[1]);
      if (!plan) return notFound(res);
      send(res, 200, plan);
      return;
    }
    if (url.pathname === "/api/jev/templates" && req.method === "GET") {
      send(res, 200, studio.jevTemplates());
      return;
    }
    if (url.pathname === "/api/jev/start" && req.method === "POST") {
      send(res, 200, await studio.jevStart(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/jev/stop" && req.method === "POST") {
      send(res, 200, await studio.jevStop());
      return;
    }
    if (url.pathname === "/api/jev/tick" && req.method === "POST") {
      send(res, 200, await studio.jevTick());
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      notFound(res);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    send(res, status, { error: error.message || "server-error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`66QuantStudio web UI  http://127.0.0.1:${PORT}/`);
  console.log(`health                 http://127.0.0.1:${PORT}/api/health`);
  if (!existsSync(dist)) {
    console.log("UI bundle missing — run npm run build (or npm run dev for Vite on :5173)");
  }
});

export { server, studio };
