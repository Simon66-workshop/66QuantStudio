import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GlassPanel } from "../components/Glass";
import { api } from "../lib/api";
import { useStudioData } from "../lib/store";


export function SkillsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const items = (snap?.catalog.skills || []).filter((s) => `${s.name}${s.description}`.includes(q));
  return (
    <Catalog
      kicker="SKILLS"
      title="技能"
      query={q}
      setQuery={setQ}
      extra={
        <form
          className="grid gap-2 md:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.createSkill({ name, description, steps: description });
              setName("");
              setDescription("");
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "create-failed");
            }
          }}
        >
          {error ? <p className="qs-error md:col-span-3">{error}</p> : null}
          <input className="mosha-field" placeholder="一句话创建技能名称" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="mosha-field" placeholder="步骤与工具约定" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button className="mosha-btn-primary" type="submit">
            保存到本机能力库
          </button>
        </form>
      }
    >
      {items.map((s) => (
        <button key={s.id} className="text-left" onClick={() => nav(`/skills/${s.id}`)}>
          <GlassPanel tint={s.origin === "local" ? "#d4a017" : "#2f7eb8"}>
            <p className="mosha-card-code">{s.origin || "catalog"} · {s.installed ? "已安装" : "未安装"}</p>
            <h3 className="mt-2 text-base font-semibold">{s.name}</h3>
            <p className="mt-1 line-clamp-3 text-xs text-muted">{s.description || s.summary}</p>
          </GlassPanel>
        </button>
      ))}
    </Catalog>
  );
}

