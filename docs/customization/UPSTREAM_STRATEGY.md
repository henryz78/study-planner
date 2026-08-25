# UPSTREAM_STRATEGY — Upstream 同步与分支策略

> 目标：`main` 尽量作为 upstream 的镜像分支（mirrors）；自定义位于独立分支；feature 独立提交；upstream merge 时可明确区分官方变化与自定义变化。
> 适用于 fork 场景；当前本地已按本策略初始化（见 §1）。

---

## 1. 当前 Git 状态（2026-08-25 实测）

- 本地初始为空仓库（`On branch master / No commits yet`），已按 upstream-first 初始化：
  - `git remote add upstream https://github.com/yhwlwl/study-planner.git`
  - `git fetch upstream` → `git checkout -b main upstream/main`（`main` 镜像 `upstream/main @ 4a28663`）
- 理想的 fork 形态还差一步（可选，待你在 GitHub 上 fork 后补）：
  - `git remote add origin https://github.com/<you>/study-planner.git`
  - `git push -u origin main`
  - **措辞纠正**：执行 `git push -u origin main` 后，Git 的 branch upstream tracking 会指向 `origin/main`。
    一个 branch 不能在 Git 意义上同时 track `origin/main` 又 track `upstream/main`。
    因此本文用 **mirrors（镜像）** 而非 Git tracking 术语描述 `main` 与 `upstream/main` 的关系。
    日常只需 `fetch upstream → ff-only 更新 main → push origin/main` 即可保持镜像。

> **验证**：`git ls-remote https://github.com/yhwlwl/study-planner.git HEAD` → `4a28663`；`git log --oneline -5` 与 upstream 一致；`npm run typecheck/build` 通过。

---

## 2. 推荐 Branch Strategy（极简，不做复杂工程）

```
upstream/main  ───────────────────────────────────────────────►  (只读上游)

main           ─────●──●──●──●────────────────────────────────►  镜像 upstream/main（mirrors）
                   │ merge │ merge          单向 ↓
custom/main        ●──●──●──●──●──●──●───────────────────────►  聚合自定义（长期存在）
                   │\  │\  │\               永不合回 main
feature/ai-layer    ●  │  │  │  ─────────────────────────────►  短期 feature 分支
feature/progressive  ──●  │  │  ─────────────────────────────►
feature/health       ────●  │  ─────────────────────────────►

upstream 修复分支（需贡献回官方时）：
main ──● upstream-fix/xxx ──► PR → yhwlwl/study-planner（不经 custom/main）
```

### 规则

| 分支 | 用途 | 推送到 | 合并方向 |
|---|---|---|---|
| `upstream/main` | 官方只读 remote | — | — |
| `main` | **镜像分支（mirrors upstream/main）**；不直接在上面做自定义提交 | `origin/main`（镜像 upstream） | 只接受 `git fetch upstream` + `git merge --ff-only upstream/main`；**永不接受来自 `custom/main` 的合并** |
| `custom/main` | 自定义聚合分支；长期存在 | `origin/custom/main` | 从 `main` 合并而来（单向）；**永不合回 `main`**；`git diff main..custom/main` 即全部自定义 |
| `feature/*` | 单一 feature（如 `feature/ai-vertical-slice`） | `origin/feature/*` | 从 `custom/main` 切出 → 完成后 squash/rebase 合并回 `custom/main` |
| `upstream-fix/*` | 需贡献回官方的 bugfix | `origin/upstream-fix/*` | **从 `main` 切出**，PR 直接发往 `yhwlwl/study-planner`，不经过 `custom/main`（避免夹带 AI/UI 改造） |

### 为什么这样分

- `main` 保持**可随时 `git diff upstream/main..main` 为空**（或仅含必要的 fork 配置如 `.github/workflows` 的 origin 调整），保证任何人都能一眼看出 upstream 至今的全部变化。**`main` 永远不接受来自 `custom/main` 的 PR/merge，方向永远是单向：`upstream/main → main → custom/main`**。
- `custom/main` 聚合自定义，便于一次性看"我们改了什么"（`git diff main..custom/main`）。
- `feature/*` 保证**一个 commit 只做一个逻辑修改**，避免大杂烩。
- 如需向上游贡献 bugfix，**从 `main` 切 `upstream-fix/*` 分支**单独提 PR，避免把 `custom/main` 上的 AI/UI 改造夹带进官方仓库。

