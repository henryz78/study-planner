# STATUS — 当前状态（Phase 0 完成，待 Phase 1 启动）

> 更新日期：2026-08-25 | 基线 commit：`upstream/main @ 4a28663`（v0.9.3）

## 1. Phase 进度

| Phase | 状态 | 说明 |
|---|---|---|
| Phase 0 调研与规划 | ✅ 完成 | 4 份文档 + 4 份维护文档已交付，已按 review 修正 |
| Phase 1 开发 | ⏳ 待启动 | 需审核 `docs/customization/ROADMAP.md` 后开工 |

## 2. 基线验证（本机实测 2026-08-25）

| 项 | 结果 | 备注 |
|---|---|---|
| `npm install` | ✅ 507 packages |  |
| `npm run typecheck` | ✅ 通过 |  |
| `npm test` | ⚠️ 96/97 | 1 个上游已知失败：`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下`（`expected true to be false`）|
| `npm run build` | ✅ 11.71s | PWA precache 21 entries |
| `npm run dev` | ✅ HTTP 200 | `http://localhost:5199/` |

**测试完成标准（Phase 1 起）**：`npm test` 不得新增失败；已知 baseline 的 1 个失败允许保持。不得为追求全绿而顺手修上游逻辑。

## 3. 分支状态

| 分支 | 指向 | 备注 |
|---|---|---|
| `upstream/main` | `4a28663` | 只读上游 |
| `main` | `4a28663` | 镜像 upstream/main（mirrors），无自定义提交 |
| `custom/main` | 待创建 | Phase 1 首个 feature 合并后创建 |
| `feature/*` | — | 尚未创建 |

Remote：`upstream → https://github.com/yhwlwl/study-planner.git`；`origin` 待 fork 后配置。

## 4. 已知基线问题（upstream 自带，不在 Phase 0 修复）

- 上述 1 个失败测试（与 `fcbd7ef` 长任务上限可配置相关）
- `src/components/ReplanDialog.tsx` 死代码（656 行，无 import）
- README 版本号 `v0.9.0` vs `package.json v0.9.3` 漂移
- `src/App.tsx` 2554 行巨石化（需极度克制修改）

## 5. 文档清单

| 文档 | 路径 | 状态 |
|---|---|---|
| 基线审计 | `docs/customization/BASELINE_AUDIT.md` | ✅ |
| 参考分析 | `docs/customization/REFERENCE_ANALYSIS.md` | ✅ |
| 同步策略 | `docs/customization/UPSTREAM_STRATEGY.md` | ✅ 已按 review 修正 |
| 路线图 | `docs/customization/ROADMAP.md` | ✅ 已按 review 重写 Phase 1 |
| Agent 手册 | `AGENTS.md` | ✅ 本次新增 |
| 决策记录 | `DECISIONS.md` | ✅ 本次新增 |
| 上游差异 | `UPSTREAM_DELTA.md` | ✅ 本次新增 |
| 当前状态 | `STATUS.md` | ✅ 本文件 |

## 6. 下一步（需用户确认）

- [ ] 审核 `ROADMAP.md` 的 Phase 1 三项（Progressive Disclosure / Minimal AI Slice / Planning Health）
- [ ] 确认后创建 `custom/main` 分支并开 `feature/*` 开发
- [ ] （可选）在 GitHub 上 fork 并配置 `origin`
