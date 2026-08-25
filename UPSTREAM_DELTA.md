# UPSTREAM_DELTA — 上游差异追踪

> 用途：记录 `main`（镜像 upstream）与 `custom/main`（我们的产品）之间的全部差异，便于每次 `git merge main` 时快速判断冲突来源。
> 更新时机：每次 `custom/main` 合并新 feature 后追加。

---

## 基线

- **Upstream**：`yhwlwl/study-planner @ 4a28663`（v0.9.3），`main` 镜像于 2026-08-25
- **Custom 状态**：`custom/main` 已含 Phase 0（`f095baa`）+ Phase 1-1 + Phase 1-2 + Phase 1-3 + D1

## 差异清单（按文件）

| 文件 | 变更类型 | 关联 Feature | 说明 | Upstream 冲突风险 |
|---|---|---|---|---|
| `docs/customization/**` | 新增 | Phase 0 | 4 份调研与规划文档 | 无（新增文件零冲突） |
| `AGENTS.md` | 新增 | Phase 0 收尾 | AI agent 工作手册 | 无 |
| `STATUS.md` | 新增/修改 | Phase 0+1-1 | 当前状态与验证基线（本次更新） | 无 |
| `DECISIONS.md` | 新增 | Phase 0 收尾 | 决策记录 | 无 |
| `UPSTREAM_DELTA.md` | 新增/修改 | Phase 0+1-1 | 本文件（本次更新） | 无 |
| `src/App.tsx` | 修改 | Phase 1-1+1-2+1-3+D1 | Today 单条摘要 + 顶栏菜单 + 术语 + Settings AI 区 + Today Health + Settings 云同步选择（import 改为 cloud 抽象） + D1 独立门控（本机 sync key，Supabase 未配置时仍可同步，D1 状态 UI） | 低-中 |
| `src/components/AdjustmentIntentDialog.tsx` | 修改 | Phase 1-1 | 修复每次打开重置子表单（`lastInitKeyRef = initialAction\|defaultDate\|tutorialMode`，D-08） | 低 |
| `src/components/ProposalDialog.tsx` | 修改 | Phase 1-1 | 主按钮固定“应用方案”+上方状态行 + 冲突首层4项/更多收纳 | 中 |
| `src/components/IntakePage.tsx` | 修改 | Phase 1-2 | 自然语言入口接入 AI 优先→Zod 校验→fallback 正则；支持 5 类意图 + transient 提示，不直接写 DB | 低 |
| `src/styles.css` | 修改 | Phase 1-1+1-2+1-3 | 新增 Today 摘要/顶栏菜单/提案状态行/AI 草稿/Planning Health 样式 | 低 |
| `src/services/ai/config.ts` | 新增 | Phase 1-2 | AI 配置持久化（localStorage + 安全提示） | 无 |
| `src/services/ai/provider.ts` | 新增 | Phase 1-2 | OpenAICompatibleProvider 单实现 | 无 |
| `src/services/ai/intent-parser.ts` | 新增 | Phase 1-2 | PlanIntentParser 实现 + Zod 校验 + fallback + prepareStateFromAIDraft | 无 |
| `src/services/ai/index.ts` | 新增 | Phase 1-2 | barrel 导出 | 无 |
| `tests/ai-intent.test.ts` | 新增 | Phase 1-2 | AI 9 单测（回退/transient/各 intent + 校验失败回退 + goal/priority/execution happy-path） | 无 |
| `src/lib/planning-health.ts` | 新增 | Phase 1-3 | 纯派生计算：来不来得及/风险在哪里/下一步做什么（<150 行） | 无 |
| `tests/planning-health.test.ts` | 新增 | Phase 1-3 | Health 8 单测（空/超载/逾期/下一步 + today/horizonEnd/远期/零容量/去重边界） | 无 |
| `worker/d1/schema.sql` | 新增 | D1 | D1 表 `study_snapshots`（user_id PK, data TEXT, revision, client_updated_at, updated_at） | 无 |
| `worker/d1/wrangler.toml.example` | 新增 | D1 | Cloudflare Worker 本地示例配置（`cp wrangler.toml.example wrangler.toml` 后本地 `wrangler dev`），生产以 Dashboard 为 source of truth，不提交 `worker/d1/wrangler.toml`（已加入 `.gitignore`） | 无 |
| `worker/d1/src/index.ts` | 新增 | D1 | Worker 逻辑（已迁移至 `functions/api/d1/snapshot.ts`，保留作本地调试参考，线上以 Pages 为准） | 无 |
| `functions/api/d1/snapshot.ts` | 新增 | D1 | Cloudflare Pages Function 集成（同 Worker 逻辑，Dashboard 绑定 D1，直接复用 `DB`，`/`/health 兼容） | 无 |
| `worker/d1/src/index.ts` | 新增 | D1 | Worker 逻辑：GET /snapshot, PUT /snapshot, CORS, 409 乐观并发 | 无 |
| `.env.example` | 修改 | D1 | 新增 `VITE_D1_WORKER_URL` | 低 |
| `src/services/sync/config.ts` | 新增 | D1 | Sync provider 选择（auto/supabase/d1/local），localStorage + `isD1EnvConfigured()`（含 Pages 同源 `''`）+ `getOrCreateD1UserId()` 独立身份 | 无 |
| `src/services/sync/d1.ts` | 新增 | D1 | D1 客户端：`uploadSnapshotD1/downloadSnapshotD1`（`VITE_D1_WORKER_URL` 或同源 `/api/d1/snapshot`），8s 超时，409→`CloudRevisionConflictError`，`VITE_D1_API_TOKEN` Bearer 鉴权，local-first | 无 |
| `src/services/sync/cloud.ts` | 新增 | D1 | 抽象层：`getEffectiveSyncProvider()` + `getSyncUserIdForProvider()`（D1 时回退本机 sync key，不依赖 Supabase），委托 Supabase/D1/local，复用 `preparePortableState` | 无 |
| `tests/d1-sync.test.ts` | 新增 | D1 | D1 11 单测（provider 选择/回退/网络失败/409/成功/未配置/独立 key/独立上传/API_TOKEN 鉴权） | 无 |

