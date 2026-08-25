# ROADMAP — 克制型路线图与 Phase 1 提案（Revised 2026-08-25）

> 原则：高收益、小改动、低 upstream 冲突、不破坏现有 scheduler、明显改善实际使用体验。
> 每项均含：用户问题 / 为什么需要 / 最小实现 / 涉及文件 / 是否改 upstream 核心 / upstream 冲突风险 / 实现风险。
> 排序不代表执行顺序；Phase 1 仅选最多 3 项（见文末）。
> 本版已纳入 review 修正：Do date 术语白话化、AI 能力边界收敛、Hash 降级、Planning Health 提前、测试标准修正。

---

## P0 — 必须解决（不做会持续损害核心体验）

### P0-1 · Today 信息层级与通知收敛（Progressive Disclosure 第一刀）

- **用户问题**：Today 页 hero+3 横幅+4 指标+警示+下一项建议把任务列表推到三屏外；"N 个问题需处理"一键直开 7 卡中枢，信号轻但响应重（`App.tsx:1600-1602` + `AdjustmentIntentDialog.tsx:43-63`）。首屏无法一眼回答"我今天该做什么"。
- **为什么需要**：Today 是最高频页面；首屏信息密度直接决定核心任务可得性，移动端尤为严重。
- **最小实现**：
  - 三横幅**默认折叠成一条摘要，不消失、不可随意 dismiss**（严重问题被关闭会导致遗忘）：例如 `⚠️ 3 项计划需要处理 · 1 项即将逾期 [查看]`，点 [查看] 才展开详情。保留"去排期/去复盘"入口但收进展开态。
  - 顶栏"计划有变化/N 个问题"先弹轻量问题摘要菜单（列出 `analyzePlan` 的 danger issues 标题+数量），再按需进入 `AdjustmentIntentDialog` 的对应子表单
  - `AdjustmentIntentDialog` 修复"每次打开重置子表单"（`useEffect :139-160` 仅首次初始化）
  - 文案层统一为 **计划执行日 / 截止日期**（不硬翻 Do date / Due date 营销术语）
- **涉及文件**：`src/App.tsx`（Today 段 :1591-1618 + 顶栏 :1140，约 30-50 行）、`src/components/AdjustmentIntentDialog.tsx`（约 10 行）、文案常量
- **是否改 upstream 核心**：否（UI 层）
- **upstream 冲突风险**：低（Today 与顶栏是 upstream 活跃区，但改动为小范围条件渲染与文案）
- **实现风险**：低
- **Commit 约束**：Today 与 Proposal 分独立 commit，不合为一个 feature（ProposalDialog 为高风险文件，需单独 review）

### P0-2 · 冲突决策与方案预览的渐进披露

- **用户问题**：`ProposalDialog` 主按钮文案随状态变 7 种（`:192-206`），用户难预期点击结果；每问题的 8 种处置平铺，认知负荷高。
- **为什么需要**：Proposal 是所有变更的统一出口；不可预期会导致用户不敢点"应用"。
- **最小实现**：
  - 主按钮固定为"应用方案"，上方加一行状态说明（前置条件/阻塞原因）
  - 冲突处置分层：首层仅"接受一次豁免 / 让系统另找日期 / 保持原位 / 暂不安排"4 项；`unlock-and-move/change-goal/change-capacity` 收进"更多"二级
  - 文案采用 Vale 式"点名对象+双方时段+后果"模板
- **涉及文件**：`src/components/ProposalDialog.tsx`（约 40-60 行）、`src/lib/conflicts.ts`（文案常量，可选）
- **是否改 upstream 核心**：否
- **upstream 冲突风险**：中（ProposalDialog 是高频变更文件，但改动集中在渲染分支与文案）
- **实现风险**：低
- **Commit 约束**：与 P0-1 分离，独立 commit/PR

---

## P1 — 明显改善（高 ROI，低-中风险）

