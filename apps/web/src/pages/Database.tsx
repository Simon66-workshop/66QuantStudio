import { useState } from "react";
import { Link } from "react-router-dom";
import { GlassPanel } from "../components/Glass";
import { api } from "../lib/api";
import { useStudioData } from "../lib/store";

export function DatabasePage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const [active, setActive] = useState(snap?.datasets[0]?.id || "");
  const [error, setError] = useState<string | null>(null);
  const ds = snap?.datasets.find((d) => d.id === active) || snap?.datasets[0];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">数据库</h1>
      <p className="text-sm text-muted">本地缓存优先。过期或不足时再获取；本工作台演示集未连接 PandaData 时只读种子表。</p>
      {error ? <p className="qs-error">{error}</p> : null}
      <label className="mosha-btn-ghost inline-flex">
        导入 CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            try {
              const csv = await file.text();
              const created = await api.addDataset(file.name, csv);
              await refresh();
              if (created && typeof created === "object" && "id" in created) setActive(String((created as { id: string }).id));
            } catch (err) {
              setError(err instanceof Error ? err.message : "import-failed");
            }
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
  const [error, setError] = useState<string | null>(null);

  function hrefFor(kind: string, id: string) {
    if (kind === "skill") return `/skills/${id}`;
    if (kind === "expert") return `/experts/${id}`;
    if (kind === "team") return `/teams/${id}`;
    return "/";
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">收藏</h1>
      {error ? <p className="qs-error">{error}</p> : null}
      {(snap?.favorites || []).length === 0 ? <p className="text-sm text-muted">从技能或专家详情页收藏，常用入口会出现在这里。</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {(snap?.favorites || []).map((f) => (
          <li key={`${f.kind}:${f.id}`}>
            <GlassPanel>
              <p className="mosha-card-code">{f.kind}</p>
              <h3>{f.name || f.id}</h3>
              <div className="mt-2 flex gap-2">
                <Link className="mosha-btn-primary" to={hrefFor(f.kind, f.id)}>
                  打开
                </Link>
                <button
                  className="mosha-btn-ghost"
                  onClick={async () => {
                    setError(null);
                    try {
                      await api.favorite(f);
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "favorite-failed");
                    }
                  }}
                >
                  取消收藏
                </button>
              </div>
            </GlassPanel>
          </li>
        ))}
      </ul>
    </div>
  );
}
