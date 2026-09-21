import { useState } from "react";
import { GlassPanel } from "../components/Glass";
import { api } from "../lib/api";
import { useStudioData } from "../lib/store";

export function DatabasePage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const [active, setActive] = useState(snap?.datasets[0]?.id || "");
  const ds = snap?.datasets.find((d) => d.id === active) || snap?.datasets[0];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">数据库</h1>
      <p className="text-sm text-muted">本地缓存优先。过期或不足时再获取；本工作台演示集未连接 PandaData 时只读种子表。</p>
      <label className="mosha-btn-ghost inline-flex">
        导入 CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const csv = await file.text();
            await api.addDataset(file.name, csv);
            await refresh();
          }}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          {(snap?.datasets || []).map((d) => (
            <button key={d.id} className={`mosha-btn-ghost w-full ${d.id === ds?.id ? "text-fg" : ""}`} onClick={() => setActive(d.id)}>
              {d.name}
              <span className="ml-2 text-[10px] text-dim">{d.freshness}</span>
            </button>
          ))}
        </div>
        {ds ? (
          <GlassPanel>
            <p className="mosha-card-code">
              {ds.source} · {ds.rowCount} 行
            </p>
            <h3 className="mt-1 text-lg">{ds.name}</h3>
            <div className="mt-3 overflow-auto">
              <table className="qs-table">
                <thead>
                  <tr>
                    {ds.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ds.preview.map((row, i) => (
                    <tr key={i}>
                      {ds.headers.map((h) => (
                        <td key={h}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        ) : null}
      </div>
    </div>
  );
}

export function FavoritesPage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">收藏</h1>
      {(snap?.favorites || []).length === 0 ? <p className="text-sm text-muted">从技能或专家页用会话开始，或在此保留常用入口。</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(snap?.catalog.skills || []).slice(0, 4).map((s) => (
          <GlassPanel key={s.id}>
            <p className="mosha-card-code">skill</p>
            <h3>{s.name}</h3>
            <button
              className="mosha-btn-ghost mt-2"
              onClick={async () => {
                await api.favorite({ kind: "skill", id: s.id, name: s.name });
                await refresh();
              }}
            >
              收藏/取消
            </button>
          </GlassPanel>
        ))}
      </div>
      <ul className="text-sm text-muted">
        {(snap?.favorites || []).map((f) => (
          <li key={`${f.kind}:${f.id}`}>
            {f.kind} · {f.name || f.id}
          </li>
        ))}
      </ul>
    </div>
  );
}
