import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import {
  analyzeTable,
  evaluateFactor,
  parseCsv,
  parseTradeIntent,
  joinModelUrl,
  createStudio,
} from "../lib/studio.mjs";
import { parseRequestUrl, assertSafeHost, assertSafeOrigin, isStaticAssetPath } from "../lib/http-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function tmpStudio(seedMutator) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "qs-"));
  await cp(path.join(root, "server/data"), path.join(tmp, "server/data"), { recursive: true });
  if (seedMutator) await seedMutator(tmp);
  const studio = await createStudio(tmp);
  return { tmp, studio };
}

test("csv quoted newline stays one field; illegal csv is rejected", async () => {
  const parsed = parseCsv('date,note,close\n2020-01-01,"first\nsecond",100\n2020-01-02,ok,110\n');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].note, "first\nsecond");
  assert.equal(parsed.rows[0].close, "100");
  assert.throws(() => parseCsv("date,date\n1,2"), /duplicate-columns/);
  assert.throws(() => parseCsv('date,note\n"unclosed'), /unclosed-quote/);
  assert.throws(() => parseCsv("<html>not a CSV</html>"), /invalid-csv/);
});

test("blank price is missing, not a -100% drawdown", () => {
  const a = analyzeTable(
    ["date", "close"],
    [
      { date: "2020-01-01", close: "100" },
      { date: "2020-01-02", close: "" },
      { date: "2020-01-03", close: "110" },
    ],
    "t",
  );
  assert.ok(a.gaps.includes("missing-values"));
  assert.equal(a.closeStats.n, 2);
  assert.equal(a.closeStats.min, 100);
  assert.notEqual(a.closeStats.maxDrawdown, -1);
  assert.ok(a.closeStats.maxDrawdown > -0.5);
});

test("drawdown and latest follow date order not file order", () => {
  const a = analyzeTable(
    ["date", "close"],
    [
      { date: "2020-01-03", close: "110" },
      { date: "2020-01-01", close: "100" },
      { date: "2020-01-02", close: "90" },
    ],
    "t",
  );
  assert.ok(a.gaps.includes("unsorted-dates"));
  assert.equal(a.closeStats.last, 110);
  assert.ok(Math.abs(a.closeStats.maxDrawdown - -0.1) < 1e-9);
});

test("zero-variance IC is undefined and HTML shows the gap", () => {
  const rows = [];
  for (let d = 1; d <= 8; d += 1) {
    for (let s = 0; s < 4; s += 1) {
      rows.push({ date: `2020-01-0${d}`, symbol: `s${s}`, momentum_20: 1, fwd_ret_5d: s * 0.01 });
    }
  }
  const r = evaluateFactor(rows);
  assert.ok(r.gaps.includes("zero-variance"));
  assert.equal(r.stats, null);
  assert.match(r.html, /zero-variance|无法计算/);
});

test("insufficient cross-sections appear in HTML even when a value exists", () => {
  const rows = [
    { date: "d1", symbol: "a", momentum_20: 1, fwd_ret_5d: 0.01 },
    { date: "d1", symbol: "b", momentum_20: 2, fwd_ret_5d: 0.02 },
    { date: "d1", symbol: "c", momentum_20: 3, fwd_ret_5d: 0.03 },
    { date: "d1", symbol: "d", momentum_20: 4, fwd_ret_5d: 0.04 },
  ];
  const r = evaluateFactor(rows);
  assert.ok(r.gaps.includes("insufficient-cross-sections"));
  assert.match(r.html, /insufficient-cross-sections|缺口/);
});

test("trade parser keeps contract, side, lots; cancel is not close", () => {
  const short = parseTradeIntent("开空 cu2701 5手");
  assert.equal(short.side, "open-short");
  assert.equal(short.contract, "cu2701");
  assert.equal(short.lots, 5);
  const cancel = parseTradeIntent("撤单 rb2610");
  assert.equal(cancel.action, "cancel");
  assert.equal(cancel.contract, "rb2610");
  const missing = parseTradeIntent("开空 5手");
  assert.equal(missing.action, "reject");
});

test("model url keeps /v1 prefix", () => {
  assert.equal(joinModelUrl("http://127.0.0.1:3201/v1"), "http://127.0.0.1:3201/v1/chat/completions");
  assert.equal(joinModelUrl("http://127.0.0.1:3201/v1/"), "http://127.0.0.1:3201/v1/chat/completions");
});

