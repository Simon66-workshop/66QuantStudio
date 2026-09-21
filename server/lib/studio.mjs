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
