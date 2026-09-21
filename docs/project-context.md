# 66QuantStudio · 项目上下文

## 谁

产品经理 **兆辉（Simon Wu）**。要的是能打开即用的 QuantStudio，不是说明书写。

## 目标

- 个人开源量化工作台：Quant · Work · Trade  
- 技能 / 专家 / 专家团 / 会话 / 数据库 / 比赛 / Jev  
- Web UI，视觉锁定 [mosha-card-ui](https://github.com/Simon66-workshop/mosha-card-ui)  
- 代码与审计文档进 https://github.com/Simon66-workshop/66QuantStudio  

## 约束

- 上游 QuantStudio 是 DSH 插件，完整桌面运行时不塞进本 Web 进程  
- 无独立 PRD：以 README + 快照 + Mosha 为规格  
- 目的地仓库已有 Initial commit（MIT LICENSE），只能追加，不覆盖无关历史  
- 交易必须确认；研究结论必须可复核、标缺口  
- 不把密钥提交进 Git  

## 决定

1. 交付物是根目录 Node 服务 + Mosha React 工作台，端口 **3198**。  
2. 完整上游树放 `vendor/quantstudio/`，Mosha 放 `vendor/mosha-card-ui/` 与 `apps/web/src/mosha/`。  
3. 本地引擎在没有模型/PandaData 时仍能用种子表出报告。  
4. 云桌面可 Try Live 时，在 task-report 写明。
