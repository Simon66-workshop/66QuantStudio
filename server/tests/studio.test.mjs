import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTable, evaluateFactor, escapeHtml, safeJoin, createStudio } from "../lib/studio.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("html escape blocks markup", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("path join refuses escape", () => {
  assert.throws(() => safeJoin(root, "..", "etc", "passwd"));
});

test("analyzeTable computes drawdown and marks empty gaps", () => {
  const a = analyzeTable(
    ["date", "close"],
    [
      { date: "a", close: "10" },
      { date: "b", close: "12" },
      { date: "c", close: "9" },
    ],
    "t",
  );
  assert.equal(a.rowCount, 3);
  assert.ok(a.closeStats.maxDrawdown < 0);
  assert.equal(analyzeTable(["x"], [], "z").gaps.includes("empty-table"), true);
});

test("evaluateFactor reports insufficient cross sections", () => {
  const r = evaluateFactor([
    { date: "d1", symbol: "a", momentum_20: 1, fwd_ret_5d: 0.01 },
    { date: "d1", symbol: "b", momentum_20: 2, fwd_ret_5d: 0.02 },
  ]);
  assert.ok(r.gaps.includes("insufficient-cross-sections"));
});

test("studio contest never fills without confirm", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "qs-"));
  await cp(path.join(root, "server/data"), path.join(tmp, "server/data"), { recursive: true });
  await cp(path.join(root, "vendor/quantstudio/assets/library-v2/snapshot.json"), path.join(tmp, "vendor/quantstudio/assets/library-v2/snapshot.json"));
  // catalog only needs catalog.json which is in server/data
  const studio = await createStudio(tmp);
  const conv = await studio.startConversation({ kind: "contest", title: "期货" });
  const after = await studio.postMessage(conv.id, "开多 rb2610 1手");
  const pending = after.messages.at(-1);
  assert.match(pending.text, /待确认|确认/);
  const plans = studio.snapshot().contest.plans;
  assert.equal(plans[0].status, "pending");
  assert.equal(studio.inspectAccount().fills.length, 0);
  await studio.confirmPlan(plans[0].id);
  assert.equal(studio.snapshot().contest.plans[0].status, "executed-sim");
  assert.equal(studio.inspectAccount().fills.length, 1);
  await rm(tmp, { recursive: true, force: true });
});

test("catalog counts match snapshot README", async () => {
  const studio = await createStudio(root);
  const snap = studio.snapshot();
  assert.equal(snap.catalog.counts.skills >= 15, true);
  assert.equal(snap.catalog.counts.experts, 44);
  assert.equal(snap.catalog.counts.teams, 14);
  const src = await studio.skillSource("skill-daily-report");
  assert.match(src, /SKILL|日报|报告/);
});
