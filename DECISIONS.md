# DECISIONS — 架构决策记录（ADR 轻量版）

> 按时间倒序；每条含 背景 / 决定 / 后果。关联 `docs/customization/` 详细分析。

---

## D-07 — 2026-08-25 · Phase 1 顺序重排（Review 修正）

- **背景**：初版 ROADMAP 将 Hash Router 列为 P0，将 Readiness/Cushion 拆为两个 P1。Review 认为 Hash 的用户价值低于"来不来得及"的规划感知，且 Hash 的 modal 边界复杂。
- **决定**：Phase 1 改为 1) Progressive Disclosure 2) Minimal AI Vertical Slice 3) Planning Health；Hash 降级至 P2 且首版仅页面级。
- **后果**：`ROADMAP.md` 重写；`UPSTREAM_STRATEGY.md` 不受影响。

## D-06 — 2026-08-25 · AI 能力边界收敛

- **背景**：当前领域模型无 Topic/Mastery（`BASELINE_AUDIT.md §3.3`），但自然语言中会出现"第 5 章不熟"类输入。
- **决定**：Phase 1 AI 仅支持现有模型可表达的 5 类 intent；mastery 类输入识别后告知"暂不保存"并以 transient 方式处理，**禁止为 demo 而扩展 `types.ts`**。首版仅 `OpenAICompatibleProvider`，Ollama/explainer 后加。
- **后果**：`ROADMAP.md P1-1` 缩为 120-180 行垂直切片；`AGENTS.md §4` 写入约束。

## D-05 — 2026-08-25 · 术语统一为 计划执行日 / 截止日期

- **背景**：Shovel 的 Do date / Due date 为营销术语，中文硬翻增加认知负担。
- **决定**：全产品统一用"计划执行日 / 截止日期"。
- **后果**：`AGENTS.md §5` 与 `ROADMAP.md P0-1` 文案约束。

## D-04 — 2026-08-25 · 通知摘要不可 dismiss（Progressive Disclosure 细节）

- **背景**：Today 三横幅堆叠严重，但严重问题若可随意关闭会导致遗忘。
- **决定**：折叠为单条摘要 `⚠️ 3 项计划需要处理 · 1 项即将逾期 [查看]`，默认折叠但不消失；点 [查看] 才展开。
- **后果**：`ROADMAP.md P0-1` 实现约束。

## D-03 — 2026-08-25 · Upstream 同步方向单向性

- **背景**：初版 `UPSTREAM_STRATEGY.md` 写"custom/main 向 main 发 PR"，与"main 镜像 upstream"的目标冲突。
- **决定**：`custom/main` 永不合回 `main`；需贡献回官方时从 `main` 切 `upstream-fix/*` 单独 PR。措辞从 Git tracking 改为 mirrors。
- **后果**：`UPSTREAM_STRATEGY.md §2/§3/§8` 修正。

## D-02 — 2026-08-25 · AI Key 安全边界

- **背景**：初版写"Key 仅存 IndexedDB，不会上传"，易被误读为安全存储。
- **决定**：明确区分 BYOK（存 IndexedDB 但提示非加密安全存储，同源脚本/DevTools 可访问）与服务端 Key（必须走 Cloudflare Worker Secret，前端不持有）。
- **后果**：`UPSTREAM_STRATEGY.md §6` 重写；`AGENTS.md §4` 引用。

## D-01 — 2026-08-25 · 测试完成标准

- **背景**：当前基线 `npm test` 为 96/97（1 个上游已知失败），若标准写"全通过"会导致 agent 顺手修上游 bug。
- **决定**：标准改为"不得新增失败；已知 baseline 允许保持 1 个失败"。除非专门决定修复，否则不碰该用例。
- **后果**：`ROADMAP.md` Phase 1 完成标准与 `AGENTS.md §7`、`STATUS.md §2` 同步。

---

## D-08 — 2026-08-26 · AdjustmentIntentDialog 初始化 key 不含 initialReason

