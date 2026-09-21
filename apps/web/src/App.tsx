import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { HomePage } from "./pages/Home";
import {
  ExpertDetailPage,
  ExpertsPage,
  SkillDetailPage,
  SkillsPage,
  TeamDetailPage,
  TeamsPage,
} from "./pages/Catalog";
import { ConversationPage, ConversationsPage } from "./pages/Conversations";
import { DatabasePage, FavoritesPage } from "./pages/Database";
import { CompetitionsPage, QubePage } from "./pages/Competitions";
import { SettingsPage } from "./pages/Settings";
import { useStudioData } from "./lib/store";

export function App() {
  const load = useStudioData((s) => s.load);
  const error = useStudioData((s) => s.error);
  const snapshot = useStudioData((s) => s.snapshot);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8 text-sm text-muted">
        无法连接工作台 API：{error}。先运行 <code className="text-fg">npm start</code>。
      </div>
    );
  }
  if (!snapshot) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted">正在加载 QuantStudio…</div>;
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="skills/:id" element={<SkillDetailPage />} />
          <Route path="experts" element={<ExpertsPage />} />
          <Route path="experts/:id" element={<ExpertDetailPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/:id" element={<TeamDetailPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="conversations/:id" element={<ConversationPage />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="competitions" element={<CompetitionsPage />} />
          <Route path="qube" element={<QubePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
