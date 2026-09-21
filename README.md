# 66QuantStudio

Simon Wu（兆辉）的 QuantStudio 工作台。在浏览器打开即可使用：**技能 / 专家 / 专家团 / 会话 / 数据库 / 比赛 / Jev 盯盘 / 设置**。

视觉系统来自 [Mosha Card UI](https://github.com/Simon66-workshop/mosha-card-ui)（磨砂玻璃卡片、七套预设、tokens）。产品能力对齐 [QuantStudio](https://github.com/quantskills/QuantStudio) 的 README、栏目表和 `assets/library-v2` 快照（15 技能、44 专家、14 专家团）。仓库内没有单独的 PRD/prototype 文件，技术方案按该假设编写。

## 运行（Web UI）

需要 **Node.js 22.12+**（推荐 22.19+）。

```sh
git clone https://github.com/Simon66-workshop/66QuantStudio.git
cd 66QuantStudio
npm install
npm run build
npm start
```

打开终端打印的地址：

**http://127.0.0.1:3198/**

开发热更新（API :3198 + Vite :5173）：

```sh
npm install
npm run dev
```

然后打开 **http://127.0.0.1:5173/**。`npm run dev` 会设置 `QS_ALLOW_DEV_ORIGINS=1`，只授权本项目 Vite 开发端口访问本地 API。普通 `npm start` 仍默认拒绝 5173/4173。

健康检查：http://127.0.0.1:3198/api/health

## 你能做什么

| 栏目 | 行为 |
| --- | --- |
| 首页 | Mosha 扇形卡片进入 Quant / Work / Trade / 技能 |
| 技能 | 浏览快照技能、创建本机技能、加载进会话 |
| 专家 / 专家团 | 查看职责与成员，开始专属或协作会话 |
| 会话 | 对话、执行轨迹、右侧 HTML 研究报告 |
| 数据库 | 预览种子表、导入 CSV |
| 比赛 | 模拟账户巡检、待确认计划、Jev 模板盯盘 |
| 设置 | 工作区、Mosha 预设、可选模型密钥 |

赛事写入**不会自动成交**。点「确认执行这笔交易」后才记一笔 `executed-sim` 本地回执。未配置 PandaData / TypeSafe / 官方 CLI 时使用工作区缓存与本地规则，并在产物里标注缺口。

上游 DSH 桌面工作台源码在 `vendor/quantstudio/`（GPL-3.0-or-later OR 商业授权）。完整 `pnpm run web` 需要 Node 22.19+ 与 DSH 运行时，见该目录 README。本仓库交付的可用产品是根目录 Web UI。

## 验证

```sh
npm test
npm run build
```

许可：根仓库 MIT（Simonwu）。Vendored QuantStudio 与 Mosha 保留各自许可证，见 `NOTICE.md`。