### P1-1 · Minimal AI Intent Vertical Slice（最小可工作的 AI 闭环）

- **用户问题**：现有 NL 录入是正则规则（`src/lib/intake.ts:freeformDraft`），无法理解"数学卷 5 套每套一小时周五前做完 / 明天没空 / 把化学目标改到下周四 / 这项任务优先一点 / 今天没完成帮我重排"这类自然语言；但 AI 绝不能直接生成日程，且当前领域模型**没有 Topic/Mastery**。
- **为什么需要**：验证 `src/lib/intent.ts:9 PlanIntentParser` 预留扩展缝是否真的可用；打通"自然语言 → 结构化意图 → 调度引擎 → 候选方案 → 用户确认"链路的**第一条真实路径**，比先搭大平台更重要。且 `BASELINE_AUDIT.md §3.3` 已证明当前模型足以表达上述 5 类 intent，无需扩 schema。
- **能力边界（必须遵守）**：
  - ✅ 允许：上述 5 类可直接映射为现有 `PlanChangeEventDraft` 的 intent（任务创建/可用时间变更/目标期限变更/优先级/执行差异重排）
  - ⚠️ 识别但不落地：如"第 5 章掌握 30% / 第 6 章完全不会"，允许 AI 识别并**明确告知用户"当前系统暂不保存掌握度"**，或作为不进入 scheduler 的 transient context 透传，不写入 `types.ts`。**禁止为了一句漂亮的 demo 而偷偷扩展 `types.ts`**。
  - 等未来正式决定做 Topic/Mastery 后再接入。
- **最小实现（拒绝提前搭平台）**：
  ```
  AIProvider interface
    → OpenAICompatibleProvider（仅此一个 Provider，Ollama 后加）
    → PlanIntentParser（prompt 构造 → 结构化输出 → Zod 校验 → 失败回退现有正则解析）
    → 现有 Proposal 流程（prepare → adjustment → generateSchedulingProposals → Preview → Apply）
  ```
  - 新增 `src/services/ai/provider.ts`（`AIProvider` 接口 + `OpenAICompatibleProvider` 单实现）
  - 新增 `src/services/ai/intent-parser.ts`（实现 `PlanIntentParser`，输出约束为 zod schema，非自由文本日程）
  - 可选新增 `src/services/ai/config.ts`（BYOK 配置持久化，见 `UPSTREAM_STRATEGY.md §6` 安全边界）
  - **不做**：`OllamaProvider`、`explainer.ts`、多 Provider 抽象平台、400 行框架。Ollama 与 explainer 等验证第一条链路跑稳后再加。
  - Settings 新增"AI 配置"折叠区（默认收起，可完全关闭；AI 不可用时原系统 100% 工作）
  - 约束：AI 不直接写 DB、不直接提交正式计划、不依赖单一 Provider、可完全关闭
- **涉及文件**：新增 `src/services/ai/**`（2-3 文件，约 120-180 行）；`src/lib/intent.ts` 不改（仅实现接口）；`src/App.tsx` Settings 区约 15 行
- **是否改 upstream 核心**：否（全新目录 + 接口实现）
- **upstream 冲突风险**：极低（新增文件零冲突）
- **实现风险**：中（prompt/schema 需迭代，但链路本身短、可单测验证）

### P1-2 · Planning Health（轻量合并 Readiness + Cushion）

