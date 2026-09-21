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