test("malformed host and asset paths do not use Host in URL parse", () => {
  const url = parseRequestUrl({ url: "/api/health" });
  assert.equal(url.pathname, "/api/health");
  assert.throws(() => assertSafeHost("["), /bad-host/);
  assert.throws(() => assertSafeOrigin("http://127.0.0.1:3201", 3198), /forbidden-origin/);
  assert.equal(isStaticAssetPath("/assets/astra-nonexistent.js"), true);
  assert.equal(isStaticAssetPath("/conversations/abc"), false);
});

test("concurrent skill creates persist without corrupting state.json", async () => {
  const { tmp, studio } = await tmpStudio();
  const results = await Promise.allSettled(
    Array.from({ length: 24 }, (_, i) =>
      studio.createSkill({ name: `astra-${i}`, description: "n".repeat(8 + (i % 5)) }),
    ),
  );
  assert.equal(results.every((r) => r.status === "fulfilled"), true);
  const statePath = path.join(tmp, "server/runtime/state.json");
  const parsed = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(parsed.authoredSkills.length, 24);
  const again = await createStudio(tmp);
  assert.equal(again.skills().filter((s) => s.origin === "local").length, 24);
  await rm(tmp, { recursive: true, force: true });
});

test("corrupt state is backed up instead of silently becoming an empty workspace overwrite-only", async () => {
  const { tmp } = await tmpStudio();
  const statePath = path.join(tmp, "server/runtime/state.json");
  await writeFile(statePath, "{not-json");
  const studio = await createStudio(tmp);
  const snap = studio.snapshot();
  assert.equal(snap.recovery?.error, "state-json-corrupt");
  const backups = (await import("node:fs")).readdirSync(path.join(tmp, "server/runtime")).filter((f) => f.includes("corrupt"));
  assert.ok(backups.length >= 1);
  await rm(tmp, { recursive: true, force: true });
});

test("named upload is analyzed instead of seed factor table", async () => {
  const { tmp, studio } = await tmpStudio();
  await studio.addDataset({
    name: "astra-price.csv",
    csv: "date,close\n2020-01-01,100\n2020-01-02,120\n2020-01-03,90\n",
  });
  const conv = await studio.startConversation({ kind: "ordinary", title: "研究" });
  const after = await studio.postMessage(conv.id, "只分析我刚上传的astra-price.csv，告诉我最新收盘和最大回撤。");
  const text = after.messages.at(-1).text;
  assert.match(text, /astra-price\.csv/);
  assert.match(text, /最新 90/);
  assert.match(text, /最大回撤 -25/);
  assert.doesNotMatch(text, /IC 均值/);
  await rm(tmp, { recursive: true, force: true });
});

test("ledger accumulates lots and open-short opens a short; expiry and offline refuse confirm", async () => {
  const { tmp, studio } = await tmpStudio();
  await studio.setContest({ enabled: true, connected: true });
  const conv = await studio.startConversation({ kind: "contest", title: "期货" });
  await studio.postMessage(conv.id, "开多 rb2610 1手");
  await studio.postMessage(conv.id, "开多 rb2610 1手");
  const longs = studio.snapshot().contest.plans.filter((p) => p.side === "open-long" && p.status === "pending");
  assert.equal(longs.length, 2);
  await studio.confirmPlan(longs[1].id);
  await studio.confirmPlan(longs[0].id);
  const acc = studio.inspectAccount();
  const pos = acc.positions.find((p) => p.contract === "rb2610");
  assert.equal(pos.lots, 2);
  assert.equal(pos.side, "long");
  assert.equal(acc.fills.length, 2);
  assert.equal(acc.margin, 24000);
  assert.equal(acc.available, 976000);

  await studio.postMessage(conv.id, "开空 cu2701 5手");
  const shortPlan = studio.snapshot().contest.plans.find((p) => p.contract === "cu2701");
  assert.equal(shortPlan.side, "open-short");
  assert.equal(shortPlan.lots, 5);
  await studio.confirmPlan(shortPlan.id);
  const shortPos = studio.inspectAccount().positions.find((p) => p.contract === "cu2701");
  assert.equal(shortPos.side, "short");
  assert.equal(shortPos.lots, 5);

  await studio.postMessage(conv.id, "撤单 rb2610");
  assert.equal(
    studio.snapshot().contest.plans.filter((p) => p.contract === "rb2610" && p.status === "pending").length,
    0,
  );

  await studio.postMessage(conv.id, "开多 rb2610 1手");
  const extra = studio.snapshot().contest.plans.find((p) => p.status === "pending");
  extra.expiresAt = "2000-01-01T00:00:00.000Z";
  await assert.rejects(() => studio.confirmPlan(extra.id), /plan-expired/);
  await studio.postMessage(conv.id, "开多 rb2610 1手");
  const live = studio.snapshot().contest.plans.find((p) => p.status === "pending");
  await studio.setContest({ enabled: false, connected: false });
  await assert.rejects(() => studio.confirmPlan(live.id), /contest-offline/);
  assert.equal(studio.inspectAccount().fills.length, 3);
  await rm(tmp, { recursive: true, force: true });
});