- **用户问题**：系统很会回答"任务排在哪里"，但不会直观回答"照这个速度我来不来得及"。
- **为什么需要**：`BASELINE_AUDIT.md §4.1/§6` 已证明现有数据（`capacity/estimatedMinutes/GoalProgress.expectedCompletion/latestRisk`）足以做此判断，无需 AI、无需改 scheduler、无需改 schema。且用户价值高于 Hash Router。
- **最小实现**：**不必做成两个大型模块**，合成一个 `Planning Health`，只回答 3 个问题：
  1. 来不来得及（`sum(capacity) - sum(estimatedMinutes of unfinished)` 对未来 N 天默认 14 天的三档：富余/紧张/超载）
  2. 风险在哪里（阈值 Risk + 人话 `reason`，如"Calculus · 5 天 尚需 6h20m / 可用 4h30m / 缺口 1h50m"）
  3. 下一步做什么（`pickNextAction` 阶梯）
  - 全部 **derived data**，`scheduler` 零修改。新增 `src/lib/planning-health.ts`（<150 行，合并原 `readiness.ts` + `cushion.ts` 设想），在 Today 顶部以 1 行预警条 + 1 张卡呈现，附 [调整计划] 入口。
- **涉及文件**：新增 `src/lib/planning-health.ts`；`src/App.tsx` Today 段约 20 行
- **是否改 upstream 核心**：否（纯计算旁路）
- **upstream 冲突风险**：极低
- **实现风险**：低

### P1-3 · 体验细节补齐（Alert 统一 + 空态引导 + 保存语义一致）

- **用户问题**：`alert/confirm` 原生弹窗破坏视觉语言（`IntakePage.tsx:195,285` 等）；ReviewDialog 单弹窗 6 区块把核心决策下推；设置页部分参数即时生效、部分走预览，语义不一致。
- **为什么需要**：低成本显著提升精致感与可预期性。
- **最小实现**：`alert/confirm` 替换为已有 `Modal` + toast；ReviewDialog 时长建议/图表降为二级入口；设置即时参数加统一"已保存"toast。
- **涉及文件**：`src/components/IntakePage.tsx`、`src/components/ReviewDialog.tsx`、`src/App.tsx` Settings 段
- **是否改 upstream 核心**：否
- **upstream 冲突风险**：中（IntakePage/ReviewDialog 为中等活跃区）
- **实现风险**：低

---

## P2 — 有价值但以后再做（需更多设计或前置）

### P2-1 · 基础导航可用性（Hash 路由，页面级）

- **用户问题**：`page` 为纯内存 `useState`（`App.tsx:98`），浏览器后退直接退出应用。
- **为什么后移**：与"能否更好规划学习"相比，非核心价值；且 `Hash + pushState + modal + popstate` 看似 80 行，实则边界极多（hash 与 modal state 同步、后退关 modal 还是换 page、刷新后 modal 所需数据缺失、Proposal 进行中后退、history stack 膨胀等）；大部分弹窗依赖内存对象，光把名字放 URL 不等于 deep link。
- **最小实现（若做）**：第一版**只做页面级** `#today / #calendar / #tasks / #settings` 的后退与刷新，不做 modal history。新增 `src/lib/hash-router.ts`（<40 行），`App.tsx` 仅在 `setPage` 处接入。
- **涉及文件**：新增 `src/lib/hash-router.ts`；`src/App.tsx` 小改
- **是否改 upstream 核心**：否
- **upstream 冲突风险**：低
- **实现风险**：中（若含 modal 则高；页面级则低）

### P2-2 · Time-block 二阶段分配器（date → 具体时间段）

- **用户问题**：想要"17:00–18:00 化学"这类具体时间块；现有引擎仅 date-level。
- **为什么需要**：解锁 GCal timed 推送、更精细的执行指导。
- **最小实现**：不改 `planner.ts`；新增 `src/lib/time-blocks.ts`：输入 `(assignmentId, scheduledDate, estimatedMinutes)` + `availability windows`，输出 `start/end` 旁路表；ICS 从 `VALUE=DATE` 升级为 `DTSTART:YYYYMMDDTHHMMSS`。
- **涉及文件**：新增 `src/lib/time-blocks.ts` + `src/lib/exports.ts` 小改
- **是否改 upstream 核心**：否（旁路）
- **upstream 冲突风险**：低
- **实现风险**：中

### P2-3 · Google Calendar Timed 推送（DegreeFlow 式幂等）