### 替代简化方案（若团队只有 1-2 人）

可省略 `custom/main`，直接在 `feature/*` 上工作、完成后合并回 `main` 的自定义提交段（用 `git log upstream/main..main` 区分）。但长期维护建议保留 `custom/main`。

---

## 3. Upstream 同步操作手册

### 3.1 日常同步（每周或 upstream 有 release 时）

```bash
# 1. 更新 upstream 引用
git fetch upstream

# 2. 将官方变化合入 tracking 分支（在 main 上）
git checkout main
git merge --ff-only upstream/main   # 若 main 无自定义提交，可 ff；否则用 --no-ff 显式 merge commit
git push origin main

# 3. 将 tracking 分支合入自定义聚合分支
git checkout custom/main
git merge main          # 解决冲突（见 §4）
npm run typecheck && npm test && npm run build   # 验证
git push origin custom/main

# 4. 各 feature 分支 rebase 到最新 custom/main
git checkout feature/ai-layer-skeleton
git rebase custom/main
```

### 3.2 冲突解决原则

- 冲突标记中 `<<<<<<< HEAD` 为自定义，`>>>>>>> main` 为 upstream——**优先保留 upstream 的逻辑**，将自定义以最小包裹/适配层重新接入（见 §5 扩展点）。
- 解决后务必跑 `test:quality`（typecheck + vitest + build + bundle 门禁）。
- 若 upstream 重命名/移动了你修改过的文件，先接受 upstream 的新位置，再把你的改动搬过去（不要在解决冲突时同时做重命名）。

### 3.3 发布与 Tag

- 上游 tag 如 `v0.9.3` 会随 `fetch` 拉取；自定义发布用 `custom-v0.9.3-1` 形式，避免与上游 tag 命名冲突。

---

## 4. 如何降低 Merge Conflict（硬规则 + 软建议）

### 硬规则（必须遵守）

1. **禁止全项目重新 format / 大范围 rename / 无必要移动文件** —— 这会让每个文件都冲突。
2. **禁止无必要升级 dependencies / 更换框架/状态管理/数据库** —— lockfile 冲突极难处理。
3. **禁止重写 scheduler**（`src/lib/planner.ts`）—— 核心算法是 upstream 最高频变更区。
4. **禁止把官方组件全部重新实现** —— 用 composition/wrapper/adapter 包起来。

### 软建议（强烈建议）

- **新增文件 > 修改旧文件 > 重构旧文件**（优先级递减）。
- 修改旧文件时，**保持最小 diff**：只改必要行，不顺手"顺便优化"相邻代码；不改 import 顺序；不改未触及行的缩进。
- 样式：若需新增样式，**新增独立 css 文件**（如 `src/services/ai/ai.css`）而非在 `src/styles.css`（287KB 巨石）中大段插入。
- 提交粒度：**一个 commit 一个逻辑**，commit message 前缀 `feat:`/`fix:`/`chore:`，并在 body 中注明 `Upstream-risk: low/medium/high`（便于 review）。
- 避免在 `App.tsx` 顶部 import 区大段重排；新增 import 追加到末尾分组即可。

---

## 5. 哪些目录应该避免修改（按风险分级）

| 风险 | 路径 | 原因 | 替代做法 |
|---|---|---|---|
| 🔴 极高 | `src/lib/planner.ts` | 调度内核，upstream 最活跃 | 通过 `GenerateProposalOptions` / `ReplanRequest` / `adjustment.ts` 分支扩展；新增 `src/lib/cushion.ts` 等旁路计算 |
| 🔴 极高 | `src/types.ts` | 全项目类型基石 | 新增可选字段时用 `Partial` / 旁路表；避免重命名字段 |
| 🔴 极高 | `src/App.tsx` | 2554 行巨石，upstream 高频 | 新增页面用 `lazy(() => import('./components/NewPage'))` 独立文件；App.tsx 仅加 2-3 行路由/入口 |
| 🟠 高 | `src/AppContext.tsx` | 唯一状态所有者 | 新增 action 时以独立函数导出，通过 `prepare*` 模式接入；避免改写现有 prepare 逻辑 |
| 🟠 高 | `src/lib/db.ts` `src/lib/supabase.ts` | 持久化与云同步边界 | 新增数据尽量走独立 IndexedDB key 或 `event.metadata`，避免改 portable 结构 |
| 🟡 中 | `src/components/ProposalDialog.tsx` `src/components/AdjustmentIntentDialog.tsx` | 复杂弹窗 | 用 wrapper/条件分支增量修改；避免重写整个文件 |
| 🟢 低 | `src/lib/intent.ts` | 已预留扩展点（11 行） | **推荐首选扩展点**（见下） |
| 🟢 低 | `src/lib/adjustment.ts` | 策略协调层，分支式扩展 | 新增 `event.type` 分支风险低 |
| 🟢 低 | `src/workers/proposal.worker.ts` | 单一职责 worker | 可透传 options |
| 🟢 低 | 新增 `src/services/ai/**` `src/lib/cushion.ts` `src/lib/readiness.ts` | 全新文件 | **零冲突**（upstream 无此文件） |

