# 66QuantStudio · 技术方案

## 规格来源（假设）

在 `/workspace`（当前是 66 二创小助手，不是 QuantStudio）、`/cursor/stores/self` 与源仓库中**没有找到单独的 PRD 或交互原型文件**。

本方案把下列材料当作产品规格：

1. [QuantStudio README](https://github.com/quantskills/QuantStudio) 栏目表与 Quant · Work · Trade 叙事  
2. `vendor/quantstudio/docs/`（比赛、因子赛、Jev、能力库快照）  
3. `vendor/quantstudio/assets/library-v2`（15 技能 / 44 专家 / 14 专家团）  
4. 上游 UI 截图（工作台、报告、数据库、Jev）  
5. Simon 指定的视觉系统：[mosha-card-ui](https://github.com/Simon66-workshop/mosha-card-ui)

上游 DSH `pnpm run web` 仍保留在 `vendor/quantstudio/`，但交付给兆辉使用的是**可在浏览器打开的 Web 工作台**（Mosha 玻璃 UI），而不是只交文档。

## 目标

让产品经理在本机或云桌面打开一个 URL，完成：发现能力、开会话、看研究报告、管本地数据、在模拟赛里**确认后**才记账。

## 架构

```
浏览器  ──►  apps/web (Vite/React 19 + Mosha CSS/tokens)
                │  /api/*
                ▼
           server/index.mjs  (Node 22 stdlib HTTP)
                │
                ├─ server/data/catalog.json   ← 从 library-v2 抽出
                ├─ server/data/seed/*.csv     ← 研究缓存
                ├─ vendor/quantstudio/        ← 完整上游源码与 SKILL.md
                └─ server/runtime/state.json  ← 本机会话/计划/密钥（不入库）
```

未引入 Express。API 与静态 `apps/web/dist` 共用 **http://127.0.0.1:3198/**，端口对齐上游 README。

## 能力如何落地

| 规格栏目 | 实现 |
| --- | --- |
| 首页 | Mosha 扇形四卡：量化 / 工作 / 赛事 / 技能 |
| 技能 | 快照 15 个 + 本机创建；可加载 SKILL.md；卸载不删上游文件 |
| 专家 / 专家团 | 44 / 14，展示职责与成员，开专属或协作会话 |
| 会话 + 结果工作台 | 本地研究引擎：命中缓存 → 统计/IC → 转义后的 HTML 产物 |
| 数据库 | 种子 CSI300 / 因子 / 分钟行情；CSV 导入与预览 |
| 比赛 | 只读账户巡检；开多等话术生成 **pending** 计划 |
| Jev | 三套模板 + 本地规则评估；无 TypeSafe 密钥时不伪装官方 Jev |
| 设置 | Mosha 七预设、工作区名、可选 OpenAI 兼容模型；密钥回显脱敏 |

模型密钥可选。未配置或调用失败时回退本地引擎，并在轨迹中保留数据缺口。

## 视觉

不另造皮肤。复制 Mosha 的：

- `css/mosha-card.css` 卡片层（spin / sheen / rim / grain / chroma / depth）  
- tokens：`#07080c` 背景、Sora / Syne / Fraunces、七预设  
- 工作台卡片用同一套光学层，做成 `qs-panel`

## 安全边界

- 交易没有自动成交；确认后只写 `executed-sim`  
- SKILL.md 路径限制在 `library-v2` 下，`..` 返回 400  
- HTML 产物 `escapeHtml`，报告不含脚本  
- 密钥不进 Git；GET 只返回 `hasKey` + last4  
- 静态页 CSP + `nosniff`

## 明确不做

- 不把 DSH 运行时打进本 Web 进程（体积与 Node 引擎约束）  
- 不连接真实期货柜台或 PandaData（无凭证时标注缺口）  
- 不把 QUBE/EVO 嵌进本地，只提供官方链接  

上游完整 DSH 启动方式见 `vendor/quantstudio/README.md`（`pnpm run web`，Node 22.19+）。
