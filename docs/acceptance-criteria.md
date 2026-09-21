# 66QuantStudio · 验收标准

可打开浏览器使用才算交付，不是只交仓库文档。

## 必须有

- 目的地仓库：https://github.com/Simon66-workshop/66QuantStudio  
- 同一套文档在仓库 `docs/` 与 `/cursor/stores/self/docs/`  
- `docs/task-report.md` 两边都在  
- `npm start` 后 **http://127.0.0.1:3198/** 返回 66QuantStudio HTML  
- Mosha 玻璃卡片，而不是无关的设计系统  

## 产品

- [ ] 首页 Quant · Work · Trade 入口可点  
- [ ] 技能 15、专家 44、专家团 14（可另加本机技能）  
- [ ] 会话能产出可预览 HTML 报告  
- [ ] 数据库预览 + CSV 导入  
- [ ] 比赛计划确认前 fills=0  
- [ ] Jev 三模板可开始/停止/采样，停止会取消未确认自动计划  
- [ ] QUBE/EVO 只外链官方站点  

## 质量

- [ ] `npm test` 通过  
- [ ] `npm run build` 通过  
- [ ] 路径穿越被拒  
- [ ] 密钥不出现在 GET JSON 全文  
- [ ] 因子/行情缺口有标记，不编造 PandaData 实时盘  

## 允许的缺口（需写进 task-report）

- 无 DSH 时不跑上游 `pnpm run web`  
- 无 TypeSafe 密钥时 Jev 为本地规则，不得声称官方模型  
- 无赛事 CLI 时成交为 `executed-sim`  
- 共享部署不隔离成员数据（沿用上游声明）
