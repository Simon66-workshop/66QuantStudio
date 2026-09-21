import { useNavigate } from "react-router-dom";
import { GlassPanel, HERO_CARDS, MoshaHand } from "../components/Glass";
import { useStudioData } from "../lib/store";
import { api } from "../lib/api";
import type { PresetId } from "../mosha/types";
import { useState } from "react";

export function HomePage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const preset = (snap?.settings.appearance.preset || "mist") as PresetId;
  async function start(kind: string) {
    const map: Record<string, string> = { quant: "/skills", work: "/teams", trade: "/competitions", skills: "/skills" };
    if (kind === "quant") {
      try {
        const conv = await api.startConversation({ kind: "ordinary", title: "研究需求" });
        await refresh();
        navigate(`/conversations/${conv.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "start-failed");
      }
      return;
    }
    navigate(map[kind] || "/");
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] tracking-[0.2em] text-muted uppercase">从一句研究需求开始</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">把方法、角色、团队和产物放在同一张工作台</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          界面使用 66Workshop Mosha 磨砂玻璃卡片。能力库来自 QuantStudio 快照：
          {snap ? ` ${snap.catalog.counts.skills} 技能 / ${snap.catalog.counts.experts} 专家 / ${snap.catalog.counts.teams} 专家团。` : " 正在读取快照…"}
        </p>
      </header>
      {error ? <p className="qs-error">{error}</p> : null}
      <MoshaHand cards={HERO_CARDS} preset={preset} onPick={(c) => void start(c.id)} />
      <div className="grid gap-4 md:grid-cols-3">
        {(snap?.conversations || []).slice(0, 3).map((c) => (
          <button key={c.id} className="text-left" onClick={() => navigate(`/conversations/${c.id}`)}>
            <GlassPanel tint="#2f7eb8">
              <p className="mosha-card-code">{c.kind}</p>
              <h3 className="mt-2 text-lg font-semibold">{c.title}</h3>
              <p className="text-xs text-muted">继续最近工作</p>
            </GlassPanel>
          </button>
        ))}
        {snap && snap.conversations.length === 0 ? (
          <GlassPanel>
            <p className="mosha-card-code">SESSION</p>
            <h3 className="mt-2 text-lg">还没有会话</h3>
            <p className="text-xs text-muted">点扇形卡片或去技能/专家里开始。</p>
          </GlassPanel>
        ) : null}
      </div>
    </div>
  );
}
