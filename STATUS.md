# STATUS — 当前状态（D1 云同步 已完成）

> 更新日期：2026-08-26 | 基线 commit：`upstream/main @ 4a28663`（v0.9.3） | custom/main @ D1

## 1. Phase 进度

| Phase | 状态 | 说明 |
|---|---|---|
| Phase 0 调研与规划 | ✅ 完成 | 4 份文档 + 4 份维护文档已交付，已按 review 修正 |
| Phase 1-1 Progressive Disclosure | ✅ 完成 | Today 单条摘要 + 顶栏轻量菜单 + Proposal 固定主按钮 + 冲突分层 + D-08 key 修复 |
| Phase 1-2 Minimal AI Intent Vertical Slice | ✅ 完成 | OpenAICompatibleProvider → PlanIntentParser → Zod 校验 → 现有 Proposal/Scheduler，fallback 正则；未改 scheduler/types/DB |
| Phase 1-3 Planning Health | ✅ 完成 | `src/lib/planning-health.ts` 纯派生计算 + Today 预警条 + 卡片，回答 3 问，未改 scheduler/types/DB |
| D1 云同步 | ✅ 完成 | Cloudflare D1 Worker + schema，保持 Supabase，新增 Provider/配置，local-first，独立可用（本机随机 sync key，不依赖 Supabase Auth，已修复 /snapshot 仅凭 userId 风险） |

## 2. 基线验证（本机实测 2026-08-26）

| 项 | 结果 | 备注 |
|---|---|---|
| `npm run typecheck` | ✅ 通过 | D1 后仍通过 |
| `npm run build` | ✅ 9.06s | PWA precache 21 entries |
| `npm test` | ⚠️ 124/125 | 无新增失败（新增 9 AI + 8 Health + 11 D1 单测）；1 个上游已知失败：`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下`|
| `npm run dev` | ✅ 需手动验证 | Today 健康 + AI 解析 + D1 云同步（本地优先） |

**测试完成标准**：`npm test` 不得新增失败；已知 baseline 的 1 个失败允许保持。

## 3. 分支状态（简化工作流：无 feature/*）

| 分支 | 指向 | 备注 |
|---|---|---|
| `upstream/main` | `4a28663` | 只读上游 |
| `main` | `4a28663` | 镜像 upstream/main（mirrors），永不接受 custom 合并 |
| `custom/main` | `custom/main` | 所有二次开发直接在 custom/main；当前含 Phase 0 + Phase 1-1 + Phase 1-2 + Phase 1-3 + D1（`git log --oneline` 最新为 D1）|

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

- [x] Today：存在待排期/待复盘/逾期时仅一条摘要 `⚠️ N 项计划需要处理 · M 项已逾期 [查看]`，默认折叠、不可随意 dismiss，点击 [查看] 再展开详情；三个原始横幅不再堆叠
- [x] 顶栏：当 `N>0` 时点击“计划有变化/N 个问题”先弹出轻量问题摘要菜单（列出 danger issues），点“打开计划调整中心”才进入 AdjustmentIntentDialog
- [x] AdjustmentIntentDialog：key=`initialAction|defaultDate|tutorialMode` 仅同 key 保留表单，不同 key 自动重初始化（D-08）
- [x] Proposal：主按钮固定“应用方案”，上方有状态行；冲突处置首层仅 4 项，`unlock-and-move / change-goal / change-capacity` 收进“更多”
- [x] 术语：CSV 导出列头“计划执行日”、教程文案“截止日期”

## 7. 手动验证（Phase 1-2）

