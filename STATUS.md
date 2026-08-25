# STATUS — 当前状态（Phase 1-1 已完成）

> 更新日期：2026-08-26 | 基线 commit：`upstream/main @ 4a28663`（v0.9.3） | custom/main @ Phase 1-1

## 1. Phase 进度

| Phase | 状态 | 说明 |
|---|---|---|
| Phase 0 调研与规划 | ✅ 完成 | 4 份文档 + 4 份维护文档已交付，已按 review 修正（commit `f095baa`）|
| Phase 1-1 Progressive Disclosure | ✅ 完成 | Today 单条摘要 + 顶栏轻量菜单 + Proposal 固定主按钮 + 冲突分层 |
| Phase 1-2 / 1-3 | ⏳ 未开始 | 按用户指示停止，不自动进入 |

## 2. 基线验证（本机实测 2026-08-26）

| 项 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ 通过 | Phase 1-1 后仍通过 |
| `npm run build` | ✅ 6.22s | PWA precache 21 entries |
| `npm test` | ⚠️ 96/97 | 无新增失败；1 个上游已知失败：`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下`|
| `npm run dev` | ✅ 需手动验证 | Today 摘要折叠/展开、顶栏菜单、Proposal 预览、冲突决定 |

**测试完成标准**：`npm test` 不得新增失败；已知 baseline 的 1 个失败允许保持。

## 3. 分支状态（简化工作流：无 feature/*）

| 分支 | 指向 | 备注 |
|---|---|---|
| `upstream/main` | `4a28663` | 只读上游 |
| `main` | `4a28663` | 镜像 upstream/main（mirrors），永不接受 custom 合并 |
| `custom/main` | `custom/main` | 所有二次开发直接在 custom/main；当前含 Phase 0 + Phase 1-1 两次提交（`git log --oneline` 最新为 Phase 1-1）|

Remote：`upstream → https://github.com/yhwlwl/study-planner.git`；`origin` 待 fork 后配置。
工作流：`main` 仅 `git merge --ff-only upstream/main`；`custom/main` 直接开发并 `git merge main` 同步。

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

## 6. 手动验证（Phase 1-1）

- [ ] Today：存在待排期/待复盘/逾期时仅一条摘要 `⚠️ N 项计划需要处理 · M 项已逾期 [查看]`，默认折叠、不可随意 dismiss，点击 [查看] 再展开详情；三个原始横幅不再堆叠
- [ ] 顶栏：当 `N>0` 时点击“计划有变化/N 个问题”先弹出轻量问题摘要菜单（列出 danger issues），点“打开计划调整中心”才进入 AdjustmentIntentDialog
- [ ] AdjustmentIntentDialog：再次打开不重置已填子表单（仅首次初始化）
- [ ] Proposal：主按钮固定“应用方案”，上方有状态行（还有 N 个问题未处理/需先调整目标等）；冲突处置首层仅 4 项，`unlock-and-move / change-goal / change-capacity` 收进“更多”
- [ ] 术语：CSV 导出列头“计划执行日”、教程文案“截止日期”

## 7. 下一步

- Phase 1-2 / 1-3 已按指示停止，等待用户触发
- （可选）在 GitHub 上 fork 并配置 `origin` 后 `git push origin custom/main`
