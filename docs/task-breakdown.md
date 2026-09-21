# 66QuantStudio · 任务拆解

## T0 规格与仓库

- 全量克隆 https://github.com/quantskills/QuantStudio.git → `vendor/quantstudio/`
- 克隆 https://github.com/Simon66-workshop/mosha-card-ui → 设计系统
- 检索 `/workspace`、`/cursor/stores/self`：无独立 PRD/原型
- 目的地 https://github.com/Simon66-workshop/66QuantStudio 当时仅有 MIT LICENSE 与标题 README，在其上追加，不 force-push

## T1 工作台后端

- 从 `library-v2` 生成 `server/data/catalog.json`
- 种子数据集 + 研究/因子统计引擎
- 会话、产物、收藏、本机技能
- 比赛计划状态机：pending → confirm | cancel
- Jev 模板盯盘（本地规则）
- 设置与密钥脱敏

## T2 Mosha Web UI

- Vite + React 19，tokens/CSS/卡片层来自 Mosha
- 栏目：首页、技能、专家、专家团、会话、数据库、收藏、比赛、QUBE/EVO、设置
- 右侧结果工作台预览 HTML
- 响应式：窄屏隐藏侧栏；`prefers-reduced-motion` 关掉自旋

## T3 验收资产

- `docs/tech-solution.md`
- `docs/task-breakdown.md`
- `docs/execution-sop.md`
- `docs/acceptance-criteria.md`
- `docs/task-report.md`（审计粘贴稿）
- `docs/project-context.md`
- 同步到 `/cursor/stores/self/docs/`

## T4 SOP 实跑

- 产品：栏目可点、会话出报告、计划需确认
- 设计：Mosha 卡片/氛围/预设
- 后端：`/api/health`、catalog 计数
- 安全：路径穿越、CSP、密钥脱敏、禁止自动成交
- 数据分析：CSI300 回撤、因子 IC、缺口标注

## T5 发布

- `npm test` + `npm run build`
- 提交并 push 到 `Simon66-workshop/66QuantStudio` 的 `main`（在已有 Initial commit 上追加）