- 依赖 P2-2；`extendedProperties.private.study_planner_block_id` 幂等键；PATCH→404→POST。
- **涉及文件**：新增 `src/lib/google-calendar.ts`；`src/lib/supabase.ts`（token 存储）

### P2-4 · Topic 标签（最小模型扩展）

- **用户问题**：TaskGroup 的数量拆分无法表达"第 5 章不熟"这类主题级 mastery。
- **最小实现**：`TaskGroup` 加可选 `topicTags?: string[]` + `topicMastery?: Record<string, 0|1|2>`（UI metadata，scheduler 不感知）。
- **涉及文件**：`src/types.ts`（可选字段）、`src/components/TaskGroupDialog.tsx`
- **是否改 upstream 核心**：是（但可选字段前向兼容）
- **upstream 冲突风险**：中
- **实现风险**：低
- **前置**：需先验证 Planning Health 与 Minimal AI Slice 的价值，再决定是否扩模型

### P2-5 · Syllabus AI 抽取（复用 Intake 管道）

- 依赖 P1-1 的 provider 层；输入 PDF 文本→结构化 `TaskGroupDraft[]`→仍经可编辑预览→加入 IntakeBatch。不改调度。

---

## Reject / Not Now（明确不做）

| 项 | 拒绝理由 |
|---|---|
| 重写/替换调度引擎为 time-block 核心 | 违背"保留优秀调度内核"原则；upstream 维护成本极高 |
| 引入完整 Course→Unit→Topic→Mastery→Grade 层级 | 与 Goal+TaskGroup 重复；造成迁移与同步负担；Planning Health 已可纯计算得到 |
| 引入 FullCalendar 重写月历 / 宣传式 drag & drop | 与 date-level 引擎双轨冲突；Vale 实际也未实现日历拖拽 |
| 复制 StudyOS 单文件架构 / 明文 key 存储 | 安全与可维护性差；已有更优 React+TS 结构 |
| 全项目重排 format / 大范围 rename / 换状态库/数据库 | 禁止的无意义漂移（`UPSTREAM_STRATEGY.md §4`） |
| 把 AI 做成硬依赖（无 AI 不可用） | 违背"AI 是 optional enhancement"原则 |
| 为一句漂亮的自然语言演示而扩展 `types.ts` | 破坏最小侵入原则；Topic/Mastery 未定前以 transient 方式处理 |
| 一次性搭建多 Provider AI 平台（Ollama+explainer 等） | 提前抽象；应先打通单 Provider 垂直链路 |
| GSAP 粒子/3D Galaxy 等装饰动效 | 对规划类产品 ROI 低 |

---

## Phase 1 提案（最多 3 项，需审核后才进入开发）

> 按 review 修正后的顺序：好懂 → 接上 AI 闭环 → 回答来不来得及。Hash Router 已移出 Phase 1。

### Phase 1-1 · 把现有产品变得好懂（Progressive Disclosure）

- **做什么**：Today 默认折叠的单条摘要（不消失）+ 顶栏轻量问题摘要菜单 + Proposal 主按钮与冲突分层 + 术语统一为 计划执行日/截止日期
- **为什么选它**：用户每次打开都能感知；改动集中在渲染层；是后续所有体验优化的地基；符合"系统适应用户"目标
- **不做什么**：不改任何调度逻辑与数据模型；不做可随意 dismiss 严重问题的关闭按钮
- **涉及文件**：`src/App.tsx`、`src/components/AdjustmentIntentDialog.tsx`、`src/components/ProposalDialog.tsx`、`src/lib/conflicts.ts`（文案）
- **Commit 拆分**：至少 2 个独立 commit — `feat(today): collapse notifications into summary` 与 `feat(proposal): stabilize primary action and tier conflict resolutions`，分别 review
- **upstream 冲突风险**：低-中；**实现风险**：低；**工作量**：约 1-2 天
- **验证**：Today 首屏任务列表可见性、移动端不再三屏外、摘要不可消失、Proposal 主按钮可预期性

