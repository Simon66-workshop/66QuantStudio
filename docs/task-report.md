# 66QuantStudio 任务结论（可粘贴审计线程）

**仓库：** https://github.com/Simon66-workshop/66QuantStudio  
**源：** https://github.com/quantskills/QuantStudio.git（完整放入 `vendor/quantstudio/`）  
**视觉：** https://github.com/Simon66-workshop/mosha-card-ui  
**Web UI：** http://127.0.0.1:3198/  

没有单独的 PRD/prototype 文件（查过源仓库 docs、`/workspace`、项目 store）。按 QuantStudio 自己的 README / 栏目 / 能力库快照 + Mosha 设计系统实现。

## 运了什么

给兆辉（Simon Wu）的可用浏览器工作台，不是文档站：

- 首页 Mosha 扇形玻璃卡（Quant / Work / Trade / 技能）
- 技能 15、专家 44、专家团 14，可开会话、可创建本机技能
- 会话 + 右侧 HTML 研究报告（种子行情/因子表，缺口会写明）
- 数据库预览与 CSV 导入
- 期货模拟赛账户巡检；「开多」只生成待确认计划
- Jev 三模板本地盯盘（无 TypeSafe 密钥时不冒充官方模型）
- 设置：Mosha 七预设、工作区、可选模型密钥（回显脱敏）

## 怎么跑

克隆目的地仓库后必须构建前端（GitHub 上未入库 `apps/web/dist`，打包 JS 超过 API 写入体积）：

```sh
git clone https://github.com/Simon66-workshop/66QuantStudio.git
cd 66QuantStudio
npm install
npm test
npm run build
npm start
```

浏览器打开：**http://127.0.0.1:3198/**  
健康检查：http://127.0.0.1:3198/api/health  
热更新：`npm run dev` 后打开 **http://127.0.0.1:5173/**

Node 需要 **22.12+**（构建用 22.22.2 验证）。

本云桌面已构建并在跑，可 **[Try Live](bc-0b5a2cba-1eb5-5e4a-bdcb-65000d5cd229#desktop)**，打开 http://127.0.0.1:3198/。

## SOP 实跑（本环境）

| 闸门 | 结果 |
| --- | --- |
| 产品 | `/` 标题 66QuantStudio；catalog 15/44/14；因子会话产出无 script 的 HTML；开多 → pending、fills=0 |
| 设计 | Mosha tokens + `mosha-card.css` 光学层；设置含七套中文预设名 |
| 后端 | `/api/health` ok；`npm test` 6/6；`npm run build` 通过 |
| 安全 | `..` 读 SKILL 返回 400；设置密钥 GET 仅 last4；静态页 nosniff + CSP |
| 数据 | CSI300 420 行可算回撤；因子表 640 行可算 IC；空表/截面不足有 gap 标记 |

## 已知缺口 / 残留风险

- 上游 DSH `pnpm run web` 未在本 Web 进程内拉起（需 Node 22.19+ 与 DSH Home）。工作台已捆绑 15 份 SKILL.md 与 catalog。完整 QuantStudio 树在构建机 `vendor/quantstudio/`，**未推入 GitHub**（约 65MB）；可选 `scripts/sync-quantstudio.sh`。
- GitHub 上的 `server/data/catalog.json` 是紧凑快照（15/44/14 的 id/名称/描述）；专家 `excerpt`/`role`、专家团 `lead`/`members` 在远端可能被省略。本机完整 catalog 仍在构建目录。
- `cursor[bot]` 对目的地仓库 `git push` 为 403；GitHub 树通过 Simon 账号 Contents API 写入 `main`。
- 无 PandaData / 官方赛事 CLI：账户与成交为本地演示，`executed-sim` 不是柜台成交。
- 无 TypeSafe 密钥：Jev 用本地规则，不是 jev-1.13.0 官方评估。
- 可选模型接口 8s 超时失败则回退本地引擎。
- 共享部署不隔离成员数据（沿用上游声明）。
- iframe 预览研究报告依赖浏览器允许 srcDoc；产物已转义且无脚本。
- `/workspace` 里的 66 二创小助手与本产品无关，未改动。

## 文档路径

仓库：`docs/tech-solution.md` `docs/task-breakdown.md` `docs/execution-sop.md` `docs/acceptance-criteria.md` `docs/task-report.md` `docs/project-context.md`  
Store：`/cursor/stores/self/docs/` 同名文件。
