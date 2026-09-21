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
  let i = 0;
  const pushField = () => {
    row.push(fieldQuoted ? cur : cur.trim());
    cur = "";
    fieldQuoted = false;
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
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (cur.length) throw httpError("unexpected-quote", 400);
      quoted = true;
      fieldQuoted = true;
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

export function parseNumber(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || /^(nan|null|na|n\/a|-)$/i.test(s)) return null;
  const n = Number(s.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

function numericSeries(rows, key) {
  return rows.map((r) => parseNumber(r[key])).filter((n) => n != null);
}

function stats(values) {
  if (!values.length) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1);
  const std = Math.sqrt(variance);
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak !== 0) maxDd = Math.min(maxDd, v / peak - 1);
  }
  return {
    n,
    mean,
    std,
    min: Math.min(...values),
    max: Math.max(...values),
    last: values[n - 1],
    maxDrawdown: maxDd,
  };
}

function sparkline(values, w = 320, h = 72) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 8) + 4;
      const y = h - 6 - ((v - min) / span) * (h - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="series"><polyline fill="none" stroke="#d8dce4" stroke-width="1.6" points="${pts}"/></svg>`;
}

function reportHtml({ title, kicker, sections, disclaimer }) {
  const body = sections
    .map((s) => `<section class="block"><h2>${escapeHtml(s.title)}</h2>${s.html}</section>`)
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{margin:0;background:#07080c;color:#eceef2;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;padding:28px}
  h1{font-size:22px;letter-spacing:-.03em;margin:0 0 6px}
  .k{color:#9aa0ab;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
  .block{margin:18px 0;padding:16px 18px;border:1px solid rgb(255 255 255 / .12);border-radius:16px;background:rgb(255 255 255 / .06);backdrop-filter:blur(18px)}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid rgb(255 255 255 / .08)}
  .gap{color:#d4a017}
  .warn{color:#c4453a}
  footer{color:#6d7380;font-size:11px;margin-top:24px}
</style></head><body>
<p class="k">${escapeHtml(kicker)}</p>
<h1>${escapeHtml(title)}</h1>
${body}
<footer>${escapeHtml(disclaimer)}</footer>
</body></html>`;
}

function gapLine(gaps) {
  if (!gaps.length) return "未发现空表缺口。";
  return `<span class="gap">缺口：${gaps.map(escapeHtml).join("、")}</span>`;
}

export function analyzeTable(headers, rows, label = "dataset") {
  const gaps = [];
  if (!rows.length) gaps.push("empty-table");

  const dateKey = headers.find((h) => /^(date|time|datetime|timestamp)$/i.test(h) || /date|time/i.test(h));
  let ordered = rows;
  if (dateKey && rows.length) {
    const stamped = rows.map((r, i) => {
      const raw = r[dateKey];
      const t = Date.parse(raw);
      return { r, i, t: Number.isFinite(t) ? t : Number.NaN, key: String(raw ?? "") };
    });
    if (stamped.some((s) => Number.isNaN(s.t))) gaps.push("invalid-dates");
    const valid = stamped.filter((s) => !Number.isNaN(s.t));
    const seen = new Set();
    for (const s of valid) {
      if (seen.has(s.key)) {
        gaps.push("duplicate-dates");
        break;
      }
      seen.add(s.key);
    }
    let unsorted = false;
    for (let i = 1; i < valid.length; i += 1) {
      if (valid[i].t < valid[i - 1].t) {
        unsorted = true;
        break;
      }
    }
    if (unsorted) gaps.push("unsorted-dates");
    valid.sort((a, b) => a.t - b.t || a.i - b.i);
    ordered = valid.length ? valid.map((s) => s.r) : rows;
  }

  const numericKeys = headers.filter((h) => numericSeries(ordered, h).length >= Math.max(3, ordered.length * 0.5));
  const summary = {};
  for (const key of numericKeys) summary[key] = stats(numericSeries(ordered, key));
  const closeKey = headers.find((h) => /close|last|px|price/i.test(h)) || numericKeys.at(-1);
  const close = closeKey ? numericSeries(ordered, closeKey) : [];
  const closeStats = close.length ? stats(close) : null;
  if (closeKey) {
    const missing = ordered.filter((r) => parseNumber(r[closeKey]) == null).length;
    if (missing) gaps.push("missing-values");
  }
  if (!numericKeys.length) gaps.push("no-numeric-columns");

  const html = reportHtml({
    title: `${label} 数据核对`,
    kicker: "Quant · workbench",
    disclaimer: "本报告基于工作区已有表格计算，仅供研究参考，不构成投资建议，不承诺未来收益。",
    sections: [
      {
        title: "覆盖与缺口",
        html: `<p>行数 ${rows.length} · 有效样本 ${close.length} · 数值列 ${
          numericKeys.map(escapeHtml).join("、") || "无"
        }。时间列按日期排序后计算最新值与回撤。${gapLine(gaps)}</p>${close.length ? sparkline(close) : ""}`,
      },
      {
        title: "描述统计",
        html: `<table><thead><tr><th>列</th><th>n</th><th>均值</th><th>标准差</th><th>最小</th><th>最大</th><th>最新</th><th>最大回撤</th></tr></thead><tbody>${
          numericKeys
            .map((k) => {
              const s = summary[k];
              return `<tr><td>${escapeHtml(k)}</td><td>${s.n}</td><td>${s.mean.toFixed(4)}</td><td>${s.std.toFixed(4)}</td><td>${s.min.toFixed(4)}</td><td>${s.max.toFixed(4)}</td><td>${s.last.toFixed(4)}</td><td>${(s.maxDrawdown * 100).toFixed(2)}%</td></tr>`;
            })
            .join("")
        }</tbody></table>`,
      },
    ],
  });
  return { numericKeys, summary, closeStats, gaps, html, rowCount: rows.length };
}

