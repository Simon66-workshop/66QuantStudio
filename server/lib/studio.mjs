/**
 * QuantStudio local workbench engine.
 * Reads the vendored QuantSkills library snapshot, local datasets, and
 * confirmation-gated contest plans. Does not place live orders.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

export const MAX_BODY = 2_000_000;
const SKILL_SOURCE_CAP = 80_000;

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

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function numericSeries(rows, key) {
  return rows
    .map((r) => Number(String(r[key]).replaceAll(",", "")))
    .filter((n) => Number.isFinite(n));
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
    maxDd = Math.min(maxDd, v / peak - 1);
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
    .map(
      (s) =>
        `<section class="block"><h2>${escapeHtml(s.title)}</h2>${s.html}</section>`,
    )
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

export function analyzeTable(headers, rows, label = "dataset") {
  const numericKeys = headers.filter((h) => numericSeries(rows, h).length >= Math.max(3, rows.length * 0.5));
  const summary = {};
  for (const key of numericKeys) summary[key] = stats(numericSeries(rows, key));
  const closeKey = headers.find((h) => /close|last|px|price/i.test(h)) || numericKeys.at(-1);
  const close = closeKey ? numericSeries(rows, closeKey) : [];
  const closeStats = close.length ? stats(close) : null;
  const gaps = [];
  if (!rows.length) gaps.push("empty-table");
  if (!numericKeys.length) gaps.push("no-numeric-columns");
  const html = reportHtml({
    title: `${label} 数据核对`,
    kicker: "Quant · workbench",
    disclaimer: "本报告基于工作区已有表格计算，仅供研究参考，不构成投资建议，不承诺未来收益。",
    sections: [
      {
        title: "覆盖与缺口",
        html: `<p>行数 ${rows.length} · 数值列 ${numericKeys.map(escapeHtml).join("、") || "无"}。${
          gaps.length ? `<span class="gap">缺口：${gaps.map(escapeHtml).join("、")}</span>` : "未发现空表缺口。"
        }</p>${close.length ? sparkline(close) : ""}`,
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
  const grouped = new Map();
  for (const row of rows) {
    const date = row.date || row.Date;
    const factor = Number(row.momentum_20 ?? row.factor ?? row.value);
    const fwd = Number(row.fwd_ret_5d ?? row.forward ?? row.ret);
    if (!date || !Number.isFinite(factor) || !Number.isFinite(fwd)) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ factor, fwd });
  }
  for (const [date, items] of grouped) {
    if (items.length < 4) continue;
    const fm = items.reduce((a, b) => a + b.factor, 0) / items.length;
    const rm = items.reduce((a, b) => a + b.fwd, 0) / items.length;
    let num = 0;
    let fd = 0;
    let rd = 0;
    for (const it of items) {
      num += (it.factor - fm) * (it.fwd - rm);
      fd += (it.factor - fm) ** 2;
      rd += (it.fwd - rm) ** 2;
    }
    const denom = Math.sqrt(fd * rd) || 1;
    ic.push({ date, ic: num / denom });
  }
  const values = ic.map((x) => x.ic);
  const st = stats(values);
  const gaps = [];
  if (values.length < 8) gaps.push("insufficient-cross-sections");
  const html = reportHtml({
    title: "单因子截面核对",
    kicker: "skill-factor-evaluate · local",
    disclaimer: "IC 由工作区表格当场计算。主分未调用线上 PandaData；数据不足已标注。研究参考，非投资建议。",
    sections: [
      {
        title: "IC 摘要",
        html: st
          ? `<p>截面 ${st.n} · 均值 ${st.mean.toFixed(4)} · 标准差 ${st.std.toFixed(4)} · IR ${(st.std ? st.mean / st.std : 0).toFixed(3)}</p>${sparkline(values)}`
          : `<p class="gap">无法计算 IC：${gaps.join("、")}</p>`,
      },
    ],
  });
  return { ic, stats: st, gaps, html };
}

function defaultState() {
  return {
    conversations: [],
    messages: {},
    artifacts: {},
    datasets: [],
    favorites: [],
    authoredSkills: [],
    library: { uninstalled: [] },
    contest: {
      enabled: false,
      connected: false,
      account: {
        name: "模拟赛账户（本地演示）",
        equity: 1_000_000,
        available: 820_000,
        margin: 180_000,
        riskRatio: 0.18,
        positions: [{ contract: "rb2610", side: "flat", lots: 0, avg: 0 }],
        orders: [],
        fills: [],
      },
      plans: [],
    },
    jev: {
      running: false,
      templateId: "range",
      contract: "rb2610",
      mode: "autonomous",
      log: [],
      last: null,
    },
    settings: {
      workspaceName: "Simon 工作区",
      appearance: { preset: "mist", animatedBg: true, uiScale: 1, chatScale: 1 },
      model: { baseUrl: "", model: "", apiKey: "" },
      jev: { apiKey: "" },
      pandaData: { connected: false },
    },
  };
}

export async function createStudio(root) {
  const vendorLib = path.join(root, "vendor/quantstudio/assets/library-v2");
  const catalogPath = path.join(root, "server/data/catalog.json");
  const runtimeDir = path.join(root, "server/runtime");
  const statePath = path.join(runtimeDir, "state.json");
  await mkdir(runtimeDir, { recursive: true });
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  let state = defaultState();
  if (existsSync(statePath)) {
    try {
      state = { ...defaultState(), ...JSON.parse(await readFile(statePath, "utf8")) };
    } catch {
      state = defaultState();
    }
  }

  async function persist() {
    const tmp = `${statePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await writeFile(statePath, await readFile(tmp));
  }

  async function seedDatasets() {
    if (state.datasets.length) return;
    const seedDir = path.join(root, "server/data/seed");
    for (const file of ["csi300-daily.csv", "factor-momentum.csv", "rb-minutes.csv"]) {
      const text = await readFile(path.join(seedDir, file), "utf8");
      const parsed = parseCsv(text);
      state.datasets.push({
        id: file.replace(".csv", ""),
        name: file,
        kind: "csv",
        source: "seed",
        createdAt: nowIso(),
        freshness: "research-cache",
        headers: parsed.headers,
        rows: parsed.rows,
      });
    }
    await persist();
  }

  await seedDatasets();

  function skills() {
    const un = new Set(state.library.uninstalled);
    const authored = state.authoredSkills.map((s) => ({ ...s, origin: "local", installed: true }));
    return [...catalog.skills.map((s) => ({ ...s, installed: !un.has(s.id) })), ...authored];
  }

  function experts() {
    return catalog.experts;
  }

  function teams() {
    return catalog.teams;
  }

  function getSkill(id) {
    return skills().find((s) => s.id === id) || null;
  }

  async function skillSource(id) {
    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      const err = new Error("invalid-id");
      err.status = 400;
      throw err;
    }
    const bundled = path.join(root, "server/data/skills", `${id}.md`);
    if (existsSync(bundled)) {
      const text = await readFile(bundled, "utf8");
      return text.slice(0, SKILL_SOURCE_CAP);
    }
    const skill = catalog.skills.find((s) => s.id === id);
    if (!skill || !skill.path) return null;
    const file = safeJoin(vendorLib, "quantskills", skill.path, "source", "SKILL.md");
    const text = await readFile(file, "utf8");
    return text.slice(0, SKILL_SOURCE_CAP);
  }

  function snapshot() {
    return {
      catalog: {
        counts: { skills: skills().length, experts: experts().length, teams: teams().length },
        skills: skills().map(({ role, ...rest }) => rest),
        experts: experts().map((e) => ({
          id: e.id,
          name: e.name,
          revision: e.revision,
          permission: e.permission,
          skills: e.skills,
          excerpt: e.excerpt,
        })),
        teams: teams().map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          lead: t.lead,
          members: t.members,
        })),
      },
      conversations: state.conversations,
      datasets: state.datasets.map(({ rows, ...meta }) => ({
        ...meta,
        rowCount: rows.length,
        preview: rows.slice(0, 8),
      })),
      favorites: state.favorites,
      contest: {
        enabled: state.contest.enabled,
        connected: state.contest.connected,
        account: state.contest.account,
        plans: state.contest.plans,
      },
      jev: { ...state.jev, apiKey: undefined },
      settings: redactSettings(state.settings),
    };
  }

  function createConversation({ kind, title, skillId, expertId, teamId }) {
    const id = `c-${randomUUID().slice(0, 8)}`;
    const conv = {
      id,
      kind: kind || "ordinary",
      title: title || "新会话",
      skillId: skillId || null,
      expertId: expertId || null,
      teamId: teamId || null,
      loadedSkills: skillId ? [skillId] : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.conversations.unshift(conv);
    state.messages[id] = [
      {
        id: `m-${randomUUID().slice(0, 8)}`,
        role: "system",
        text: "QuantStudio 本地工作台已就绪。研究结论来自工作区资料与能力库；赛事写入需你确认。",
        createdAt: nowIso(),
      },
    ];
    return conv;
  }

  function attachContext(conv) {
    const skill = conv.skillId ? getSkill(conv.skillId) : null;
    const expert = conv.expertId ? experts().find((e) => e.id === conv.expertId) : null;
    const team = conv.teamId ? teams().find((t) => t.id === conv.teamId) : null;
    return { skill, expert, team };
  }

  function localReply(conv, userText) {
    const { skill, expert, team } = attachContext(conv);
    const traces = [];
    const artifacts = [];
    traces.push({ step: "parse", detail: "读取需求与当前会话绑定的能力。" });
    if (skill) traces.push({ step: "skill", detail: `加载技能 ${skill.name}` });
    if (expert) traces.push({ step: "expert", detail: `角色 ${expert.name}` });
    if (team) {
      traces.push({ step: "team", detail: `专家团 ${team.name} · lead ${team.lead?.name || ""}` });
      for (const m of team.members || []) traces.push({ step: "delegate", detail: m.name });
    }

    const trade = /(开仓|平仓|撤单|买入|卖出|开多|开空|平多|平空)/.test(userText);
    if (trade && conv.kind === "contest") {
      traces.push({ step: "gate", detail: "检测到交易意图，生成待确认计划，不执行。" });
      const plan = {
        id: `p-${randomUUID().slice(0, 8)}`,
        status: "pending",
        createdAt: nowIso(),
        contract: "rb2610",
        side: /平|撤/.test(userText) ? "close" : "open-long",
        lots: 1,
        type: "market-ioc",
        reason: userText.slice(0, 180),
        quoteTime: nowIso(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      state.contest.plans.unshift(plan);
      return {
        text: `已根据你的描述准备交易计划 ${plan.id}：${plan.contract} ${plan.side} ${plan.lots} 手（市价 IOC）。这是期货模拟赛预演，不会自动下单。请到比赛工作台核对后点击确认执行。`,
        traces,
        artifacts,
        plan,
      };
    }

    const wantFactor = /因子|IC|momentum|evaluate/i.test(userText) || skill?.id?.includes("factor");
    const dataset =
      (wantFactor && state.datasets.find((d) => d.id.includes("factor"))) ||
      state.datasets.find((d) => d.id.includes("csi300")) ||
      state.datasets[0];

    let analysis = null;
    if (dataset) {
      traces.push({ step: "cache", detail: `命中本地缓存 ${dataset.name}（${dataset.freshness}）` });
      analysis = wantFactor && dataset.headers.includes("momentum_20")
        ? evaluateFactor(dataset.rows)
        : analyzeTable(dataset.headers, dataset.rows, dataset.name);
      const artId = `a-${randomUUID().slice(0, 8)}`;
      state.artifacts[artId] = {
        id: artId,
        conversationId: conv.id,
        title: wantFactor ? "因子核对报告" : `${dataset.name} 研究报告`,
        mime: "text/html",
        html: analysis.html,
        createdAt: nowIso(),
      };
      artifacts.push(state.artifacts[artId]);
    } else {
      traces.push({ step: "gap", detail: "工作区无表格缓存，结论标记 insufficient。" });
    }

    const who = expert?.name || team?.name || skill?.name || "工作台助手";
    const gaps = analysis?.gaps?.length ? `缺口：${analysis.gaps.join("、")}。` : "本次使用工作区已有缓存，未请求外部行情。";
    const text = [
      `我是${who}，已按 Quant · Work · Trade 工作台流程处理你的需求。`,
      skill ? `技能约定：${skill.summary || skill.description}` : "未绑定技能时，仅整理工作区资料并给出可复核产物。",
      analysis?.stats
        ? `因子 IC 均值 ${analysis.stats.mean.toFixed(4)}，截面 ${analysis.stats.n}。`
        : analysis?.closeStats
          ? `样本 ${analysis.closeStats.n}，最新 ${analysis.closeStats.last.toFixed(2)}，最大回撤 ${(analysis.closeStats.maxDrawdown * 100).toFixed(2)}%。`
          : "没有足够数值列完成统计。",
      gaps,
      "历史结果不代表未来收益；禁止把本回复读成买卖指令。",
    ].join("\n\n");
    return { text, traces, artifacts };
  }

  async function maybeModel(conv, userText, local) {
    const { baseUrl, model, apiKey } = state.settings.model || {};
    if (!baseUrl || !model || !apiKey) return local;
    const url = new URL("/chat/completions", baseUrl).toString();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are QuantStudio. Research only. Never claim live fills. Mark data gaps." },
            { role: "user", content: userText },
          ],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return local;
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return local;
      return { ...local, text: `${content}\n\n——\n本地核对仍保留在右侧产物中。`, modelUsed: model };
    } catch {
      return { ...local, modelGap: "model-unreachable" };
    } finally {
      clearTimeout(t);
    }
  }

  return {
    snapshot,
    catalog: () => catalog,
    skills,
    experts,
    teams,
    getSkill,
    skillSource,
    settings() {
      return redactSettings(state.settings);
    },
    async updateSettings(patch) {
      if (patch.workspaceName) state.settings.workspaceName = String(patch.workspaceName).slice(0, 80);
      if (patch.appearance) state.settings.appearance = { ...state.settings.appearance, ...patch.appearance };
      if (patch.model) {
        const next = { ...state.settings.model };
        if ("baseUrl" in patch.model) next.baseUrl = String(patch.model.baseUrl || "").slice(0, 300);
        if ("model" in patch.model) next.model = String(patch.model.model || "").slice(0, 80);
        if (typeof patch.model.apiKey === "string" && patch.model.apiKey && !patch.model.apiKey.includes("•")) {
          next.apiKey = patch.model.apiKey.slice(0, 200);
        }
        state.settings.model = next;
      }
      if (patch.jev?.apiKey && !patch.jev.apiKey.includes("•")) {
        state.settings.jev.apiKey = String(patch.jev.apiKey).slice(0, 200);
      }
      await persist();
      return redactSettings(state.settings);
    },
    conversations() {
      return state.conversations;
    },
    conversation(id) {
      const conv = state.conversations.find((c) => c.id === id);
      if (!conv) return null;
      return {
        ...conv,
        messages: state.messages[id] || [],
        artifacts: Object.values(state.artifacts).filter((a) => a.conversationId === id),
      };
    },
    async startConversation(body) {
      const conv = createConversation(body || {});
      await persist();
      return this.conversation(conv.id);
    },
    async loadSkill(id, skillId) {
      const conv = state.conversations.find((c) => c.id === id);
      if (!conv) return null;
      if (!getSkill(skillId)) {
        const err = new Error("unknown-skill");
        err.status = 404;
        throw err;
      }
      if (!conv.loadedSkills.includes(skillId)) conv.loadedSkills.push(skillId);
      conv.skillId = skillId;
      conv.updatedAt = nowIso();
      await persist();
      return this.conversation(id);
    },
    async postMessage(id, text) {
      const conv = state.conversations.find((c) => c.id === id);
      if (!conv) return null;
      const clean = String(text || "").trim().slice(0, 8000);
      if (!clean) {
        const err = new Error("empty");
        err.status = 400;
        throw err;
      }
      const userMsg = { id: `m-${randomUUID().slice(0, 8)}`, role: "user", text: clean, createdAt: nowIso() };
      state.messages[id].push(userMsg);
      let local = localReply(conv, clean);
      local = await maybeModel(conv, clean, local);
      const assistant = {
        id: `m-${randomUUID().slice(0, 8)}`,
        role: "assistant",
        text: local.text,
        traces: local.traces,
        artifacts: (local.artifacts || []).map((a) => a.id),
        createdAt: nowIso(),
      };
      state.messages[id].push(assistant);
      conv.updatedAt = nowIso();
      conv.title = conv.title === "新会话" ? clean.slice(0, 28) : conv.title;
      await persist();
      return this.conversation(id);
    },
    artifact(id) {
      return state.artifacts[id] || null;
    },
    datasets() {
      return state.datasets.map(({ rows, ...meta }) => ({ ...meta, rowCount: rows.length, preview: rows.slice(0, 12) }));
    },
    dataset(id) {
      const ds = state.datasets.find((d) => d.id === id);
      if (!ds) return null;
      return { ...ds, preview: ds.rows.slice(0, 40), rowCount: ds.rows.length };
    },
    async addDataset({ name, csv }) {
      const parsed = parseCsv(csv);
      if (!parsed.headers.length) {
        const err = new Error("invalid-csv");
        err.status = 400;
        throw err;
      }
      const id = `ds-${randomUUID().slice(0, 8)}`;
      state.datasets.unshift({
        id,
        name: String(name || "upload.csv").slice(0, 80),
        kind: "csv",
        source: "upload",
        createdAt: nowIso(),
        freshness: "user-upload",
        headers: parsed.headers,
        rows: parsed.rows.slice(0, 20_000),
      });
      await persist();
      return this.dataset(id);
    },
    async removeDataset(id) {
      if (id.startsWith("csi") || id.startsWith("factor") || id.startsWith("rb-")) {
        const err = new Error("seed-protected");
        err.status = 400;
        throw err;
      }
      state.datasets = state.datasets.filter((d) => d.id !== id);
      await persist();
      return { ok: true };
    },
    async toggleFavorite(item) {
      const key = `${item.kind}:${item.id}`;
      const i = state.favorites.findIndex((f) => `${f.kind}:${f.id}` === key);
      if (i >= 0) state.favorites.splice(i, 1);
      else state.favorites.unshift({ ...item, savedAt: nowIso() });
      await persist();
      return state.favorites;
    },
    async createSkill({ name, description, steps }) {
      const slug = String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "custom";
      const id = `skill-local-${slug}`;
      const skill = {
        id,
        kind: "skill",
        name: String(name || "未命名技能").slice(0, 80),
        description: String(description || "").slice(0, 400),
        summary: String(steps || description || "").slice(0, 420),
        origin: "local",
        installed: true,
        path: null,
      };
      state.authoredSkills.unshift(skill);
      await persist();
      return skill;
    },
    async uninstallSkill(id) {
      if (id.startsWith("skill-local-")) {
        state.authoredSkills = state.authoredSkills.filter((s) => s.id !== id);
      } else if (!state.library.uninstalled.includes(id)) {
        state.library.uninstalled.push(id);
      }
      await persist();
      return { ok: true };
    },
    async installSkill(id) {
      state.library.uninstalled = state.library.uninstalled.filter((x) => x !== id);
      await persist();
      return { ok: true };
    },
    async setContest({ enabled, connected }) {
      if (typeof enabled === "boolean") state.contest.enabled = enabled;
      if (typeof connected === "boolean") state.contest.connected = connected;
      await persist();
      return { enabled: state.contest.enabled, connected: state.contest.connected, account: state.contest.account };
    },
    inspectAccount() {
      return {
        ...state.contest.account,
        inspectedAt: nowIso(),
        readOnly: true,
      };
    },
    async confirmPlan(id) {
      const plan = state.contest.plans.find((p) => p.id === id);
      if (!plan) return null;
      if (plan.status !== "pending") {
        const err = new Error("not-pending");
        err.status = 400;
        throw err;
      }
      plan.status = "executed-sim";
      plan.confirmedAt = nowIso();
      const fill = {
        id: `f-${randomUUID().slice(0, 8)}`,
        planId: plan.id,
        contract: plan.contract,
        side: plan.side,
        lots: plan.lots,
        price: 3184,
        at: nowIso(),
      };
      state.contest.account.fills.unshift(fill);
      if (plan.side === "open-long") {
        state.contest.account.positions = [{ contract: plan.contract, side: "long", lots: plan.lots, avg: 3184 }];
        state.contest.account.available -= 12_000;
        state.contest.account.margin += 12_000;
      } else if (plan.side === "close") {
        state.contest.account.positions = [{ contract: plan.contract, side: "flat", lots: 0, avg: 0 }];
        state.contest.account.available += 12_000;
        state.contest.account.margin = Math.max(0, state.contest.account.margin - 12_000);
      }
      plan.receipt = { fillId: fill.id, note: "本地模拟成交，未连接官方赛事柜台。" };
      await persist();
      return plan;
    },
    async cancelPlan(id) {
      const plan = state.contest.plans.find((p) => p.id === id);
      if (!plan) return null;
      if (plan.status !== "pending") {
        const err = new Error("not-pending");
        err.status = 400;
        throw err;
      }
      plan.status = "cancelled";
      plan.cancelledAt = nowIso();
      await persist();
      return plan;
    },
    jevTemplates() {
      return [
        { id: "range", name: "区间回归", hint: "偏离均线后评估回归" },
        { id: "pullback", name: "趋势回调", hint: "顺势回踩评估" },
        { id: "breakout", name: "突破跟随", hint: "关键位突破评估" },
      ];
    },
    async jevStart({ templateId, contract, mode }) {
      state.jev.running = true;
      state.jev.templateId = templateId || "range";
      state.jev.contract = contract || "rb2610";
      state.jev.mode = mode === "strict" ? "strict" : "autonomous";
      state.jev.log.unshift({ at: nowIso(), event: "start", detail: "本地盯盘开始。无 TypeSafe 密钥时使用规则评估，不自动下单。" });
      await persist();
      return this.jevTick();
    },
    async jevStop() {
      state.jev.running = false;
      for (const plan of state.contest.plans) {
        if (plan.status === "pending" && plan.source === "jev") plan.status = "cancelled";
      }
      state.jev.log.unshift({ at: nowIso(), event: "stop", detail: "已停止；未确认计划已取消。" });
      await persist();
      return state.jev;
    },
    async jevTick() {
      const ds = state.datasets.find((d) => d.id.includes("rb"));
      const closes = ds ? numericSeries(ds.rows, "last") : [];
      const last = closes.at(-1) || 3180;
      const ma = closes.length ? closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length) : last;
      const dev = last - ma;
      let action = "hold";
      let reason = "未达模板参考阈值，主动观望。";
      if (state.jev.templateId === "range" && Math.abs(dev) > 6) {
        action = dev > 0 ? "open-short" : "open-long";
        reason = `价格相对 20 分钟均线偏离 ${dev.toFixed(1)}`;
      } else if (state.jev.templateId === "breakout" && last > Math.max(...closes.slice(-30, -1), last)) {
        action = "open-long";
        reason = "突破近端高点";
      } else if (state.jev.templateId === "pullback" && dev < -3 && last > closes[0]) {
        action = "open-long";
        reason = "趋势中的回踩";
      }
      const pos = state.contest.account.positions[0];
      if (pos?.side === "long" && action.startsWith("open")) action = "hold";
      const decision = {
        at: nowIso(),
        contract: state.jev.contract,
        last,
        ma: Number(ma.toFixed(2)),
        action,
        confidence: action === "hold" ? null : 0.46,
        source: state.settings.jev.apiKey ? "typesafe-configured-not-called-in-workspace" : "local-rules",
        reason,
        note: "动作概率不是交易胜率。生成计划后仍需确认。",
      };
      state.jev.last = decision;
      state.jev.log.unshift({ at: nowIso(), event: "decision", detail: `${action} · ${reason}` });
      state.jev.log = state.jev.log.slice(0, 100);
      if (state.jev.running && action !== "hold") {
        const plan = {
          id: `p-${randomUUID().slice(0, 8)}`,
          status: "pending",
          source: "jev",
          createdAt: nowIso(),
          contract: state.jev.contract,
          side: action,
          lots: 1,
          type: "market-ioc",
          reason,
          quoteTime: nowIso(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        };
        state.contest.plans.unshift(plan);
        decision.planId = plan.id;
      }
      await persist();
      return { jev: state.jev, plans: state.contest.plans.slice(0, 8) };
    },
    hashCatalog() {
      return createHash("sha256").update(JSON.stringify(catalog.counts)).digest("hex").slice(0, 12);
    },
  };
}
