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

## 待决策（Phase 1 后）

- 是否引入 Topic/Mastery 最小模型扩展（`ROADMAP.md P2-4`）
- Time-block 二阶段分配器的 availability windows 输入形态
- 是否引入 Cloudflare Worker 作为 AI 代理
