export type Skill = {
  id: string;
  name: string;
  description: string;
  summary?: string;
  origin?: string;
  installed?: boolean;
  skills?: string[];
  path?: string | null;
};
export type Expert = {
  id: string;
  name: string;
  excerpt: string;
  skills: string[];
  permission?: string;
  role?: string;
};
export type Team = {
  id: string;
  name: string;
  description: string;
  lead: { id?: string; name?: string; excerpt?: string };
  members: { slot?: string; id?: string; name?: string; excerpt?: string }[];
};
export type Conversation = {
  id: string;
  kind: string;
  title: string;
  skillId?: string | null;
  expertId?: string | null;
  teamId?: string | null;
  loadedSkills?: string[];
  messages: { id: string; role: string; text: string; traces?: { step: string; detail: string }[]; artifacts?: string[]; createdAt: string }[];
  artifacts: { id: string; title: string; html: string }[];
};
export type Dataset = {
  id: string;
  name: string;
  source: string;
  freshness: string;
  headers: string[];
  rowCount: number;
  preview: Record<string, string>[];
  rows?: Record<string, string>[];
};
export type Snapshot = {
  catalog: { counts: Record<string, number>; skills: Skill[]; experts: Expert[]; teams: Team[] };
  conversations: Omit<Conversation, "messages" | "artifacts">[];
  datasets: Dataset[];
  favorites: { kind: string; id: string; name?: string }[];
  contest: {
    enabled: boolean;
    connected: boolean;
    account: {
      name: string;
      equity: number;
      available: number;
      margin: number;
      riskRatio: number;
      positions: { contract: string; side: string; lots: number; avg: number }[];
      fills: { id: string; contract: string; side: string; lots: number; price: number; at: string }[];
    };
    plans: {
      id: string;
      status: string;
      contract: string;
      side: string;
      lots: number;
      reason: string;
      source?: string;
    }[];
  };
  jev: {
    running: boolean;
    templateId: string;
    contract: string;
    mode: string;
    log: { at: string; event: string; detail: string }[];
    last: {
      action: string;
      last: number;
      ma: number;
      reason: string;
      confidence: number | null;
      planId?: string;
      source: string;
      note?: string;
    } | null;
  };
  settings: {
    workspaceName: string;
    appearance: { preset: string; animatedBg: boolean; uiScale: number; chatScale: number };
    model: { baseUrl: string; model: string; hasKey: boolean };
    jev: { hasKey: boolean };
  };
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    return (await res.text()) as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: () => req<Snapshot>("/api/bootstrap"),
  saveSettings: (patch: unknown) => req("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  skillSource: (id: string) => req<{ markdown: string }>(`/api/skills/${encodeURIComponent(id)}?source=1`),
  createSkill: (body: unknown) => req("/api/skills", { method: "POST", body: JSON.stringify(body) }),
  uninstallSkill: (id: string) => req(`/api/skills/${encodeURIComponent(id)}`, { method: "DELETE" }),
  conversation: (id: string) => req<Conversation>(`/api/conversations/${id}`),
  startConversation: (body: unknown) =>
    req<Conversation>("/api/conversations", { method: "POST", body: JSON.stringify(body) }),
  send: (id: string, text: string) =>
    req<Conversation>(`/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  loadSkill: (id: string, skillId: string) =>
    req(`/api/conversations/${id}/skills`, { method: "POST", body: JSON.stringify({ skillId }) }),
  addDataset: (name: string, csv: string) =>
    req("/api/datasets", { method: "POST", body: JSON.stringify({ name, csv }) }),
  dataset: (id: string) => req<Dataset>(`/api/datasets/${id}`),
  removeDataset: (id: string) => req(`/api/datasets/${id}`, { method: "DELETE" }),
  favorite: (item: unknown) => req("/api/favorites", { method: "POST", body: JSON.stringify(item) }),
  contest: (body: unknown) => req("/api/contest", { method: "POST", body: JSON.stringify(body) }),
  inspect: () => req("/api/contest/inspect"),
  confirm: (id: string) => req(`/api/contest/plans/${id}/confirm`, { method: "POST", body: "{}" }),
  cancel: (id: string) => req(`/api/contest/plans/${id}/cancel`, { method: "POST", body: "{}" }),
  jevStart: (body: unknown) => req("/api/jev/start", { method: "POST", body: JSON.stringify(body) }),
  jevStop: () => req("/api/jev/stop", { method: "POST", body: "{}" }),
  jevTick: () => req("/api/jev/tick", { method: "POST", body: "{}" }),
};