- **背景**：审查指出 `hasInitialized` 永不重置导致跨日期/跨 reason 显示过期表单，已修复为 `lastInitKeyRef = initialAction|defaultDate|tutorialMode`；提问是否应直接包含 `initialReason`。
- **决定**：不单独包含 `initialReason`。`initialAction` 已由 `initialReason` 派生（`too-tiring→load / future-replan→replan / 有日期→current-conflicts / 否则→center`），单独纳入会与 `initialAction` 重复且在同 `initialAction` 下造成不必要重初始化；当前调用方仅经 `openAdjustment(date, reason)` 传入 `current-conflicts`，其余 reason 仅在对话框内部分支选择时生效，无需跨入口区分。若未来新增映射到同一 `initialAction` 但需不同初始态的 reason，再将 key 扩展为 `initialReason|initialAction|...`。
- **后果**：保持 `src/components/AdjustmentIntentDialog.tsx:139` 最小 key，无扩大修改。

## D-09 — 2026-08-26 · Cloudflare D1 作为可选云同步后端

- **背景**：Supabase 为唯一云同步（`study_snapshots` 表，乐观并发 revision），需新增 D1 选项且保留 Supabase、遵守 upstream-first 与 local-first。
- **决定**：新增 `worker/d1/**`（Wrangler + D1 schema + Worker 乐观并发 409）与前端 `src/services/sync/**`（`config.ts` provider 选择 auto/supabase/d1/local + `d1.ts` fetch 8s 超时 + `cloud.ts` 抽象层复用 `preparePortableState`/`validateStateInput`），`App.tsx` 仅改 import 指向 `cloud` 并在 Settings 新增 `云同步` 选择（auto 默认 D1 优先），`supabase.ts` 零重写；`VITE_D1_WORKER_URL` 未配置或 Worker 不可用时 `getEffectiveProvider` 回退到 `supabase`/`local`，`upload/download` 抛错仅置 `syncStatus=error` 不阻塞 `IndexedDB` 本地读写。
- **后果**：`UPSTREAM_STRATEGY.md §6` 扩展 D1 安全说明；`STATUS.md/UPSTREAM_DELTA.md` 记录；新增 7 单测覆盖 provider 选择、409、404、网络失败的 local-first；`git diff main..HEAD` 仅新增 `worker/d1/**` + `sync/**` + `.env.example` + App 极小改动。

## D-10 — 2026-08-26 · D1 独立身份与 /snapshot 访问控制

- **背景**：初版 D1 仍通过 `resolveUserId` 强制要求 Supabase 登录，`VITE_D1_WORKER_URL` 未配时无法独立同步；`Worker /snapshot` 仅凭 `userId` 查询，若 `userId` 可枚举则可读写他人数据；`VITE_D1_API_TOKEN` 在前端 `getAuthHeader` 中原返回空，未形成有效浏览器→Worker 鉴权，目标是 D1 可作为不依赖 Supabase 的独立后端。
- **决定**：前端新增 `getOrCreateD1UserId()`（`crypto.randomUUID` 持久化至 `study-planner:d1-user-id`，高熵 possession 凭证），`cloud.ts` 新增 `getSyncUserIdForProvider`（`d1` 时优先 Supabase 会话否则回退本机 key），`d1.ts` 的 `getAuthHeader` 在 `VITE_D1_API_TOKEN` 配置时实际发送 `Authorization: Bearer`；`App.tsx` 同步门控与队列按 `getEffectiveSyncProvider()` 分流（Supabase 仍需 `sessionUser`，D1 仅需 `getOrCreateD1UserId()` 且 `tutorial` 屏蔽、`cloudReady` 复用），侧边栏状态与 `uploadCloudNow`/`online` 重试均按 provider 区分；`Worker` 保持 `API_TOKEN` 可选校验（有则 401，无则依赖 `userId` 高熵不可枚举，无列表接口）。
- **后果**：`VITE_SUPABASE_*` 全不配时 `provider=auto/d1` 仍可 `uploadSnapshot`/`downloadSnapshot`（11 单测覆盖独立 key 生成、独立上传、API_TOKEN 透传）；`/snapshot` 无法通过遍历 `userId` 窃取（需知悉目标 UUID + 可选 Bearer），`AGENTS.md/UPSTREAM_STRATEGY.md` 的 localStorage/BYOK 说明与 `STATUS.md` 手动验证同步更新。

## 待决策（Phase 1 后）

- 是否引入 Topic/Mastery 最小模型扩展（`ROADMAP.md P2-4`）
- Time-block 二阶段分配器的 availability windows 输入形态
- 是否引入 Cloudflare Worker 作为 AI 代理
