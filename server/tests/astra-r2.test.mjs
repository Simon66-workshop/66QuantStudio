import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, parseTradeIntent, applyFill, createStudio } from "../lib/studio.mjs";
import { allowedOrigins } from "../lib/http-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function tmpStudio() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "qs-r2-"));
  await cp(path.join(root, "server/data"), path.join(tmp, "server/data"), { recursive: true });
  const studio = await createStudio(tmp);
  return { tmp, studio };
}

function listenPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

test("005 default origins exclude vite ports unless QS_ALLOW_DEV_ORIGINS=1", () => {
  const prev = process.env.QS_ALLOW_DEV_ORIGINS;
  const extra = process.env.QS_ORIGINS;
  delete process.env.QS_ALLOW_DEV_ORIGINS;
  delete process.env.QS_ORIGINS;
  try {
    const def = allowedOrigins(3198);
    assert.equal(def.has("http://127.0.0.1:3198"), true);
    assert.equal(def.has("http://127.0.0.1:5173"), false);
    assert.equal(def.has("http://localhost:4173"), false);
    process.env.QS_ALLOW_DEV_ORIGINS = "1";
    const dev = allowedOrigins(3198);
    assert.equal(dev.has("http://127.0.0.1:5173"), true);
    assert.equal(dev.has("http://127.0.0.1:4173"), true);
  } finally {
    if (prev == null) delete process.env.QS_ALLOW_DEV_ORIGINS;
    else process.env.QS_ALLOW_DEV_ORIGINS = prev;
    if (extra == null) delete process.env.QS_ORIGINS;
    else process.env.QS_ORIGINS = extra;
  }
});

test("008 quoted spaces, mid-field quote, and HTML-in-quoted-field", () => {
  const padded = parseCsv('a,b\n"  padded  ",1\n');
  assert.equal(padded.rows[0].a, "  padded  ");
  assert.throws(() => parseCsv('a,b\nab"cd",1\n'), /unexpected-quote/);
  const tagged = parseCsv('a,b\n"text<b>hi</b>",1\n');
  assert.equal(tagged.rows[0].a, "text<b>hi</b>");
  assert.throws(() => parseCsv("<html>not a CSV</html>"), /invalid-csv/);
});

test("014 negative lots and negated intent do not place", () => {
  const negLots = parseTradeIntent("开多 rb2610 -3手");
  assert.equal(negLots.action, "reject");
  assert.equal(negLots.reason, "invalid-lots");
  const frac = parseTradeIntent("开多 rb2610 3.5手");
  assert.equal(frac.action, "reject");
  assert.equal(frac.reason, "invalid-lots");
  const negated = parseTradeIntent("不要开多 rb2610 3手");
  assert.equal(negated.action, "reject");
  assert.equal(negated.reason, "negated-intent");
});

test("015 close-short on long and reverse-open do not net", () => {
  const account = {
    equity: 1_000_000,
    available: 1_000_000,
    margin: 0,
    riskRatio: 0,
    positions: [{ contract: "rb2610", side: "long", lots: 2, avg: 3184 }],
    fills: [],
  };
  const before = structuredClone(account.positions);
  assert.throws(() => applyFill(account, { contract: "rb2610", side: "close-short", lots: 1, price: 3184 }), /no-position/);
  assert.deepEqual(account.positions, before);
  assert.throws(() => applyFill(account, { contract: "rb2610", side: "open-short", lots: 1, price: 3184 }), /wrong-side/);
  assert.deepEqual(account.positions, before);
});

