import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, parseTradeIntent, createStudio } from "../lib/studio.mjs";
import { allowedOrigins } from "../lib/http-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function tmpStudio() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "qs-r3-"));
  await cp(path.join(root, "server/data"), path.join(tmp, "server/data"), { recursive: true });
  const studio = await createStudio(tmp);
  return { tmp, studio };
}

test("008 reject trailing text after a closed quoted field and do not persist", async () => {
  assert.throws(() => parseCsv('a,b\n"abc"def,1\n'), /trailing-after-quote/);
  const padded = parseCsv('a,b\n"  padded  ",1\n');
  assert.equal(padded.rows[0].a, "  padded  ");
  const escaped = parseCsv('a,b\n"say ""hi""",1\n');
  assert.equal(escaped.rows[0].a, 'say "hi"');
  const { tmp, studio } = await tmpStudio();
  const before = studio.datasets().length;
  await assert.rejects(() => studio.addDataset({ name: "astra-r3-invalid.csv", csv: 'a,b\n"abc"def,1\n' }), /trailing-after-quote/);
  assert.equal(studio.datasets().length, before);
  await rm(tmp, { recursive: true, force: true });
});

test("014 questions, trailing negation, and multi-intent do not place", () => {
  const ask = parseTradeIntent("开多 rb2610 100手可以吗？");
  assert.equal(ask.action, "reject");
  assert.equal(ask.reason, "question-intent");
  const hedge = parseTradeIntent("开多 rb2610 3手的风险是什么？不要下单。");
  assert.equal(hedge.action, "reject");
  assert.match(hedge.reason, /question-intent|negated-intent/);
  const multi = parseTradeIntent("开多 rb2610 1手，开空 cu2701 2手");
  assert.equal(multi.action, "reject");
  assert.equal(multi.reason, "multi-intent");
  const ok = parseTradeIntent("开空 cu2701 5手");
  assert.equal(ok.action, "place");
  assert.equal(ok.side, "open-short");
  assert.equal(ok.contract, "cu2701");
  assert.equal(ok.lots, 5);
});

test("014 contest session does not add pending or fills on the three R3 anti-examples", async () => {
  const { tmp, studio } = await tmpStudio();
  await studio.setContest({ enabled: true, connected: true });
  const conv = await studio.startConversation({ kind: "contest", title: "期货" });
  await studio.postMessage(conv.id, "开多 rb2610 2手");
  const open = studio.snapshot().contest.plans.find((p) => p.status === "pending");
  await studio.confirmPlan(open.id);
  const fillsBefore = studio.inspectAccount().fills.length;
  const pendingBefore = studio.snapshot().contest.plans.filter((p) => p.status === "pending").length;
  await studio.postMessage(conv.id, "开多 rb2610 100手可以吗？");
  await studio.postMessage(conv.id, "开多 rb2610 3手的风险是什么？不要下单。");
  await studio.postMessage(conv.id, "开多 rb2610 1手，开空 cu2701 2手");
  assert.equal(studio.snapshot().contest.plans.filter((p) => p.status === "pending").length, pendingBefore);
  assert.equal(studio.inspectAccount().fills.length, fillsBefore);
  await rm(tmp, { recursive: true, force: true });
});

test("033 npm run dev opts in to Vite origins; npm start does not", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.dev, /QS_ALLOW_DEV_ORIGINS=1/);
  assert.match(pkg.scripts["dev:api"], /QS_ALLOW_DEV_ORIGINS=1/);
  assert.doesNotMatch(pkg.scripts.start, /QS_ALLOW_DEV_ORIGINS/);
  const prev = process.env.QS_ALLOW_DEV_ORIGINS;
  delete process.env.QS_ALLOW_DEV_ORIGINS;
  try {
    assert.equal(allowedOrigins(3198).has("http://127.0.0.1:5173"), false);
  } finally {
    if (prev == null) delete process.env.QS_ALLOW_DEV_ORIGINS;
    else process.env.QS_ALLOW_DEV_ORIGINS = prev;
  }
});