export function evaluateFactor(rows) {
  const ic = [];
  const gaps = [];
  const grouped = new Map();
  for (const row of rows) {
    const date = row.date || row.Date;
    const factor = parseNumber(row.momentum_20 ?? row.factor ?? row.value);
    const fwd = parseNumber(row.fwd_ret_5d ?? row.forward ?? row.ret);
    if (!date || factor == null || fwd == null) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ factor, fwd, symbol: row.symbol || row.Symbol || "" });
  }
  for (const [date, items] of grouped) {
    const unique = [];
    const seen = new Set();
    for (const it of items) {
      const key = it.symbol || unique.length;
      if (seen.has(key) && it.symbol) {
        gaps.push("duplicate-symbols");
        continue;
      }
      seen.add(key);
      unique.push(it);
    }
    if (unique.length < 4) continue;
    const fm = unique.reduce((a, b) => a + b.factor, 0) / unique.length;
    const rm = unique.reduce((a, b) => a + b.fwd, 0) / unique.length;
    let num = 0;
    let fd = 0;
    let rd = 0;
    for (const it of unique) {
      num += (it.factor - fm) * (it.fwd - rm);
      fd += (it.factor - fm) ** 2;
      rd += (it.fwd - rm) ** 2;
    }
    if (fd === 0 || rd === 0) {
      gaps.push("zero-variance");
      ic.push({ date, ic: null, reason: "zero-variance" });
      continue;
    }
    const denom = Math.sqrt(fd * rd);
    if (!Number.isFinite(denom) || denom === 0) {
      gaps.push("undefined-correlation");
      ic.push({ date, ic: null, reason: "undefined-correlation" });
      continue;
    }
    ic.push({ date, ic: num / denom });
  }
  const values = ic.map((x) => x.ic).filter((n) => n != null);
  const st = stats(values);
  if (values.length < 8) gaps.push("insufficient-cross-sections");
  if (st && st.std === 0) gaps.push("undefined-ir");
  const uniqueGaps = [...new Set(gaps)];
  const irText =
    st && st.std ? (st.mean / st.std).toFixed(3) : "未定义";
  const html = reportHtml({
    title: "单因子截面核对",
    kicker: "skill-factor-evaluate · local",
    disclaimer: "IC 由工作区表格当场计算。主分未调用线上 PandaData；数据不足已标注。研究参考，非投资建议。",
    sections: [
      {
        title: "IC 摘要",
        html: st
          ? `<p>有效截面 ${st.n} · 均值 ${st.mean.toFixed(4)} · 标准差 ${st.std.toFixed(4)} · IR ${irText}</p><p class="gap">${
              uniqueGaps.length ? `缺口：${uniqueGaps.map(escapeHtml).join("、")}` : "未发现截面缺口。"
            }</p>${sparkline(values)}`
          : `<p class="gap">无法计算 IC：${uniqueGaps.map(escapeHtml).join("、") || "no-valid-cross-sections"}</p>`,
      },
    ],
  });
  return { ic, stats: st, gaps: uniqueGaps, html };
}