export function SkillDetailPage() {
  const { id = "" } = useParams();
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const skill = snap?.catalog.skills.find((s) => s.id === id);
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fav = snap?.favorites?.some((f) => f.kind === "skill" && f.id === id);
  if (!skill) {
    return (
      <Detail kicker="SKILL" title="未找到技能" body="这个技能不在当前目录里，不能假装可执行。">
        <p className="qs-error">未知技能 {id}</p>
      </Detail>
    );
  }
  return (
    <Detail
      kicker="SKILL"
      title={skill.name}
      body={skill.summary || skill.description || ""}
      actions={
        <>
          {error ? <p className="qs-error w-full">{error}</p> : null}
          {skill.installed ? (
            <button
              className="mosha-btn-primary"
              onClick={async () => {
                setError(null);
                try {
                  const conv = await api.startConversation({ kind: "skill", title: skill.name, skillId: id });
                  await refresh();
                  nav(`/conversations/${conv.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "start-failed");
                }
              }}
            >
              用此技能开始会话
            </button>
          ) : (
            <button
              className="mosha-btn-primary"
              onClick={async () => {
                setError(null);
                try {
                  await api.installSkill(id);
                  await refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "install-failed");
                }
              }}
            >
              重新安装
            </button>
          )}
          {skill.path ? (
            <button className="mosha-btn-ghost" onClick={async () => setMd((await api.skillSource(id)).markdown)}>
              查看 SKILL.md
            </button>
          ) : null}
          <button
            className="mosha-btn-ghost"
            onClick={async () => {
              await api.favorite({ kind: "skill", id: skill.id, name: skill.name });
              await refresh();
            }}
          >
            {fav ? "取消收藏" : "收藏"}
          </button>
          {skill.installed ? (
            <button
              className="mosha-btn-ghost"
              onClick={async () => {
                await api.uninstallSkill(id);
                await refresh();
                nav("/skills");
              }}
            >
              卸载
            </button>
          ) : null}
        </>
      }
    >
      {md ? <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-code">{md}</pre> : null}
    </Detail>
  );
}

export function ExpertsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const items = (snap?.catalog.experts || []).filter((s) => `${s.name}${s.excerpt}`.includes(q));
  return (
    <Catalog kicker="SPECIALISTS" title="专家" query={q} setQuery={setQ}>
      {items.map((e) => (
        <button key={e.id} className="text-left" onClick={() => nav(`/experts/${e.id}`)}>
          <GlassPanel tint="#c4453a">
            <p className="mosha-card-code">{(e.skills || []).join(" · ") || "role"}</p>
            <h3 className="mt-2 text-base font-semibold">{e.name}</h3>
            <p className="mt-1 line-clamp-3 text-xs text-muted">{e.excerpt || "快照未包含职责摘要。"}</p>
          </GlassPanel>
        </button>
      ))}
    </Catalog>
  );
}

export function ExpertDetailPage() {
  const { id = "" } = useParams();
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const expert = snap?.catalog.experts.find((s) => s.id === id);
  const fav = snap?.favorites?.some((f) => f.kind === "expert" && f.id === id);
  if (!expert) {
    return <Detail kicker="EXPERT" title="未找到专家" body="这个专家不在当前目录快照里。" />;
  }
  return (
    <Detail
      kicker="EXPERT"
      title={expert.name}
      body={expert.excerpt || "紧凑目录快照未包含职责摘要，不能把空壳当成已验证的协作能力。"}
      actions={
        <>
          <button
            className="mosha-btn-primary"
            onClick={async () => {
              const conv = await api.startConversation({ kind: "expert", title: expert.name, expertId: id });
              await refresh();
              nav(`/conversations/${conv.id}`);
            }}
          >
            开始专属对话
          </button>
          <button
            className="mosha-btn-ghost"
            onClick={async () => {
              await api.favorite({ kind: "expert", id: expert.id, name: expert.name });
              await refresh();
            }}
          >
            {fav ? "取消收藏" : "收藏"}
          </button>
        </>
      }
    />
  );
}

export function TeamsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const items = (snap?.catalog.teams || []).filter((s) => `${s.name}${s.description}`.includes(q));
  return (
    <Catalog kicker="TEAMS" title="专家团" query={q} setQuery={setQ}>
      {items.map((t) => (
        <button key={t.id} className="text-left" onClick={() => nav(`/teams/${t.id}`)}>
          <GlassPanel tint="#2f9b6a">
            <p className="mosha-card-code">{t.lead?.name ? `lead · ${t.lead.name}` : "快照未包含 LEAD"}</p>
            <h3 className="mt-2 text-base font-semibold">{t.name}</h3>
            <p className="mt-1 line-clamp-3 text-xs text-muted">{t.description}</p>
          </GlassPanel>
        </button>
      ))}
    </Catalog>
  );
}

export function TeamDetailPage() {
  const { id = "" } = useParams();
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const team = snap?.catalog.teams.find((s) => s.id === id);
  if (!team) {
    return <Detail kicker="TEAM" title="未找到专家团" body="这个专家团不在当前目录快照里。" />;
  }
  return (
    <Detail
      kicker="TEAM"
      title={team.name}
      body={team.description || "紧凑目录快照未包含团队说明。"}
      actions={
        <button
          className="mosha-btn-primary"
          onClick={async () => {
            const conv = await api.startConversation({ kind: "team", title: team.name, teamId: id });
            await refresh();
            nav(`/conversations/${conv.id}`);
          }}
        >
          确认后开始协作
        </button>
      }
    >
      <p className="mb-2 text-xs text-muted">
        {team.lead?.name ? `LEAD · ${team.lead.name}` : "快照未包含 LEAD 姓名，不能把它当成已验证的协作能力。"}
      </p>
      <ul className="space-y-2 text-sm text-muted">
        {(team.members || []).length === 0 ? <li>快照未包含成员名单。</li> : null}
        {(team.members || []).map((m) => (
          <li key={m.id || m.name}>
            <strong className="text-fg">{m.name}</strong> · {m.excerpt || "快照未包含职责"}
          </li>
        ))}
      </ul>
    </Detail>
  );
}

function Catalog({
  kicker,
  title,
  query,
  setQuery,
  extra,
  children,
}: {
  kicker: string;
  title: string;
  query: string;
  setQuery: (v: string) => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] tracking-[0.2em] text-muted uppercase">{kicker}</p>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <input className="mosha-field max-w-md" placeholder="搜索" value={query} onChange={(e) => setQuery(e.target.value)} />
      {extra}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

function Detail({
  kicker,
  title,
  body,
  actions,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const text = useMemo(() => body, [body]);
  return (
    <div className="space-y-4">
      <p className="text-[11px] tracking-[0.2em] text-muted uppercase">{kicker}</p>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
      <GlassPanel>
        <p className="whitespace-pre-wrap text-sm text-muted">{text}</p>
        {children}
      </GlassPanel>
    </div>
  );
}
