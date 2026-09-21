import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GlassPanel } from "../components/Glass";
import { api, type Conversation } from "../lib/api";
import { useStudioData } from "../lib/store";

const MAX_MESSAGE = 8000;

export function ConversationsPage() {
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">会话</h1>
        <button
          className="mosha-btn-primary"
          onClick={async () => {
            setError(null);
            try {
              const conv = await api.startConversation({ kind: "ordinary", title: "新会话" });
              await refresh();
              nav(`/conversations/${conv.id}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "create-failed");
            }
          }}
        >
          新建普通会话
        </button>
      </div>
      {error ? <p className="qs-error">{error}</p> : null}
      <div className="grid gap-3">
        {(snap?.conversations || []).map((c) => (
          <Link key={c.id} to={`/conversations/${c.id}`}>
            <GlassPanel>
              <p className="mosha-card-code">{c.kind}</p>
              <h3 className="text-lg font-semibold">{c.title}</h3>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ConversationPage() {
  const { id = "" } = useParams();
  const snap = useStudioData((s) => s.snapshot);
  const refresh = useStudioData((s) => s.refresh);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [artifact, setArtifact] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [cutCount, setCutCount] = useState(0);
  const sending = useRef(false);
  useEffect(() => {
    setConv(null);
    setArtifact(null);
    setError(null);
    setMissing(false);
    api
      .conversation(id)
      .then((next) => {
        setConv(next);
        const last = next.artifacts.at(-1);
        if (last) setArtifact(last.html);
      })
      .catch((err: Error) => {
        if (err.message === "not-found") setMissing(true);
        else setError(err.message);
      });
  }, [id]);
  async function send() {
    if (sending.current || busy) return;
    const clean = text.trim();
    if (!clean) return;
    if (clean.length > MAX_MESSAGE) {
      setError(`超过 ${MAX_MESSAGE} 字，请缩短后再发送。`);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    const key = crypto.randomUUID();
    try {
      const next = await api.send(id, text, key);
      setConv(next);
      setText("");
      await refresh();
      const last = next.artifacts.at(-1);
      if (last) setArtifact(last.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "send-failed");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  if (missing) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">会话不存在</h1>
        <p className="qs-error">找不到这个会话。它可能已被删除，或链接无效。</p>
        <Link className="mosha-btn-ghost inline-flex" to="/conversations">
          返回会话列表
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
      <div className="flex min-h-[70vh] flex-col">
        <p className="text-[11px] tracking-[0.2em] text-muted uppercase">{conv?.kind} · 对话与轨迹</p>
        <h1 className="font-display text-2xl font-bold">{conv?.title || "会话"}</h1>
        {error ? <p className="qs-error">{error}</p> : null}
        <div className="mt-4 flex-1 space-y-3 overflow-auto pr-1">
          {(conv?.messages || []).map((m) => (
            <GlassPanel key={m.id} tint={m.role === "user" ? "#2f7eb8" : "#6b7c93"}>
              <p className="mosha-card-code">
                {m.role}
                {m.engine ? ` · ${m.engine}` : ""}
                {m.modelGap ? ` · ${m.modelGap}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm" style={{ fontSize: `${(snap?.settings.appearance.chatScale || 1) * 14}px` }}>
                {m.text}
              </p>
              {m.traces?.length ? (
                <ol className="mt-2 list-decimal pl-4 text-[11px] text-muted">
                  {m.traces.map((t, i) => (
                    <li key={i}>
                      {t.step} · {t.detail}
                    </li>
                  ))}
                </ol>
              ) : null}
            </GlassPanel>
          ))}
        </div>
        <div className="qs-composer mt-3">
          <textarea
            className="mosha-field min-h-[72px]"
            placeholder="描述需求。赛事写入会变成待确认计划。"
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              if (next.length > MAX_MESSAGE) {
                const extra = next.length - MAX_MESSAGE;
                setCutCount(extra);
                setText(next.slice(0, MAX_MESSAGE));
                setError(`粘贴超出 ${MAX_MESSAGE} 字，已截去 ${extra} 字。发送仍拒绝超过 ${MAX_MESSAGE} 字的内容。`);
              } else {
                setCutCount(0);
                setText(next);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="mosha-btn-primary self-end" disabled={busy || sending.current} onClick={() => void send()}>
            {busy ? "执行中" : "发送"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-dim">
          {text.trim().length}/{MAX_MESSAGE}
          {cutCount > 0 ? ` · 刚才截去 ${cutCount} 字` : ""}
        </p>
      </div>
      <div>
        <p className="text-[11px] tracking-[0.2em] text-muted uppercase">结果工作台</p>
        <div className="mt-2 space-y-2">
          {(conv?.artifacts || []).map((a) => (
            <button key={a.id} className="mosha-btn-ghost w-full" onClick={() => setArtifact(a.html)}>
              {a.title}
            </button>
          ))}
        </div>
        <GlassPanel className="mt-3 min-h-[420px]">
          {artifact ? (
            <iframe title="artifact" className="h-[520px] w-full rounded-xl border-0 bg-black" srcDoc={artifact} />
          ) : (
            <p className="text-sm text-muted">发送需求后，HTML / 表格产物在这里打开。</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
