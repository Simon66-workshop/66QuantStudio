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
            await api.createSkill({ name, description, steps: description });
            setName("");
            setDescription("");
            await refresh();
          }}
        >
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
  return (
    <Detail
      kicker="SKILL"
      title={skill?.name || id}
      body={skill?.summary || skill?.description || ""}
      actions={
        <>
          <button
            className="mosha-btn-primary"
            onClick={async () => {
              const conv = await api.startConversation({ kind: "skill", title: skill?.name, skillId: id });
              nav(`/conversations/${conv.id}`);
            }}
          >
            用此技能开始会话
          </button>
          {skill?.path ? (
            <button className="mosha-btn-ghost" onClick={async () => setMd((await api.skillSource(id)).markdown)}>
              查看 SKILL.md
            </button>
          ) : null}
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
            <p className="mt-1 line-clamp-3 text-xs text-muted">{e.excerpt}</p>
          </GlassPanel>
        </button>
      ))}
    </Catalog>
  );
}

export function ExpertDetailPage() {
  const { id = "" } = useParams();
  const snap = useStudioData((s) => s.snapshot);
  const nav = useNavigate();
  const expert = snap?.catalog.experts.find((s) => s.id === id);
  return (
    <Detail
      kicker="EXPERT"
      title={expert?.name || id}
      body={expert?.excerpt || ""}
      actions={
        <button
          className="mosha-btn-primary"
          onClick={async () => {
            const conv = await api.startConversation({ kind: "expert", title: expert?.name, expertId: id });
            nav(`/conversations/${conv.id}`);
          }}
        >
          开始专属对话
        </button>
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
            <p className="mosha-card-code">lead · {t.lead?.name}</p>
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
  const nav = useNavigate();
  const team = snap?.catalog.teams.find((s) => s.id === id);
  return (
    <Detail
      kicker="TEAM"
      title={team?.name || id}
      body={team?.description || ""}
      actions={
        <button
          className="mosha-btn-primary"
          onClick={async () => {
            const conv = await api.startConversation({ kind: "team", title: team?.name, teamId: id });
            nav(`/conversations/${conv.id}`);
          }}
        >
          确认后开始协作
        </button>
      }
    >
      <ul className="space-y-2 text-sm text-muted">
        {(team?.members || []).map((m) => (
          <li key={m.id}>
            <strong className="text-fg">{m.name}</strong> · {m.excerpt}
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
