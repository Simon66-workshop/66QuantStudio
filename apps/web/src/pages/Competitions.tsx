import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "../components/Glass";
import { api } from "../lib/api";
import { useStudioData } from "../lib/store";

export function CompetitionsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const contest = snap?.contest;
  const [template, setTemplate] = useState(snap?.jev.templateId || "range");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = Boolean(contest?.enabled && contest?.connected);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "contest-failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">比赛</h1>
      <p className="max-w-3xl text-sm text-muted">
        期货模拟赛只读巡检账户；开仓/平仓/撤单必须确认。官方 PandaAI CLI 未配置时使用本地演示账户，成交标记为
        executed-sim。因子大赛入口保留研究批次与因子池说明，提交同样走确认计划。
      </p>
      {error ? <p className="qs-error">{error}</p> : null}
      {!online ? <p className="text-sm text-muted">比赛未连接，确认执行已禁用。请先开启并连接模拟赛后再试。</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="mosha-btn-primary"
          disabled={busy}
          onClick={() => void run(async () => { await api.contest({ enabled: true, connected: true }); })}
        >
          开启并连接模拟赛
        </button>
        <button
          className="mosha-btn-ghost"
          disabled={busy}
          onClick={() => void run(async () => { await api.contest({ enabled: false, connected: false }); })}
        >
          关闭比赛模式
        </button>
        <button
          className="mosha-btn-ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.contest({ enabled: true, connected: true });
              const conv = await api.startConversation({ kind: "contest", title: "期货模拟赛助手" });
              nav(`/conversations/${conv.id}`);
            })
          }
        >
          进入 AI 交易助手
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel tint="#2f9b6a">
          <p className="mosha-card-code">futures · {contest?.connected ? "connected" : "offline"}</p>
          <h3 className="text-lg">账户巡检（只读）</h3>
          <p className="mt-2 text-sm text-muted">
            动态权益 {contest?.account.equity.toLocaleString()} · 可用 {contest?.account.available.toLocaleString()} · 风险度{" "}
            {((contest?.account.riskRatio || 0) * 100).toFixed(1)}%
          </p>
          <table className="qs-table mt-3">
            <thead>
              <tr>
                <th>合约</th>
                <th>方向</th>
                <th>手数</th>
              </tr>
            </thead>
            <tbody>
              {(contest?.account.positions || []).map((p) => (
                <tr key={p.contract}>
                  <td>{p.contract}</td>
                  <td>{p.side}</td>
                  <td>{p.lots}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
        <GlassPanel tint="#d4a017">
          <p className="mosha-card-code">factor contest</p>
          <h3 className="text-lg">第四届因子大赛</h3>
          <p className="mt-2 text-sm text-muted">
            提出目标 → 确认研究批次与预算 → 查看回测 → 管理因子池。入池/修改/提交都走确认计划。算力阈值只停止追加任务，不是费用封顶。
          </p>
        </GlassPanel>
      </div>
      <GlassPanel>
        <p className="mosha-card-code">Jev 持续盯盘</p>
        <h3 className="text-lg">策略模板与确认计划</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["range", "区间回归"],
            ["pullback", "趋势回调"],
            ["breakout", "突破跟随"],
          ].map(([id, name]) => (
            <button key={id} className={`mosha-btn-ghost ${template === id ? "text-fg" : ""}`} onClick={() => setTemplate(id)}>
              {name}
            </button>
          ))}
          <button
            className="mosha-btn-primary"
            disabled={busy}
            onClick={() => void run(async () => { await api.jevStart({ templateId: template, contract: "rb2610", mode: "autonomous" }); })}
          >
            开始盯盘（本地单次评估）
          </button>
          <button
            className="mosha-btn-ghost"
            disabled={busy}
            onClick={() => void run(async () => { await api.jevStop(); })}
          >
            停止
          </button>
          <button
            className="mosha-btn-ghost"
            disabled={busy}
            onClick={() => void run(async () => { await api.jevTick(); })}
          >
            采样一轮
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">
          状态 {snap?.jev.running ? "已开启（不会后台自动跑）" : "停止"} · 最近动作 {snap?.jev.last?.action || "—"} · {snap?.jev.last?.reason}
          <br />
          {snap?.jev.last?.note || "无 TypeSafe 密钥时使用本地规则评估；开始只做一次评估，再点采样才会刷新。相同行情不会重复堆计划。概率不是胜率。"}
        </p>
        <ol className="mt-2 max-h-40 overflow-auto text-[11px] text-dim">
          {(snap?.jev.log || []).slice(0, 12).map((l, i) => (
            <li key={i}>
              {l.event} · {l.detail}
            </li>
          ))}
        </ol>
      </GlassPanel>
      <GlassPanel tint="#c4453a">
        <p className="mosha-card-code">plans</p>
        <h3 className="text-lg">交易计划与回执</h3>
        <table className="qs-table mt-3">
          <thead>
            <tr>
              <th>计划</th>
              <th>合约</th>
              <th>动作</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(contest?.plans || []).map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.contract}</td>
                <td>{p.side} × {p.lots}</td>
                <td>{p.status}</td>
                <td>
                  {p.status === "pending" ? (
                    <span className="flex gap-2">
                      <button
                        className="mosha-btn-primary h-8"
                        disabled={busy || !online}
                        title={!online ? "比赛未连接，无法确认" : undefined}
                        onClick={() => void run(async () => { await api.confirm(p.id); })}
                      >
                        确认执行这笔交易
                      </button>
                      <button
                        className="mosha-btn-ghost h-8"
                        disabled={busy}
                        onClick={() => void run(async () => { await api.cancel(p.id); })}
                      >
                        取消
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}

export function QubePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">QUBE / EVO</h1>
      <GlassPanel>
        <p className="text-sm text-muted">
          QUBE 与 EVO 是 PandaAI 的独立研究服务，不在本工作台进程内运行。介绍页保留入口，避免把第三方账号嵌进本地会话。
        </p>
        <div className="mt-3 flex gap-2">
          <a className="mosha-btn-ghost" href="https://www.pandaaiquant.com/agent_quant/" target="_blank" rel="noreferrer">
            打开 QUBE
          </a>
          <a className="mosha-btn-ghost" href="https://www.pandaaiquant.com/evo/" target="_blank" rel="noreferrer">
            打开 EVO
          </a>
        </div>
      </GlassPanel>
    </div>
  );
}
