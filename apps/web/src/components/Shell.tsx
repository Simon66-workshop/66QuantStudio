import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Database,
  Home,
  MessageSquare,
  Settings,
  Sparkles,
  Star,
  Swords,
  Users,
  Workflow,
} from "lucide-react";
import { useStudioData } from "../lib/store";

const LINKS = [
  { to: "/", label: "首页", icon: Home },
  { to: "/skills", label: "技能", icon: Sparkles },
  { to: "/experts", label: "专家", icon: BookOpen },
  { to: "/teams", label: "专家团", icon: Users },
  { to: "/conversations", label: "会话", icon: MessageSquare },
  { to: "/database", label: "数据库", icon: Database },
  { to: "/favorites", label: "收藏", icon: Star },
  { to: "/competitions", label: "比赛", icon: Swords },
  { to: "/qube", label: "QUBE / EVO", icon: Workflow },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Shell() {
  const snap = useStudioData((s) => s.snapshot);
  const navigate = useNavigate();
  return (
    <div className="qs-shell">
      <div className="mosha-ambient" aria-hidden="true" />
      <aside className="qs-nav relative z-10 flex flex-col gap-6 border-r border-border px-4 py-5">
        <button type="button" className="text-left" onClick={() => navigate("/")}>
          <p className="studio-mark" aria-label="66Workshop QuantStudio">
            <span className="studio-mark-num">66</span>
            <span className="studio-mark-rule" />
            <span className="studio-mark-name">QuantStudio</span>
          </p>
          <p className="mt-2 text-[11px] tracking-[0.18em] text-muted uppercase">Quant · Work · Trade</p>
        </button>
        <nav className="flex flex-col gap-1 text-[13px]">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-muted hover:text-fg ${isActive ? "active" : ""}`
                }
              >
                <Icon className="size-3.5" strokeWidth={2} />
                {link.label}
              </NavLink>
            );
          })}
        </nav>
        <p className="mt-auto text-[11px] leading-5 text-dim">
          {snap?.settings.workspaceName || "工作区"}
          <br />
          技能 {snap?.catalog.counts.skills ?? "—"} · 专家 {snap?.catalog.counts.experts ?? "—"} · 团{" "}
          {snap?.catalog.counts.teams ?? "—"}
        </p>
      </aside>
      <main className="relative z-10 min-h-0 overflow-auto p-5 md:p-7">
        <Outlet />
      </main>
    </div>
  );
}
