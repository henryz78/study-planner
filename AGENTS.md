# AGENTS.md — AI Agent 工作手册（Study Planner 二次开发）

> 本文件面向在此仓库中工作的 AI agent（OpenCode / Muse Spark 等）。
> 目标：在保留 `yhwlwl/study-planner` upstream 可同步性的前提下，用最小侵入式修改把产品变得更易懂、更智能、更适合长期学习。
> 详细基线见 `docs/customization/` 四份文档。

---

## 1. 项目一句话

React 18 + TS(strict) + Vite + PWA，**唯一状态所有者 `src/AppContext.tsx`**，**唯一调度引擎 `src/lib/planner.ts`**（date-level，逐日贪心+评分函数），一切变更走 `prepare* → adjustment → generateSchedulingProposals → Proposal 预览 → Apply → PlanVersion` 闭环。

## 2. Upstream-First 铁律（必读 `docs/customization/UPSTREAM_STRATEGY.md`）

- **分支**：`upstream/main`（只读）→ `main`（镜像 upstream，永不接受来自 `custom/main` 的合并）→ `custom/main`（聚合自定义）→ `feature/*`（短期）。需贡献回官方时从 `main` 切 `upstream-fix/*` 单独 PR。
- **日常同步**：`git fetch upstream` → `main` 上 `git merge --ff-only upstream/main` → `git push origin main` → `custom/main` 上 `git merge main`。
- **修改优先级**：1) 现有 extension point 2) 新增独立 module 3) composition/wrapper 4) adapter 5) feature flag 6) 小范围改 upstream 7) 最后才重构。**禁止**全量 format / 大范围 rename / 换框架/状态库/数据库 / 重写 `planner.ts` / 把官方组件全部重做。
- **新增文件 > 修改旧文件 > 重构旧文件**；改旧文件时保持最小 diff，不顺手优化相邻代码。

## 3. 关键扩展点（不改核心即可扩展）

| 扩展点 | 位置 | 用途 |
|---|---|---|
| `PlanIntentParser` | `src/lib/intent.ts:9` | **AI 语义层唯一入口**（已预留），`parseUserIntent(input, context): Promise<PlanChangeEventDraft>` |
| `adjustmentPolicyForEvent` | `src/lib/adjustment.ts:16` | 新增 `PlanChangeEvent` 类型自动兜底 `recommended` |
| `GenerateProposalOptions` / `ReplanRequest` | `src/lib/planner.ts:2438` / `src/types.ts:801` | 调度行为传参 |
| `event.metadata` 自由键 | `src/types.ts:305` | 新 feature 参数透传 |
| 新增独立 service | `src/services/ai/**` `src/lib/planning-health.ts` | 零冲突 |

## 4. AI 约束（必读 `docs/customization/ROADMAP.md P1-1`）

- AI **不直接生成日程、不直接写 DB、不直接提交正式计划**；输出必须是 `PlanChangeEventDraft` 经 Zod 校验后进入现有 dispatcher。
- Phase 1 **仅支持现有模型可表达的 intent**（任务创建/可用时间变更/目标期限变更/优先级/执行差异重排）。对"第 5 章掌握 30%"类 Topic/Mastery 输入，仅识别并告知用户"暂不保存"，以 transient 方式处理，**禁止为 demo 而扩展 `types.ts`**。
- Provider 第一版仅 `OpenAICompatibleProvider`；Ollama / explainer 后加。Key 安全见 `UPSTREAM_STRATEGY.md §6`：BYOK 存浏览器本机存储（当前实现为 localStorage）需提示非加密安全存储，服务端 Key 必须走 Cloudflare Worker Secret。

## 5. 术语

- 统一用 **计划执行日 / 截止日期**，不硬翻 Do date / Due date。
- Planning Health 回答 3 问：来不来得及 / 风险在哪里 / 下一步做什么（derived data，scheduler 零修改）。

## 6. 禁止事项

- 直接重写 UI / 接入 AI 平台 / 迁移数据模型 / 替换 scheduler / 重做 navigation / 换数据库 / 加大量新依赖。
- 把 Progressive Disclosure 中 Today 与 Proposal 改动合为一个 commit（必须拆分）。
- 为追求 `npm test` 全绿而顺手修上游 baseline 失败用例（见 `STATUS.md` 测试标准）。

## 7. 验证标准（Phase 1 起）

- `npm run typecheck && npm run build` 通过
- `npm test` **不得新增失败；已知 baseline 允许保持 1 个失败**（`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下`）
- 手动走通：新建批次→AI/正则解析→预览→冲突决策→应用→Today 执行→复盘→Planning Health 可见
- AI 关闭时全流程与 Phase 0 一致
- `git diff main..custom/main --stat` 仅含预期文件

## 8. 文档索引

- 基线审计：`docs/customization/BASELINE_AUDIT.md`
- 参考分析：`docs/customization/REFERENCE_ANALYSIS.md`
- 同步策略：`docs/customization/UPSTREAM_STRATEGY.md`
- 路线图：`docs/customization/ROADMAP.md`
- 决策记录：`DECISIONS.md`
- 上游差异：`UPSTREAM_DELTA.md`
- 当前状态：`STATUS.md`

## 9. 常用命令

```bash
npm run typecheck
npm test                          # 102/103 为当前基线（含 1 个上游失败 + 6 个 AI 单测）
npm run build
npm run dev -- --port 5199
git fetch upstream && git log --oneline upstream/main ^main   # 查看上游新增
```