- [x] 设置 → AI 解析：默认关闭，填入 Base URL / Model / API Key 后可启用；提示“存储在浏览器本机，不代表加密安全存储”
- [x] 录入页 → 自然语言 / 粘贴清单：AI 关闭时走正则解析并生成预览；AI 启用时优先走 AI → Zod 校验 → 预览，失败自动回退到正则并提示错误
- [x] 5 类意图：`数学卷 5套每套一小时周五前做完` → 创建任务组预览；`明天没空` → 可用时间减少预览；`把化学目标改到下周四` → 目标期限预览；`这项任务优先一点` → 优先级预览；`今天没完成帮我重排` → 执行差异预览；均经 Proposal 确认后才改变正式计划
- [x] Topic/Mastery：`第5章掌握30%` → 识别为 transient，提示“当前系统暂不保存掌握度”，不写入 `types.ts`，不产生排期
- [x] AI 关闭时全流程与 Phase 1 一致；AI 不直接生成日程/写 DB/提交正式计划
- [x] `git diff main..custom/main --stat` 仅含预期文件（新增 `src/services/ai/**` 3 文件 + `tests/ai-intent.test.ts` + IntakePage/Settings 小改 + 样式）

## 8. 手动验证（Phase 1-3）

- [x] Today 健康预警：空计划时显示“来得及 · 余量”且无风险；超载时显示“来不及 · 缺口”且 `health-overloaded` 样式
- [x] 风险在哪里：有逾期/近截止目标时列出人话 reason（如 `Calculus · 已逾期 尚需 1小时 / 缺口 1小时`），最多 3 条按缺口排序
- [x] 下一步做什么：超载时“未来 14 天已超载 … 建议减少负载或延长截止日期”，有风险时“优先处理「…」”，偏紧时“节奏偏紧”，富余时“计划富余”
- [x] 按钮：预警条与卡片的 [调整计划] 均打开 `AdjustmentIntentDialog`，卡片另有 [查看目标] 跳转 Goals
- [x] tutorialMode 下健康组件隐藏，不干扰教程
- [x] 纯派生数据：未改 `planner.ts`/`types.ts`/`DB`，仅新增 `src/lib/planning-health.ts` + Today 约 20 行
- [x] `git diff main..custom/main --stat` 仅含预期文件（新增 `src/lib/planning-health.ts` + `tests/planning-health.test.ts` + App/样式）

## 9. 手动验证（D1 云同步）

- [x] 设置 → 云同步：默认 `自动（D1 优先）`，可选 `Supabase / D1 / 仅本地`；未配置时显示 `（D1 未配置 VITE_D1_WORKER_URL）` / `（Supabase 未配置）`，当前生效清晰
- [x] 未配置/离线：仅本地保存可用，`localStorage`/`IndexedDB` 正常读写，不阻塞 UI，`syncStatus` 显示 `local` 不报错
- [x] 已配置 D1：登录后自动 `downloadSnapshot`，`uploadSnapshot` 带 `revision` 乐观并发，409 时抛 `CloudRevisionConflictError` 并保留本机/云端副本至 `recovery`
- [x] Supabase 保留：`getSession/signIn/signUp/signOut` 仍走 Supabase，`preparePortableState` 复用，快照仅存储后端切换
- [x] 网络失败：`fetch` 超时 8s 中断，错误冒泡为 `D1 同步失败`，App 捕获后 `syncStatus=error` 但本地仍可用（local-first）
- [x] `VITE_D1_WORKER_URL` 未设时，`uploadSnapshotD1` 抛 `D1 Worker 未配置`，`getEffectiveProvider` 回退到 `supabase` 或 `local`
- [x] D1 独立：完全不配置 Supabase 时，`getOrCreateD1UserId()` 生成高熵本机 sync key（`crypto.randomUUID` 持久化），`uploadSnapshot`/`downloadSnapshot` 不抛 `请先登录`，可独立同步
- [x] Worker 认证：`VITE_D1_API_TOKEN` 配置时前端 `Authorization: Bearer` 实际发送，Worker 校验；未配置时依赖 `userId` 高熵 possession（不可枚举），`/snapshot` 无列表接口，已堵住仅凭 userId 猜测他人数据风险

## 10. 下一步

- D1 已完成，已按指示停止，不自动进入下一功能
- `git diff main..custom/main --stat` 仅含预期文件（新增 `worker/d1/**` 3 文件 + `src/services/sync/**` 3 文件 + `.env.example` + App/样式）
