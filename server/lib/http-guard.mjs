/**
 * Host/Origin/URL guards so a single malformed request cannot take down the process
 * and another loopback origin cannot read or mutate the workspace.
 */

export function loopbackHosts() {
  return new Set(["127.0.0.1", "localhost", "::1"]);
}

export function allowedOrigins(port) {
  const p = String(port);
  const hosts = ["127.0.0.1", "localhost"];
  const extras = (process.env.QS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origins = [];
  for (const h of hosts) {
    origins.push(`http://${h}:${p}`);
    origins.push(`http://${h}:5173`);
    origins.push(`http://${h}:4173`);
  }
  origins.push(...extras);
  return new Set(origins);
}

export function parseRequestUrl(req) {
  try {
    return new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    throw Object.assign(new Error("bad-url"), { status: 400 });
  }
}

export function assertSafeHost(hostHeader) {
  if (hostHeader == null || hostHeader === "") return;
  let parsed;
  try {
    parsed = new URL(`http://${hostHeader}`);
  } catch {
    throw Object.assign(new Error("bad-host"), { status: 400 });
  }
  const hostname = String(parsed.hostname || "").replace(/^\[|\]$/g, "");
  if (!loopbackHosts().has(hostname)) {
    throw Object.assign(new Error("forbidden-host"), { status: 400 });
  }
}

export function assertSafeOrigin(origin, port) {
  if (!origin) return;
  if (!allowedOrigins(port).has(origin)) {
    throw Object.assign(new Error("forbidden-origin"), { status: 403 });
  }
}

export function corsHeaders(req, port) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins(port).has(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "content-type, x-studio-csrf, idempotency-key",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-credentials": "true",
      vary: "Origin",
    };
  }
  return { vary: "Origin" };
}

export function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw Object.assign(new Error("bad-path"), { status: 400 });
  }
}

export function isStaticAssetPath(rel) {
  if (rel.startsWith("/assets/")) return true;
  return /\.(js|css|map|mjs|cjs|json|png|jpe?g|gif|svg|ico|woff2?|ttf|txt)$/i.test(rel);
}
