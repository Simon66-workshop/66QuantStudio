import { useEffect, useState } from "react";
import { GlassPanel } from "../components/Glass";
import { api } from "../lib/api";
import { useStudioData } from "../lib/store";
import { PRESETS } from "../mosha/defaults";
import type { PresetId } from "../mosha/types";

export function SettingsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const [workspaceName, setWorkspaceName] = useState(snap?.settings.workspaceName || "");
  const [baseUrl, setBaseUrl] = useState(snap?.settings.model.baseUrl || "");
  const [model, setModel] = useState(snap?.settings.model.model || "");
  const [apiKey, setApiKey] = useState("");
  const [jev, setJev] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!snap) return;
    setWorkspaceName(snap.settings.workspaceName || "");
    setBaseUrl(snap.settings.model.baseUrl || "");
    setModel(snap.settings.model.model || "");
  }, [snap]);

  async function run(label: string, fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save-failed");
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">设置</h1>
      {error ? <p className="qs-error">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      <GlassPanel>
        <p className="mosha-card-code">workspace</p>
        <label className="mt-2 block text-xs text-muted">工作区名称</label>
        <input className="mosha-field mt-1" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
        <button
          className="mosha-btn-primary mt-3"
          onClick={() => void run("工作区已保存", async () => {
            await api.saveSettings({ workspaceName });
          })}
        >
          保存工作区
        </button>
      </GlassPanel>
      <GlassPanel tint="#2f7eb8">
        <p className="mosha-card-code">appearance · mosha presets</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button
              key={id}
              className={`mosha-btn-ghost ${snap?.settings.appearance.preset === id ? "text-fg" : ""}`}
              onClick={() =>
                void run(`已切换 ${PRESETS[id].label}`, async () => {
                  await api.saveSettings({ appearance: { preset: id } });
                })
              }
            >
              {PRESETS[id].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">原片 / 薄雾 / 夜虹 / 厚玻璃 / 极简 / 液态 / 透镜。动画可关。</p>
        <button
          className="mosha-btn-ghost mt-2"
          onClick={() =>
            void run("动态背景已更新", async () => {
              await api.saveSettings({ appearance: { animatedBg: !(snap?.settings.appearance.animatedBg) } });
            })
          }
        >
          动态背景 {snap?.settings.appearance.animatedBg ? "开" : "关"}
        </button>
      </GlassPanel>
      <GlassPanel>
        <p className="mosha-card-code">model · optional</p>
        <p className="text-xs text-muted">OpenAI 兼容接口。密钥只存本机 runtime，接口回显脱敏。未配置时使用本地研究引擎。空密钥框不会覆盖已保存密钥。</p>
        <input className="mosha-field mt-2" placeholder="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <input className="mosha-field mt-2" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
        <input className="mosha-field mt-2" type="password" placeholder={snap?.settings.model.hasKey ? "已保存密钥" : "API Key"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <button
          className="mosha-btn-primary mt-3"
          onClick={() =>
            void run("模型服务已保存", async () => {
              const patch: { baseUrl: string; model: string; apiKey?: string } = { baseUrl, model };
              if (apiKey.trim()) patch.apiKey = apiKey.trim();
              await api.saveSettings({ model: patch });
              setApiKey("");
            })
          }
        >
          保存模型服务
        </button>
      </GlassPanel>
      <GlassPanel>
        <p className="mosha-card-code">Jev · TypeSafe</p>
        <p className="text-xs text-muted">测试成功才应保存。本环境默认不调用外部 Jev；有密钥也仍需确认每笔计划。</p>
        <input className="mosha-field mt-2" type="password" placeholder={snap?.settings.jev.hasKey ? "已保存" : "TypeSafe API Key"} value={jev} onChange={(e) => setJev(e.target.value)} />
        <button
          className="mosha-btn-ghost mt-3"
          onClick={() =>
            void run("Jev 密钥已保存", async () => {
              await api.saveSettings({ jev: { apiKey: jev } });
              setJev("");
            })
          }
        >
          保存密钥（不回显）
        </button>
      </GlassPanel>
    </div>
  );
}
