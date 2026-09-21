# 66QuantStudio · 执行 SOP

对每次交付按五条闸门跑，不通过就修，再记录残留风险。

## 1. 产品

1. 打开 http://127.0.0.1:3198/ ，首页有 Quant / Work / Trade / 技能玻璃卡。  
2. 技能列表 ≥ 15；专家 44；专家团 14。  
3. 用 `skill-factor-evaluate` 开会话，问「整理动量因子表」，右侧出现 HTML 报告。  
4. 比赛页连接模拟账户，AI 助手发「开多 rb2610」，只出现 **待确认** 计划。  
5. 点确认后才有 fill；点取消则不成交。  
6. 数据库能预览种子表并上传 CSV。

**失败：** 白屏、catalog 为空、未确认就成交、报告编造外部行情。

## 2. 设计

1. 背景/字体/按钮来自 Mosha tokens，不是另一套 Material/Ant。  
2. 卡片看得到磨砂层（sheen / rim / grain）。  
3. 设置里七套预设名称与 Mosha 一致：原片、薄雾、夜虹、厚玻璃、极简、液态、透镜。  
4. 系统「减少动态效果」时扇形卡不转。

**失败：** 圆角卡片但 tokens 被换成别的品牌色体系。

## 3. 后端

```sh
curl -sS http://127.0.0.1:3198/api/health
npm test
```

健康检查 `ok: true`；测试覆盖转义、路径、确认门、catalog 计数。

## 4. 安全审查

| 查 | 期望 |
| --- | --- |
| `GET /api/skills/../etc/passwd?source=1` | 400 |
| 设置写入 apiKey 后再 GET | 无完整密钥 |
| 产物 HTML | 无未转义 `<script>` |
| 静态首页 | `x-content-type-options: nosniff` 与 CSP |
| 交易 | 无自动 fill |

禁止：把 TypeSafe/PandaData 密钥写进源码或提示词。

## 5. 数据分析

1. `csi300-daily.csv`：行数、最新收盘、最大回撤可计算。  
2. `factor-momentum.csv`：按日截面算 Pearson IC；截面过少标 `insufficient-cross-sections`。  
3. 空表标 `empty-table`。  
4. 报告页脚固定研究免责声明。  
5. 不把 IC / 置信度写成胜率。

## 记录

把偏差写入 `docs/task-report.md` 的「已知缺口」。修得动的当场修。
