#!/usr/bin/env node
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStudio, MAX_BODY } from "./lib/studio.mjs";
import {
  assertSafeHost,
  assertSafeOrigin,
  corsHeaders,
  decodePath,
  isStaticAssetPath,
  parseRequestUrl,
} from "./lib/http-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3198);
const HOST = process.env.HOST || "127.0.0.1";
const dist = path.join(root, "apps/web/dist");

const major = Number(process.versions.node.split(".")[0]);
const minor = Number(process.versions.node.split(".")[1] || 0);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`66QuantStudio needs Node.js 22.12+ (current ${process.versions.node}).`);
  process.exit(1);
}

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

function send(res, req, status, body, headers = {}) {
  const payload = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {
    "content-type": headers["content-type"] || "application/json; charset=utf-8",
    "content-length": payload.length,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": headers["cache-control"] || "no-store",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'",
    ...corsHeaders(req, PORT),
    ...headers,
  });
  res.end(payload);
}

function notFound(res, req) {
  send(res, req, 404, { error: "not-found" });
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

function assertCsrf(req) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const token = req.headers["x-studio-csrf"];
  if (!token || token !== studio.csrfToken()) {
    throw Object.assign(new Error("csrf"), { status: 403 });
  }
}

function serveStatic(req, res, url) {
  if (!existsSync(dist)) {
    send(res, req, 503, {
      error: "web-ui-not-built",
      hint: "Run npm run build, then npm start. For hot reload: npm run dev and open http://127.0.0.1:5173/",
    });
    return true;
  }
  let rel = decodePath(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.resolve(dist, `.${rel}`);
  if (!file.startsWith(dist + path.sep) && file !== dist) {
    send(res, req, 400, { error: "bad-path" });
    return true;
  }
  const exists = existsSync(file) && statSync(file).isFile();
  if (!exists && isStaticAssetPath(rel)) {
    send(res, req, 404, { error: "not-found" });
    return true;
  }
  const target = exists ? file : path.join(dist, "index.html");
  const ext = path.extname(target);
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'self'",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600",
    ...corsHeaders(req, PORT),
  });
  createReadStream(target).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      try {
        assertSafeHost(req.headers.host);
        assertSafeOrigin(req.headers.origin, PORT);
        send(res, req, 204, "");
      } catch (error) {
        send(res, req, error.status || 403, { error: error.message || "forbidden" });
      }
      return;
    }

    let url;
    try {
      assertSafeHost(req.headers.host);
      url = parseRequestUrl(req);
    } catch (error) {
      send(res, req, error.status || 400, { error: error.message || "bad-request" });
      return;
    }

    if (url.pathname === "/api/health") {
      send(res, req, 200, {
        ok: true,
        product: "66QuantStudio",
        catalog: studio.hashCatalog(),
        url: `http://127.0.0.1:${PORT}/`,
      });
      return;
    }

    try {
      assertSafeOrigin(req.headers.origin, PORT);
      assertCsrf(req);
    } catch (error) {
      send(res, req, error.status || 403, { error: error.message || "forbidden" });
      return;
    }

    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      send(res, req, 200, studio.snapshot());
      return;
    }
    if (url.pathname === "/api/settings" && req.method === "GET") {
      send(res, req, 200, studio.settings());
      return;
    }
    if (url.pathname === "/api/settings" && req.method === "PUT") {
      send(res, req, 200, await studio.updateSettings(await readBody(req)));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "GET") {
      const id = decodePath(url.pathname.slice("/api/skills/".length));
      if (url.searchParams.get("source") === "1") {
        const md = await studio.skillSource(id);
        if (!md) return notFound(res, req);
        send(res, req, 200, { id, markdown: md });
        return;
      }
      const skill = studio.getSkill(id);
      if (!skill) return notFound(res, req);
      send(res, req, 200, skill);
      return;
    }
    if (url.pathname === "/api/skills" && req.method === "POST") {
      send(res, req, 201, await studio.createSkill(await readBody(req)));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "DELETE") {
      const id = decodePath(url.pathname.slice("/api/skills/".length));
      send(res, req, 200, await studio.uninstallSkill(id));
      return;
    }
    if (url.pathname.startsWith("/api/skills/") && req.method === "POST" && url.pathname.endsWith("/install")) {
      const id = decodePath(url.pathname.slice("/api/skills/".length, -"/install".length));
      send(res, req, 200, await studio.installSkill(id));
      return;
    }
    if (url.pathname === "/api/conversations" && req.method === "GET") {
      send(res, req, 200, studio.conversations());
      return;
    }
    if (url.pathname === "/api/conversations" && req.method === "POST") {
      send(res, req, 201, await studio.startConversation(await readBody(req)));
      return;
    }
    let m = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (m && req.method === "GET") {
      const conv = studio.conversation(decodePath(m[1]));
      if (!conv) return notFound(res, req);
      send(res, req, 200, conv);
      return;
    }
    m = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (m && req.method === "POST") {
      const body = await readBody(req);
      const conv = await studio.postMessage(decodePath(m[1]), body.text, {
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
      });
      if (!conv) return notFound(res, req);
      send(res, req, 200, conv);
      return;
    }
    m = url.pathname.match(/^\/api\/conversations\/([^/]+)\/skills$/);
    if (m && req.method === "POST") {
      const body = await readBody(req);
      send(res, req, 200, await studio.loadSkill(decodePath(m[1]), body.skillId));
      return;
    }
    m = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
    if (m && req.method === "GET") {
      const art = studio.artifact(decodePath(m[1]));
      if (!art) return notFound(res, req);
      send(res, req, 200, art.html, { "content-type": "text/html; charset=utf-8" });
      return;
    }
    if (url.pathname === "/api/datasets" && req.method === "GET") {
      send(res, req, 200, studio.datasets());
      return;
    }
    if (url.pathname === "/api/datasets" && req.method === "POST") {
      send(res, req, 201, await studio.addDataset(await readBody(req)));
      return;
    }
    m = url.pathname.match(/^\/api\/datasets\/([^/]+)$/);
    if (m && req.method === "GET") {
      const ds = studio.dataset(decodePath(m[1]));
      if (!ds) return notFound(res, req);
      send(res, req, 200, ds);
      return;
    }
    if (m && req.method === "DELETE") {
      send(res, req, 200, await studio.removeDataset(decodePath(m[1])));
      return;
    }
    if (url.pathname === "/api/favorites" && req.method === "POST") {
      send(res, req, 200, await studio.toggleFavorite(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/contest" && req.method === "POST") {
      send(res, req, 200, await studio.setContest(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/contest/inspect" && req.method === "GET") {
      send(res, req, 200, studio.inspectAccount());
      return;
    }
    m = url.pathname.match(/^\/api\/contest\/plans\/([^/]+)\/confirm$/);
    if (m && req.method === "POST") {
      const plan = await studio.confirmPlan(decodePath(m[1]));
      if (!plan) return notFound(res, req);
      send(res, req, 200, plan);
      return;
    }
    m = url.pathname.match(/^\/api\/contest\/plans\/([^/]+)\/cancel$/);
    if (m && req.method === "POST") {
      const plan = await studio.cancelPlan(decodePath(m[1]));
      if (!plan) return notFound(res, req);
      send(res, req, 200, plan);
      return;
    }
    if (url.pathname === "/api/jev/templates" && req.method === "GET") {
      send(res, req, 200, studio.jevTemplates());
      return;
    }
    if (url.pathname === "/api/jev/start" && req.method === "POST") {
      send(res, req, 200, await studio.jevStart(await readBody(req)));
      return;
    }
    if (url.pathname === "/api/jev/stop" && req.method === "POST") {
      send(res, req, 200, await studio.jevStop());
      return;
    }
    if (url.pathname === "/api/jev/tick" && req.method === "POST") {
      send(res, req, 200, await studio.jevTick());
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      notFound(res, req);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    if (!res.headersSent) send(res, req, status, { error: error.message || "server-error" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a free port.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`66QuantStudio web UI  http://127.0.0.1:${PORT}/`);
  console.log(`health                 http://127.0.0.1:${PORT}/api/health`);
  if (!existsSync(dist)) {
    console.log("UI bundle missing — run npm run build (or npm run dev for Vite on :5173)");
  }
});

export { server, studio };