test("014/015 contest plans keep fills unchanged on reject and close-short", async () => {
  const { tmp, studio } = await tmpStudio();
  await studio.setContest({ enabled: true, connected: true });
  const conv = await studio.startConversation({ kind: "contest", title: "期货" });
  await studio.postMessage(conv.id, "开多 rb2610 2手");
  const open = studio.snapshot().contest.plans.find((p) => p.status === "pending");
  await studio.confirmPlan(open.id);
  assert.equal(studio.inspectAccount().fills.length, 1);
  const pos = studio.inspectAccount().positions.find((p) => p.contract === "rb2610");
  assert.equal(pos.side, "long");
  assert.equal(pos.lots, 2);

  await studio.postMessage(conv.id, "开多 rb2610 -3手");
  await studio.postMessage(conv.id, "不要开多 rb2610 3手");
  assert.equal(studio.snapshot().contest.plans.filter((p) => p.status === "pending").length, 0);

  await studio.postMessage(conv.id, "平空 rb2610 1手");
  const closeShort = studio.snapshot().contest.plans.find((p) => p.status === "pending");
  assert.equal(closeShort.side, "close-short");
  await assert.rejects(() => studio.confirmPlan(closeShort.id), /no-position/);
  const after = studio.inspectAccount();
  assert.equal(after.fills.length, 1);
  const still = after.positions.find((p) => p.contract === "rb2610");
  assert.equal(still.side, "long");
  assert.equal(still.lots, 2);
  await rm(tmp, { recursive: true, force: true });
});

test("021/029 model payload binds dataset stats and keeps current user unsliced", async () => {
  const payloads = [];
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      payloads.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "mock-ok" } }] }));
    });
  });
  const port = await new Promise((resolve) => mock.listen(0, "127.0.0.1", () => resolve(mock.address().port)));
  const { tmp, studio } = await tmpStudio();
  try {
    await studio.updateSettings({
      model: { baseUrl: `http://127.0.0.1:${port}/v1`, model: "mock-r2", apiKey: "sk-test-r2" },
    });
    const conv = await studio.startConversation({
      kind: "ordinary",
      title: "因子",
      skillId: "skill-factor-evaluate",
    });
    await studio.postMessage(conv.id, "记住代号ALPHA，分析动量因子并生成右侧报告。");
    const long = `${"A".repeat(4500)}ASTRA-END-INSTRUCTION`;
    assert.equal(long.length, 4521);
    await studio.postMessage(conv.id, long);
    assert.ok(payloads.length >= 2);
    const second = payloads[1];
    const system = second.messages.find((m) => m.role === "system").content;
    assert.doesNotMatch(system, /Dataset:unbound/);
    assert.match(system, /factor-momentum/);
    assert.match(system, /"mean":/);
    assert.match(system, /skill-factor-evaluate/);
    assert.match(system, /constraints/);
    assert.ok(second.messages.some((m) => m.role === "user" && String(m.content).includes("ALPHA")));
    assert.doesNotMatch(JSON.stringify(second.messages), /sk-test-r2/);
    const current = second.messages.filter((m) => m.role === "user").at(-1);
    assert.equal(current.content.length, 4521);
    assert.match(current.content, /ASTRA-END-INSTRUCTION/);
    const stored = studio.conversation(conv.id).messages.filter((m) => m.role === "user").at(-1);
    assert.equal(stored.text.length, 4521);
  } finally {
    mock.close();
    await rm(tmp, { recursive: true, force: true });
  }
});

test("005 live 5173 origin is forbidden by default and allowed with env", async () => {
  const distDir = path.join(root, "apps/web/dist");
  const distFile = path.join(distDir, "index.html");
  const wroteDist = !existsSync(distFile);
  if (wroteDist) {
    await mkdir(distDir, { recursive: true });
    await writeFile(distFile, "<html>ok</html>");
  }
  async function withServer(env, fn) {
    const port = await listenPort();
    const child = spawn(process.execPath, [path.join(root, "server/index.mjs")], {
      cwd: root,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", ...env },
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
      await fn(port);
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  try {
    await withServer({ QS_ALLOW_DEV_ORIGINS: "" }, async (port) => {
      const denied = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
        headers: { origin: "http://127.0.0.1:5173" },
      });
      assert.equal(denied.status, 403);
    });
    await withServer({ QS_ALLOW_DEV_ORIGINS: "1" }, async (port) => {
      const allowed = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
        headers: { origin: "http://127.0.0.1:5173" },
      });
      assert.equal(allowed.status, 200);
    });
  } finally {
    if (wroteDist) await rm(distDir, { recursive: true, force: true });
  }
});
