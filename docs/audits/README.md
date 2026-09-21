# 审计协作（只走 GitHub）

Astra 与 Cursor Quant **不传文件**。读写都在本仓。

## 流程

1. Astra 读 [`docs/astra-audit-brief.md`](../astra-audit-brief.md)，按提示词全量审计。
2. Astra 开分支 `audit/astra-YYYYMMDD`，提交：
   - `docs/audits/astra-YYYYMMDD.md`
   - `docs/audits/astra-YYYYMMDD.json`
   并对 `main` 开 PR（标题 `audit(astra): YYYY-MM-DD`）。无 PR 权限则把这两文件直接推到 `main`。
3. Cursor Quant 按 finding `id` 修代码，push，并写 `docs/audits/cursor-YYYYMMDD.md`（`fixed` / `wontfix` / `deferred` + commit）〄. Astra `git pull` 后做回归，新开一份日期文件，不要覆盖上一份。

## 不要

- 覆盖 `docs/task-report.md`
- 提交密钥、`node_modules`、`apps/web/dist`、`vendor/quantstudio`
- force-push `main`
