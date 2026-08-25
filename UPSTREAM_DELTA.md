# UPSTREAM_DELTA — 上游差异追踪

> 用途：记录 `main`（镜像 upstream）与 `custom/main`（我们的产品）之间的全部差异，便于每次 `git merge main` 时快速判断冲突来源。
> 更新时机：每次 `custom/main` 合并新 feature 后追加。

---

## 基线

- **Upstream**：`yhwlwl/study-planner @ 4a28663`（v0.9.3），`main` 镜像于 2026-08-25
- **Custom 状态**：`custom/main` 已含 Phase 0（`f095baa`）+ Phase 1-1 + Phase 1-2

## 差异清单（按文件）

| 文件 | 变更类型 | 关联 Feature | 说明 | Upstream 冲突风险 |
|---|---|---|---|---|
| `docs/customization/**` | 新增 | Phase 0 | 4 份调研与规划文档 | 无（新增文件零冲突） |
| `AGENTS.md` | 新增 | Phase 0 收尾 | AI agent 工作手册 | 无 |
| `STATUS.md` | 新增/修改 | Phase 0+1-1 | 当前状态与验证基线（本次更新） | 无 |
| `DECISIONS.md` | 新增 | Phase 0 收尾 | 决策记录 | 无 |
| `UPSTREAM_DELTA.md` | 新增/修改 | Phase 0+1-1 | 本文件（本次更新） | 无 |
| `src/App.tsx` | 修改 | Phase 1-1+1-2 | Today 单条摘要折叠（不可随意 dismiss）+ 顶栏轻量问题摘要菜单 + 术语统一（计划执行日/截止日期）+ Settings AI 配置区 | 低-中 |
| `src/components/AdjustmentIntentDialog.tsx` | 修改 | Phase 1-1 | 修复每次打开重置子表单（`lastInitKeyRef = initialAction\|defaultDate\|tutorialMode`，D-08） | 低 |
| `src/components/ProposalDialog.tsx` | 修改 | Phase 1-1 | 主按钮固定“应用方案”+上方状态行 + 冲突首层4项/更多收纳 | 中 |
| `src/components/IntakePage.tsx` | 修改 | Phase 1-2 | 自然语言入口接入 AI 优先→Zod 校验→fallback 正则；支持 5 类意图 + transient 提示，不直接写 DB | 低 |
| `src/styles.css` | 修改 | Phase 1-1+1-2 | 新增 Today 摘要/顶栏菜单/提案状态行/AI 草稿样式 | 低 |
| `src/services/ai/config.ts` | 新增 | Phase 1-2 | AI 配置持久化（localStorage + 安全提示） | 无 |
| `src/services/ai/provider.ts` | 新增 | Phase 1-2 | OpenAICompatibleProvider 单实现 | 无 |
| `src/services/ai/intent-parser.ts` | 新增 | Phase 1-2 | PlanIntentParser 实现 + Zod 校验 + fallback + prepareStateFromAIDraft | 无 |
| `src/services/ai/index.ts` | 新增 | Phase 1-2 | barrel 导出 | 无 |
| `tests/ai-intent.test.ts` | 新增 | Phase 1-2 | AI 9 单测（回退/transient/各 intent + 校验失败回退 + goal/priority/execution happy-path） | 无 |

### 待后续（如批准）

```markdown
| `src/services/ai/provider.ts` | 新增 | Phase 1-2 Minimal AI Slice | AIProvider + OpenAICompatibleProvider | 无 |
| `src/services/ai/intent-parser.ts` | 新增 | Phase 1-2 | 实现 PlanIntentParser，Zod 校验 + 正则回退 | 无 |
| `src/lib/planning-health.ts` | 新增 | Phase 1-3 | Planning Health derived 计算 | 无 |
| `src/types.ts` | 修改 | P2-4（若批准） | 可选 topicTags 字段 | 中 |
```

## 验证快照

- 2026-08-25（Phase 0）：`npm run typecheck` ✅ / `npm test` 96/97 ⚠️（1 上游已知失败）/ `npm run build` ✅
- 2026-08-26（Phase 1-1）：`npm run typecheck` ✅ / `npm test` 96/97 ⚠️（无新增失败）/ `npm run build` ✅ 6.22s / PWA 21 entries
- 2026-08-26（Phase 1-2）：`npm run typecheck` ✅ / `npm test` 105/106 ⚠️（无新增失败，新增 9 AI 单测）/ `npm run build` ✅ 6.59s / PWA 21 entries
- 详见 `STATUS.md §2`

## 注意事项

- 本文件仅追踪**有意差异**；`package-lock.json` 等由 `npm install` 产生的临时 diff 不计入，合并前应 `git checkout -- package-lock.json` 清理。
- 每次 `git merge main` 前执行 `git diff main..custom/main --stat` 核对本表是否一致。