### 待后续（如批准）

```markdown
| `src/types.ts` | 修改 | P2-4（若批准） | 可选 topicTags 字段 | 中 |
```

## 验证快照

- 2026-08-25（Phase 0）：`npm run typecheck` ✅ / `npm test` 96/97 ⚠️（1 上游已知失败）/ `npm run build` ✅
- 2026-08-26（Phase 1-1）：`npm run typecheck` ✅ / `npm test` 96/97 ⚠️（无新增失败）/ `npm run build` ✅ 6.22s / PWA 21 entries
- 2026-08-26（Phase 1-2）：`npm run typecheck` ✅ / `npm test` 105/106 ⚠️（无新增失败，新增 9 AI 单测）/ `npm run build` ✅ 6.59s / PWA 21 entries
- 2026-08-26（Phase 1-3）：`npm run typecheck` ✅ / `npm test` 113/114 ⚠️（无新增失败，新增 8 Health 单测 + 9 AI 单测）/ `npm run build` ✅ 9.06s / PWA 21 entries
- 2026-08-26（D1）：`npm run typecheck` ✅ / `npm test` 124/125 ⚠️（无新增失败，新增 11 D1 单测）/ `npm run build` ✅ 6.96s / PWA 21 entries
- 详见 `STATUS.md §2`

## 注意事项

- 本文件仅追踪**有意差异**；`package-lock.json` 等由 `npm install` 产生的临时 diff 不计入，合并前应 `git checkout -- package-lock.json` 清理。
- 每次 `git merge main` 前执行 `git diff main..custom/main --stat` 核对本表是否一致。
