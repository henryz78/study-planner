# UPSTREAM_DELTA — 上游差异追踪

> 用途：记录 `main`（镜像 upstream）与 `custom/main`（我们的产品）之间的全部差异，便于每次 `git merge main` 时快速判断冲突来源。
> 更新时机：每次 `custom/main` 合并新 feature 后追加。

---

## 基线

- **Upstream**：`yhwlwl/study-planner @ 4a28663`（v0.9.3），`main` 镜像于 2026-08-25
- **Custom 基线**：Phase 0 结束时 `custom/main` 尚未创建，`git diff main..custom/main` 为空

## 差异清单（按文件）

> Phase 0 仅新增文档，无产品代码差异。Phase 1 起按以下格式追加。

| 文件 | 变更类型 | 关联 Feature | 说明 | Upstream 冲突风险 |
|---|---|---|---|---|
| `docs/customization/**` | 新增 | Phase 0 | 4 份调研与规划文档 | 无（新增文件零冲突） |
| `AGENTS.md` | 新增 | Phase 0 收尾 | AI agent 工作手册 | 无 |
| `STATUS.md` | 新增 | Phase 0 收尾 | 当前状态与验证基线 | 无 |
| `DECISIONS.md` | 新增 | Phase 0 收尾 | 决策记录 | 无 |
| `UPSTREAM_DELTA.md` | 新增 | Phase 0 收尾 | 本文件 | 无 |

### 模板（后续追加）

```markdown
| `src/services/ai/provider.ts` | 新增 | Phase 1-2 Minimal AI Slice | AIProvider + OpenAICompatibleProvider | 无 |
| `src/services/ai/intent-parser.ts` | 新增 | Phase 1-2 | 实现 PlanIntentParser，Zod 校验 + 正则回退 | 无 |
| `src/lib/planning-health.ts` | 新增 | Phase 1-3 | Planning Health derived 计算 | 无 |
| `src/App.tsx` | 修改 | Phase 1-1 | Today 摘要折叠 + 术语统一（约 30 行） | 低 |
| `src/components/ProposalDialog.tsx` | 修改 | Phase 1-1 | 主按钮固定 + 冲突分层（约 40 行） | 中 |
| `src/types.ts` | 修改 | P2-4（若批准） | 可选 topicTags 字段 | 中 |
```

## 验证快照

- 2026-08-25：`npm run typecheck` ✅ / `npm test` 96/97 ⚠️（1 上游已知失败）/ `npm run build` ✅
- 详见 `STATUS.md §2`

## 注意事项

- 本文件仅追踪**有意差异**；`package-lock.json` 等由 `npm install` 产生的临时 diff 不计入，合并前应 `git checkout -- package-lock.json` 清理。
- 每次 `git merge main` 前执行 `git diff main..custom/main --stat` 核对本表是否一致。
