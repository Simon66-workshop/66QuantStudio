/**
 * QuantStudio local workbench engine.
 * Reads the vendored QuantSkills library snapshot, local datasets, and
 * confirmation-gated contest plans. Does not place live orders.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, open } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const MAX_BODY = 2_000_000;
export const MAX_MESSAGE = 8000;
const SKILL_SOURCE_CAP = 80_000;
export const MARGIN_PER_LOT = 12_000;
export const SIM_FILL_PRICE = 3184;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeJoin(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw Object.assign(new Error("path-escape"), { status: 400 });
  }
  return resolved;
}

function nowIso() {
  return new Date().toISOString();
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export function joinModelUrl(baseUrl) {
  const base = String(baseUrl || "").trim();
  if (!base) throw httpError("invalid-model-url", 400);
  return new URL("chat/completions", base.endsWith("/") ? base : `${base}/`).toString();
}

function redactSettings(settings) {
  const copy = structuredClone(settings);
  if (copy.model?.apiKey) {
    copy.model.hasKey = true;
    copy.model.apiKeyLast4 = String(copy.model.apiKey).slice(-4);
    delete copy.model.apiKey;
  } else {
    copy.model = { ...(copy.model || {}), hasKey: false };
  }
  if (copy.jev?.apiKey) {
    copy.jev.hasKey = true;
    copy.jev.apiKeyLast4 = String(copy.jev.apiKey).slice(-4);
    delete copy.jev.apiKey;
  } else {
    copy.jev = { ...(copy.jev || {}), hasKey: false };
  }
  return copy;
}

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  if (!src.trim()) {
    throw httpError("invalid-csv", 400);
  }
  if (/^\s*</.test(src)) {
    throw httpError("invalid-csv", 400);
  }

  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  let fieldQuoted = false;
  let afterQuoted = false;
  let i = 0;
  const pushField = () => {
    row.push(fieldQuoted ? cur : cur.trim());
    cur = "";
    fieldQuoted = false;
    afterQuoted = false;
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        quoted = false;
        afterQuoted = true;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (afterQuoted) {
      if (ch === " " || ch === "\t") {
        i += 1;
        continue;
      }
      if (ch !== "," && ch !== "\n" && ch !== "\r") {
        throw httpError("trailing-after-quote", 400);
      }
    }
    if (ch === '"') {
      if (cur.length) throw httpError("unexpected-quote", 400);
      quoted = true;
      fieldQuoted = true;
      afterQuoted = false;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      pushField();
      if (row.some((c) => c !== "") || rows.length === 0) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  if (quoted) throw httpError("unclosed-quote", 400);
  if (cur.length || row.length || fieldQuoted) {
    pushField();
    if (row.some((c) => c !== "")) rows.push(row);
  }
  if (!rows.length) throw httpError("invalid-csv", 400);

  const headers = rows[0];
  if (!headers.length || headers.every((h) => !h)) throw httpError("invalid-csv", 400);
  const seen = new Set();
  for (const h of headers) {
    const key = h || "(empty)";
    if (seen.has(key)) throw httpError("duplicate-columns", 400);
    seen.add(key);
  }
  const width = headers.length;
  const body = [];
  for (const cells of rows.slice(1)) {
    if (cells.length !== width) throw httpError("ragged-row", 400);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });
    body.push(obj);
  }
  return { headers, rows: body };
}
