import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Database,
  Home,
  Menu,
  MessageSquare,
  Settings,
  Sparkles,
  Star,
  Swords,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useStudioData } from "../lib/store";
import { PRESETS } from "../mosha/defaults";
import { stageVars } from "../mosha/recipe";
import type { PresetId } from "../mosha/types";

export const LINKS = [
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

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 text-[13px]" aria-label="栏目">
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
            onClick={() => onNavigate?.()}
          >
            <Icon className="size-3.5" strokeWidth={2} />
            {link.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Shell() {
  const snap = useStudioData((s) => s.snapshot);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const preset = (snap?.settings.appearance.preset || "mist") as PresetId;
  const animated = snap?.settings.appearance.animatedBg !== false;
  const shellVars = useMemo(() => {
    const apply = PRESETS[preset]?.apply || PRESETS.mist.apply;
    return stageVars(apply());
  }, [preset]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div
      className="qs-shell"
      data-animated={animated ? "1" : "0"}
      data-preset={preset}
      style={shellVars as CSSProperties}
    >
      <div className="mosha-ambient" aria-hidden="true" />
      <header className="qs-topbar relative z-20 flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button type="button" className="text-left" onClick={() => navigate("/")}>
          <p className="studio-mark" aria-label="66Workshop QuantStudio">
            <span className="studio-mark-num">66</span>
            <span className="studio-mark-rule" />
            <span className="studio-mark-name">QuantStudio</span>
          </p>
        </button>
        <button
          type="button"
          className="qs-menu-btn mosha-btn-ghost"
          aria-expanded={menuOpen}
          aria-controls="qs-mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          菜单
        </button>
      </header>
      <aside className="qs-nav relative z-10 flex flex-col gap-6 border-r border-border px-4 py-5">
        <button type="button" className="text-left" onClick={() => navigate("/")}>
          <p className="studio-mark" aria-label="66Workshop QuantStudio">
            <span className="studio-mark-num">66</span>
            <span className="studio-mark-rule" />
            <span className="studio-mark-name">QuantStudio</span>
          </p>
          <p className="mt-2 text-[11px] tracking-[0.18em] text-muted uppercase">Quant · Work · Trade</p>
        </button>
        <NavList />
        <p className="mt-auto text-[11px] leading-5 text-dim">
          {snap?.settings.workspaceName || "工作区"}
          <br />
          技能 {snap?.catalog.counts.skills ?? "—"} · 专家 {snap?.catalog.counts.experts ?? "—"} · 团{" "}
          {snap?.catalog.counts.teams ?? "—"}
        </p>
      </aside>
      {menuOpen ? (
        <div className="qs-nav-drawer relative z-30" id="qs-mobile-nav" role="dialog" aria-label="导航菜单">
          <button type="button" className="qs-nav-backdrop" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />
          <div className="qs-nav-panel">
            <NavList onNavigate={() => setMenuOpen(false)} />
            <button type="button" className="mosha-btn-ghost mt-4 w-full" onClick={() => setMenuOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}
      <main className="relative z-10 min-h-0 overflow-auto p-5 md:p-7">
        <Outlet />
      </main>
    </div>
  );
}