### Phase 1-2 · 让 AI 真正接上一个最小闭环（Minimal AI Intent Vertical Slice）

- **做什么**：`AIProvider interface → OpenAICompatibleProvider（单实现） → PlanIntentParser → Zod validation → 现有正则 fallback → 现有 Proposal 流程`。仅支持现有模型可表达的 intent；对 Topic/Mastery 类输入识别后告知"暂不保存"并以 transient 方式处理
- **为什么选它**：`src/lib/intent.ts:9` 已预留扩展缝，打通第一条真实路径比搭平台重要；完全可选、可关闭、AI 不可用时 100% 回退
- **不做什么**：不做 `OllamaProvider`、不做 `explainer.ts`、不做多 Provider 平台、不扩 `types.ts`、不直接生成日程/写 DB
- **涉及文件**：新增 `src/services/ai/provider.ts`、`src/services/ai/intent-parser.ts`（可选 `config.ts`）；`src/App.tsx` Settings 区约 15 行
- **upstream 冲突风险**：极低（新增文件零冲突）；**实现风险**：中（prompt/schema 需迭代，但链路短、可单测）
- **验证**：`PlanIntentParser` 单测（5 类 intent 的自然语言→`PlanChangeEventDraft` 结构化 + mastery 输入的 transient 提示）、provider 错误教学文案、关闭 AI 后全流程回归

### Phase 1-3 · 让系统开始回答"我到底来不来得及"（Planning Health）

- **做什么**：新增 `src/lib/planning-health.ts`（合并 Readiness+Cushion），在 Today 顶部以 1 行预警条 + 1 张卡呈现，回答 3 问：来不来得及 / 风险在哪里 / 下一步做什么；附 [调整计划] 入口
- **为什么选它**：把产品从"自动排 Todo"变为"学习规划工具"的关键一步；零模型改动、零调度改动、纯 derived data；用户价值高于 Hash Router
- **不做什么**：不做两个独立大型模块；不改 `planner.ts`；不引入新依赖
- **涉及文件**：新增 `src/lib/planning-health.ts`；`src/App.tsx` Today 段约 20 行
- **upstream 冲突风险**：极低；**实现风险**：低；**工作量**：约 0.5-1 天
- **验证**：Today 展示 Chemistry/Calculus 等目标的富余/缺口计算、风险人话 reason、下一步行动建议；数据均为 derived，无持久化副作用

### Phase 1 非目标（明确排除）

- 不做 Hash Router（含 modal history 的完整方案），页面级 Hash 延后至 P2-1
- 不做 Time-block 分配器（P2-2）与 GCal 同步（P2-3）
- 不做 Topic/Mastery 模型扩展（P2-4），mastery 输入仅 transient
- 不做 `OllamaProvider` / `explainer.ts` / 多 Provider 平台
- 不改 `src/lib/planner.ts` 任何算法行
- 不引入新的重型依赖

### Phase 1 完成标准

- [ ] `npm run typecheck && npm run build` 通过
- [ ] `npm test` **不得新增失败；已知 upstream baseline 允许保持 1 个失败**（`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下`，`BASELINE_AUDIT.md §0`）。除非专门决定修复上游 bug，否则不得为追求绿灯而顺手改上游逻辑。
- [ ] 手动走通：新建批次→AI/正则解析→生成预览→冲突决策→应用→Today 执行→复盘→修复→Planning Health 预警可见
- [ ] AI 关闭时全流程与 Phase 0 一致（回归验证）
- [ ] `git diff main..custom/main --stat` 仅含预期文件（Today/Proposal 小改 + `src/services/ai/**` 2-3 文件 + `src/lib/planning-health.ts`）
- [ ] 每个 Phase 1 子项为独立 commit，commit message 含 `Upstream-risk` 标注