test("breakout compares last against prior window high", async () => {
  const { tmp, studio } = await tmpStudio(async (dir) => {
    const lines = ["datetime,last"];
    for (let i = 0; i < 30; i += 1) lines.push(`t${i},100`);
    lines.push("t30,130");
    await writeFile(path.join(dir, "server/data/seed/rb-minutes.csv"), `${lines.join("\n")}\n`);
  });
  await studio.setContest({ enabled: true, connected: true });
  const out = await studio.jevStart({ templateId: "breakout", contract: "rb2610", mode: "autonomous" });
  assert.equal(out.jev.last.action, "open-long");
  assert.ok(out.plans.some((p) => p.status === "pending" && p.side === "open-long"));
  const again = await studio.jevTick();
  const pending = again.plans.filter((p) => p.status === "pending" && p.source === "jev");
  assert.equal(pending.length, 1);
  await rm(tmp, { recursive: true, force: true });
});

test("skills get unique ids; uninstalled and unknown cannot start", async () => {
  const { tmp, studio } = await tmpStudio();
  const a = await studio.createSkill({ name: "同名技能", description: "one" });
  const b = await studio.createSkill({ name: "同名技能", description: "two" });
  assert.notEqual(a.id, b.id);
  await studio.uninstallSkill("skill-daily-report");
  await assert.rejects(() => studio.startConversation({ skillId: "skill-daily-report" }), /skill-not-installed/);
  await assert.rejects(() => studio.startConversation({ skillId: "astra-does-not-exist" }), /unknown-skill/);
  await rm(tmp, { recursive: true, force: true });
});

test("idempotency and too-long messages", async () => {
  const { tmp, studio } = await tmpStudio();
  const conv = await studio.startConversation({ kind: "ordinary" });
  await studio.postMessage(conv.id, "hello", { idempotencyKey: "k1" });
  await studio.postMessage(conv.id, "hello", { idempotencyKey: "k1" });
  const users = studio.conversation(conv.id).messages.filter((m) => m.role === "user");
  assert.equal(users.length, 1);
  await assert.rejects(() => studio.postMessage(conv.id, `${"A".repeat(8001)}ASTRA-END`), /too-long/);
  await rm(tmp, { recursive: true, force: true });
});

test("malformed Host on a live process returns 400 and keeps serving", async () => {
  const { spawn } = await import("node:child_process");
  const distDir = path.join(root, "apps/web/dist");
  const distFile = path.join(distDir, "index.html");
  const wroteDist = !existsSync(distFile);
  if (wroteDist) {
    await mkdir(distDir, { recursive: true });
    await writeFile(distFile, "<html>ok</html>");
  }
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const child = spawn(process.execPath, [path.join(root, "server/index.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("server-start-timeout")), 8000);
      const onData = (buf) => {
        if (String(buf).includes("health")) {
          clearTimeout(t);
          child.stdout.off("data", onData);
          resolve();
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", () => {});
    });
    const raw = await new Promise((resolve, reject) => {
      const sock = net.connect(port, "127.0.0.1", () => {
        sock.write("GET /api/health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n");
      });
      const chunks = [];
      sock.on("data", (c) => chunks.push(c));
      sock.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      sock.on("error", reject);
      setTimeout(() => reject(new Error("raw-http-timeout")), 4000);
    });
    assert.match(raw, /400/);
    assert.equal(child.exitCode, null);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    const boot = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
      headers: { origin: "http://127.0.0.1:3201" },
    });
    assert.equal(boot.status, 403);
    const missing = await fetch(`http://127.0.0.1:${port}/assets/astra-nonexistent.js`);
    assert.equal(missing.status, 404);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (wroteDist) await rm(distDir, { recursive: true, force: true });
  }
});