### 推荐 Extension Points 清单（不改核心即可扩展）

详见 `BASELINE_AUDIT.md §4.3`，此处精简重申最有用的 5 个：

1. **`PlanIntentParser` (`src/lib/intent.ts:9`)** — AI 语义层唯一入口，新增 `src/services/ai/intent-parser.ts` 实现即可。
2. **`adjustmentPolicyForEvent` (`src/lib/adjustment.ts:16`)** — 新增 `PlanChangeEvent` 类型自动落入兜底 `recommended`，加分支即可支持新场景。
3. **`GenerateProposalOptions` / `ReplanRequest`** — 通过 options 传参改变调度行为，无需动引擎。
4. **`event.metadata` 自由键** — 新 feature 的参数透传通道。
5. **新增独立 service/module**（如 `src/services/ai/provider.ts`、`src/lib/readiness.ts`）— 零 upstream 冲突。

---

## 6. .gitignore / .env / 敏感信息与 AI Key 安全边界

- `.env` 已在 `.gitignore`；AI provider key 绝不以 `VITE_` 前缀暴露到浏览器构建产物。
- **IndexedDB 不是秘密保险箱**：同源页面 JavaScript、XSS、浏览器 DevTools 都可能访问 IndexedDB。因此文档与 UI 不得把"存在 IndexedDB"描述为"安全保存"。
- 需区分两种模式并在文档/UI 中明确提示：
  - **用户 BYOK（Bring Your Own Key）**：允许存在本机 IndexedDB，但必须提示"存储在浏览器本机，不代表加密安全存储；同源脚本与 DevTools 可访问"。
  - **服务端 API Key（我们自己的 Key）**：**绝对不能放前端**。如需提供官方 AI 能力，应走 `Frontend → Cloudflare Worker → AI API`，真正的 Key 放在 Cloudflare Secret（`wrangler secret put`）。前端仅持有指向 Worker 的 URL，不持有 Key。
- Phase 1 不一定立即实现 Worker，但 `docs/customization/ROADMAP.md` 与 AI 配置页文案必须把此边界写准确。
- 新增的 AI 配置页需明确提示 BYOK 的存储位置与风险，而非简单写"不会上传"。

---

## 7. 检查清单（每次 upstream merge 前后）

- [ ] `git fetch upstream && git log --oneline upstream/main ^main` 确认上游新增提交
- [ ] `main` 合并后 `npm run typecheck` 通过
- [ ] `custom/main` 合并后 `npm test`（关注 `long-task-settings` 等脆弱用例是否新增失败）
- [ ] `npm run build` 通过（含 PWA precache）
- [ ] 手动走一遍 Today→Calendar→Intake→Proposal 预览主流程
- [ ] `git diff main..custom/main --stat` 确认自定义文件清单符合预期（无意外大文件改动）

---

## 8. 附：当前已执行的初始化命令（可复现）

```bash
git remote add upstream https://github.com/yhwlwl/study-planner.git
git fetch upstream
git checkout -b main upstream/main   # main 镜像 upstream/main
# （待 fork 后）
# git remote add origin https://github.com/<you>/study-planner.git
# git push -u origin main            # 此后 git branch --show-current 的 upstream 指向 origin/main（Git 单 track 限制属正常）
# git checkout -b custom/main main
# git push -u origin custom/main

# 日常同步（单向）：
# git fetch upstream
# git checkout main && git merge --ff-only upstream/main && git push origin main
# git checkout custom/main && git merge main && npm run typecheck && npm test && npm run build && git push origin custom/main
```
