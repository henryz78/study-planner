# BASELINE_AUDIT — Study Planner 现状基线审计（Phase 0）

> 审计对象：`yhwlwl/study-planner` @ `main` = `4a28663`（v0.9.3）
> 审计日期：2026-08-25。**代码为唯一事实来源**；README 与代码不一致处已单独标注。
> 本文档只记录现状，不做任何修改。

---

## 0. 运行验证结果（本机实测）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `npm install` | ✅ 507 packages |
| 类型检查 | `npm run typecheck` | ✅ 通过 |
| 单元测试 | `npm test`（vitest） | ⚠️ **96/97 通过，1 个失败**（上游已存在问题，见 §7） |
| 生产构建 | `npm run build` | ✅ 成功（PWA precache 21 entries） |
| Dev server | `npm run dev` | ✅ HTTP 200 |

失败的测试：`tests/long-task-settings.test.ts > 放宽为学习日每天 4 个长任务后全部排下（10x4=40 >= 21）`
——断言 `result.infeasible === false` 但得到 `true`。该用例与最近一次提交 `fcbd7ef`（长任务上限可配置）相关，
属 **upstream 自身的回归/脆弱测试**，非本地环境问题。Phase 0 不修复，仅记录。

---

## 1. 技术栈与工程形态

- React 18 + TypeScript(strict) + Vite 7 + PWA(vite-plugin-pwa)
- 状态：**无外部状态库**。`src/AppContext.tsx`（约 93KB）是唯一状态所有者（React Context + useReducer 式 action 函数）
- 持久化：IndexedDB（`idb`）按 namespace 分空间；可选 Supabase 云同步
- 调度计算：纯函数式 `src/lib/planner.ts`（约 163KB），重计算在 Web Worker 中进行
- 校验：Zod ingress schema（`src/lib/state-schema.ts`）；测试：Vitest + fast-check + axe-core
- 无路由库：页面切换是 `useState<Page>`，无 hash/history 路由

目录形态非常扁平：`src/lib`（领域逻辑）、`src/components`（页面与弹窗）、`src/workers`、`tests/`、`scripts/`（运行级验证脚本）。
**注意：`src/App.tsx` 约 256KB / 2554 行，包含 Today/Calendar/Tasks/Settings 四个页面的内联实现**，是最大的单点。

---

## 2. Product Map（产品地图）

### 2.1 导航

- `Page = 'today' | 'calendar' | 'tasks' | 'intake' | 'goals' | 'stats' | 'export' | 'feedback' | 'guide' | 'settings' | 'timer'`（App.tsx:62）
- 侧边栏 navItems 10 项（App.tsx:75-86）；timer 不在侧边栏，从任务卡「开始专注」进入且独立全屏渲染
- 移动端 ≤760px：侧边栏变汉堡抽屉
- **无 URL 路由**：浏览器后退直接退出应用；弹窗不可深链（仅 sessionStorage 的 recovery 跳转）

### 2.2 页面 × 主要内容

| 页面 | 内容摘要 | 关键入口 |
|---|---|---|
| Today 今日 | hero(日期+日类型+摘要句+操作排) → 横幅×3(待排期批次/复盘提醒/过去未完成) → 4 格指标(原计划/实际/剩余/负载÷容量) → 风险警示 → 下一项建议+开始专注 → 任务列表 | 添加任务、批量顺延、结束今天并复盘 |
| Calendar 月历 | 月/周视图、日期类型/缓冲日徽章、超载配色、溢出浮层、逐日设置抽屉、任务详情 Drawer、导出 PNG/PDF | 点击日期、拖拽（移动端为长按+点目标日） |
| Tasks 任务 | 收件箱汇总「待处理」、筛选 tab、搜索、任务组卡片列表 | 编辑(TaskGroupDialog)、换组(AssignmentGroupChangeDialog) |
| Intake 录入 | setup 步骤条(1-4)、批次列表、批次明细表、自然语言/粘贴/CSV/XLSX 导入、「生成排期预览」 | 新建批次、导入 |
| Goals 目标 | 目标列表 + GoalDialog（期限+完成条件 all/percentage/count + 关联任务组） | 新建/编辑目标 |
| Stats 统计 | KPI + 图表 + 热力图 + 「打开重排」入口 | onOpenReplan → AdjustmentIntentDialog |
| Export 导出 | PNG/SVG/ICS/CSV/JSON/打印报告 | — |
| Feedback 反馈 | 提交/我的反馈/管理（Supabase 独立表+截图桶） | — |
| Guide 教程 | 教程说明页 + 开始教程按钮 | TutorialSession（28 步） |
| Settings 设置 | 见 §5.3 | — |
| Timer 专注 | 全屏计时页 | 任务卡进入 |

### 2.3 弹窗清单与复杂度

| 弹窗 | 触发场景 | 复杂度 |
|---|---|---|
| AdjustmentIntentDialog | 顶栏「N 个问题需处理」/统计重排/月历调整 | 中枢：7 张动作卡 + 子表单最多 ~12 控件 |
| ProposalDialog | 一切计划变更的统一确认 | **最复杂**：方案卡 + 8 指标 + 7 折叠明细 + 冲突决策面板(每问题最多 8 种处置) + 逐移动微调 |
| TaskGroupDialog | 创建/编辑任务组 | ≈15 控件（最重表单） |
| ReviewDialog | 结束今天并复盘 | 英雄环+时间对比+6 指标按钮+逐任务顺延+时长建议+6 图表 |
| BulkMoveCenterDialog / GoalDeadlineDialog / SingleTaskDialog / AddTaskDialog / AssignmentGroupChangeDialog | 各自对应动作 | 轻-中 |
| CalendarConstraintManager | 设置页嵌入 | 工作日模板+约束 CRUD |
| HistoryDiffDialog | 设置·旧版恢复记录·查看差异 | 只读 diff |
| **ReplanDialog** | ⚠️ **死代码**：656 行、无任何 import 引用 | 与 ProposalDialog 双轨漂移风险 |

### 2.4 用户流（主流程）

```
首次进入 → 游客演示数据(buildGuestDemoState, 12 组≈168 项任务) 或空白态(自动跳 Intake)
  → 教程邀请 Modal（直接开始 / 体验教程28步）
建档：新建批次 → 录入(NL/粘贴/表格/表单) → [可选:建目标] → 设置确认可用时间 → 「生成排期预览」
  → ProposalDialog 预览/微调/冲突决策 → 应用 → 正式计划
日常：Today 执行(完成/部分完成/计时) → 复盘(ReviewDialog) → 计划变化(AdjustmentIntentDialog)
  → 方案生成(worker) → 预览/冲突决策 → 应用 → PlanVersion 自动保存
```

---

## 3. Domain Model（数据模型）

来源：`src/types.ts`（SCHEMA_VERSION=11）、`src/lib/state-schema.ts`（zod ingress）。

### 3.1 核心实体关系

```
Goal ──linkedTaskGroupIds──▶ TaskGroup ──1:N──▶ Assignment（真正被排期的"学习项"）
 │                              │                  ├─ timeEntries[]（TimeEntry，执行账本）
 │completionConditions          ├─ prerequisiteGroupIds（DAG 依赖）
 │(all/percentage/count)        └─ dailyMax/activityType/highIntensity/allowSplit...
 ▼
CalendarConstraint（日期级容量约束 5 类）      DayConfig（日期类型 regular/study/travel/custom + availableMinutes）
IntakeBatch ──taskGroups:IntakeTaskGroupDraft[]──应用后转为──▶ TaskGroup + Assignment + (可选)Goal
PlanChangeEvent（16 类事件，一切变更的入口）──▶ SchedulingProposal ──apply──▶ PlanVersion（≤10，localOnly）
ReviewRecord（每日复盘快照 ≤120）/ DailyPlanBaseline（当日原计划捕获）/ AcceptedConstraintException（≤100）
ReplanHistoryEntry / ConflictBackup（localOnly，不上云）
```

### 3.2 关键字段说明

- **Assignment** 是调度原子单位：`scheduledDate`(date-level，**无 start/end time**)、`estimatedMinutes/actualMinutes/progress/status(todo|partial|done)`、`scheduleSource(system|manual|carryover|replan|import|recurring|migration|template)`、`intentStrength(normal|manual|locked)`、`statusHistory[]`（append-only，支持历史重放）
- **TaskGroup** 表达批量规则：subject/priority/unitMinutes/quantity/dailyMax/activityType/prerequisite/recurring/split
- **Goal**：desiredDate(软)+latestDate(硬)+completionConditions——已经能表达 deadline 驱动
- **CalendarConstraint**：unavailable/reduced-capacity/special-capacity/protected-buffer/note + capacityMinutes + protected
- **settings** 含大量调度参数（利用率目标、冻结天数、长任务阈值等），其中 v0.7 兼容字段仍在

### 3.3 与学术模型（DegreeFlow 对照）的差距评估

| DegreeFlow 概念 | 当前等价物 | 判定 |
|---|---|---|
| Course | TaskGroup.subject+title（弱） | ⚠️ 部分等价；课程=多任务组的分组维度缺失，但可用 subject 近似 |
| Exam | Goal.latestDate + fixedDate 任务 | ✅ 可表达，无需新实体 |
| Backlog/Topic | 无（TaskGroup→Assignment 是数量拆分，非主题拆分） | ❌ 缺失；但影响的是录入粒度而非 scheduler |
| Mastery/Readiness | progress per assignment；GoalProgress 已有 expectedCompletion/risk | ⚠️ Readiness/Momentum 指标可由现有数据**纯计算得出**，无需新模型 |
| Priority/Difficulty | priority(0-5)；difficulty 无 | difficulty 仅是评分输入，可后置为 TaskGroup 可选元数据 |
| Availability/Commitment | DayConfig + CalendarConstraint + recurring 任务 | ✅ 基本等价（缺"每周几几点到几点"的钟点级承诺，因引擎是 date-level） |
| Grade/GPA | 无 | Reject：超出 scope |

**结论：不需要为 DegreeFlow 式概念新增任何核心实体**。最必要的潜在扩展只有一个候选：
给 TaskGroup 加可选 `topicTags?: string[]`（纯 UI metadata，scheduler 不感知）——P2 再议。

---

## 4. Scheduling Pipeline（调度管线，代码级路径）

```
① 变更入口     AppContext.prepare* 系列（AppContext.tsx:548-1338）
               16 种 PlanChangeEvent；prepare 只产草稿态+事件，不改正式计划
② 协调决策     adjustmentPolicyForEvent(event)（lib/adjustment.ts:16-83）
               → validate-and-commit / recommended-preview / optional-optimization / exploratory-optimization
③ 方案生成     previewPreparedChange（planner.ts:2229，用户已定结果的精确校验）
               generateSchedulingProposals（planner.ts:2471）→ generateReplanBundle（planner.ts:1398，按 dataRevision LRU 缓存）
               重活入 proposal.worker.ts（App.tsx:957 起，可取消）
④ 预览/微调    ProposalDialog：movements/dateChanges/goalImpacts/structuralChanges/metrics
               reviseSchedulingProposal（planner.ts:2611，逐项改期全量重算）
⑤ 冲突决策     conflicts.ts conflictProfile 五类（absolute-blocker/protected-intent/waivable-rule/structural/warning）
               applyConflictDecisions（conflicts.ts:282）不直接提交——翻译成 fixedAssignmentIds/
               leaveUnscheduledIds/exceptions 后回流调度器重算
⑥ 应用         AppContext.applySchedulingProposal（AppContext.tsx:1339-1357）
               hydratePortableState 整体替换 state；例外转 AcceptedConstraintException；
               createVersionFromProposal 建 PlanVersion（versions.ts:47）
⑦ 持久化       saveLocalState（lib/db.ts:148，namespace 串行队列；core 与三大历史分键存储）
⑧ 云同步       preparePortableState（supabase.ts:74）剥离 replanHistory/conflictBackups/planVersions；
               revision 乐观并发，云端空时绝不静默上传游客数据
⑨ 执行反馈     finishAssignment/reopen/timeEntries（execution.ts append-only 账本 + statusHistory 重放）
⑩ Repair       DailyPlanBaseline 捕获当日原计划 → reviewDaySnapshot → prepareReviewCompletion
               （execution-difference 事件）→ 回到 ②
```

### 4.1 调度内核（planner.ts）

- **算法形态**：逐日贪心 + 评分函数 + 有界交换修复（48 次 swap 预算）。不是 CP/SAT。
- 候选识别 `identifyRepairCandidates`(:669)：未安排/滞留过去/越 goal 最晚日/超容量/超每日上限…
- 排序 `candidateItems`(:1074)：prerequisiteDepth → manual → partial → 最近期限 → 优先级 → hardRequired → 时长降序
- 评分 `candidateScore`(:567)：距离×moveWeight（preserve 240/rest 150/balanced 85/goal 35）+ manual ±18000/-25000 +
  越 goal 日惩罚 + 利用率二次罚（targetUtilization）+ 数量/科目占比/高负载连击/缓冲日倾向
- **四种 strategy = 同一引擎的不同 moveWeight+目标利用率**，非四套系统
- 硬约束 `validatePlacement`(:457-553)：plan-range/past-freeze/goal-latest/prerequisite/travel-day/date-protection/
  protected-buffer/buffer-long&high-intensity/today-closed/capacity/load-constraints/group-daily-max/活动限额
  （classical-study 4/day 等 defaultLimit :134-144）/long-task(study/light 两档)/high-intensity(2)
- 锁定与计时中任务全程排除；已接受例外「祖父化」只保既有占用

### 4.2 时间粒度判定（§12 审计项）

**结论：纯 date-level。**
- `Assignment.scheduledDate?: string`（types.ts:200），全仓库无 start/end time 字段
- 容量/负载均为「天×分钟」；ICS 导出为 `DTSTART;VALUE=DATE` 全天事件（exports.ts:419-420）
- Google Calendar 兼容性：目前只有**全天日程导出**，无 timed event，无 API 同步
- 未来若要 "17:00–18:00 化学"：**不必修改核心 scheduler**。可行路径是第二阶段 time-block allocator：
  以 engine 输出的 (assignmentId, scheduledDate, estimatedMinutes) 为输入，在独立的
  `date + availability windows` 上做装箱分配（输出 start/end 存于旁路表或 Assignment 可选字段），
  引擎本身零改动。属于 P2。

### 4.3 Extension Points（不改 upstream 即可扩展的位置）

| 扩展点 | 位置 | 说明 |
|---|---|---|
| **PlanIntentParser 接口** | lib/intent.ts:9-11 | **upstream 已预留 AI 解析缝！** `parseUserIntent(input, context): Promise<PlanChangeEventDraft>`；注释明示解析器只能返回事件草稿 |
| GenerateProposalOptions | planner.ts:2438-2450 | preferences/signal/acceptedExceptions/disableAutomaticExceptions… |
| generateReplanBundle strategies 参数 | planner.ts:1398 | 可传入任意策略子集 |
| ReplanRequest | types.ts:801-829 | loadConstraints/limitOverrides/allowProtectedDateAssignments/explanationLevel |
| event.metadata 自由键 | types.ts:305 | 新消费端读取即可 |
| adjustmentPolicyForEvent 分支 | adjustment.ts:16 | 未知事件兜底 recommended，天然前向兼容 |
| defaultLimit 活动限额表 | planner.ts:134-144 | 加一行即新增 activityType |
| Worker 消息契约 | workers/proposal.worker.ts:5-14 | 可透传 options |
| intake-batches.ts | 独立批次 CRUD | 注释明示不得触碰 assignments/events |

---

## 5. UX Audit（信息架构审计）

### A. 新用户第一次进入

- 游客默认载入**完整演示计划**（buildGuestDemoState：12 组 ≈168 项任务，setupProgress step=4），
  并弹出教程邀请 Modal（直接开始 / 体验教程）。「今天应该做什么」在演示数据下可以理解；
  但**演示数据与真实需求无关**，从演示到自己的第一份计划之间没有引导迁移。
- 真空白态：自动跳 Intake 页，顶部步骤条 1-4（任务清单→目标期限→可用时间→首次排期）。
- 30 秒理解测试：**部分通过**。今日视图有明确「下一项建议」，添加任务入口清晰；
  但「没完成怎么办」（顺延/复盘/修复三入口分散在横幅、任务卡菜单和调整中心）需要探索才能发现。
- 建第一份计划最小成本 ≈ **6 个动作跨 3 页**；走完整教程需 **28 步**（tutorial.ts TUTORIAL_STEPS）。

### B. Advanced Concepts 暴露分级（现状）

| 概念 | 现状暴露位置 | 建议 |
|---|---|---|
| scheduling strategy (preserve/balanced/goal/rest) | 减负/重排表单 + 方案卡标签；设置另有 sprint/balanced/relaxed **两套措辞** | 应只在方案预览中出现白话文案；统一措辞 |
| capacity overrides | 设置「高级排期参数」折叠区（默认收起✅）+ 月历逐日抽屉 | 维持折叠；月历入口保留（情境合理） |
| protected dates | 设置-日期约束、月历缓冲日徽章、可用时间表单 | 情境化出现 ✅，维持 |
| Plan Diff | ProposalDialog 折叠明细 | 默认折叠 ✅，维持 |
| conflict resolution | ProposalDialog 冲突面板 | 相关事件驱动 ✅，维持；但每问题 8 种处置应分层渐进 |
| PlanVersion/restore | 设置「恢复与维护」折叠区 | 过深：恢复入口应在「撤销/出问题时」可达，不只藏设置 |
| intentStrength/manual 徽章 | TaskCard「手动优先/已锁定」 | 一直可见但语义需 tooltip |
| AdjustmentIntentDialog 7 动作卡 | 顶栏「N 个问题」一键直达 | **信号轻响应重**：应先轻量列出问题摘要再选动作 |

### C. 具体 UX 问题清单（含最小修复方向）

1. **顶栏「N 个问题需处理」直开 7 卡中枢**（App.tsx:1140）→ 先弹轻量问题摘要菜单，直达子动作。
2. **Today 三横幅堆叠把任务列表推出首屏**（App.tsx:1600-1602）→ 合并为单一通知栈+计数角标。
3. **AdjustmentIntentDialog 每次打开重置全部子表单**（useEffect :139-160）→ 仅首次初始化。
4. **ProposalDialog 主按钮文案随状态变 7 种**（ProposalDialog.tsx:192-206）→ 固定「应用方案」+状态说明行。
5. **ReplanDialog 死代码 656 行**（无 import）→ 删除或标注 deprecated（减少 upstream merge 噪音需谨慎：删除会加大 merge 冲突，建议先标注）。
6. **无路由/后退**（page useState）→ navigate() 同步 location.hash + hashchange 监听（新增文件实现，App.tsx 内小改）。
7. **原生 alert/confirm 散布**（IntakePage.tsx:195,285; App.tsx:2478,2538）→ 复用已有 Modal 基建。
8. **TaskGroupDialog 创建态即暴露活动类型术语**（如「文言文默写（默认每天最多1篇）」）→ 高级区折叠+占位符白话化。
9. **ReviewDialog 单弹窗 6 区块**，复盘核心决策被图表下推 → 时长建议/图表降为二级入口。
10. **设置保存语义不一致**：多数参数即时生效，容量却走预览流 → 统一提示或统一通道。

### 设置页结构（App.tsx:2522-2547）

演示教程 / 计划基础 / 显示 / **高级排期参数(折叠)** / **恢复与维护(折叠)** / 数据与恢复 / 账号与同步 / 数据恢复中心。
高级概念基本已正确折叠——问题主要在**入口层级与流程内暴露**，不在设置页本身。

---

## 6. Persistence / Sync / Onboarding 补充

- 本地：namespace ∈ {guest, user:<uid>, tutorial}；core 态与 replanHistory/conflictBackups/planVersions 分键存
- 云端：每 user 一行 `study_snapshots(data JSONB)`；revision 乐观并发；RLS 按 user_id；
  版本历史**仅本机**（设置页有明示）
- Onboarding：seed.ts 提供 summer/demo/blank 三种模板 + tutorial 独立命名空间（锚定时钟，永不云同步）

## 7. 已知问题与技术债务

1. **上游失败测试 1 例**（long-task-settings 放宽上限用例，见 §0）——上游回归。
2. README 版本号停在 v0.9.0，package.json/constants.ts 均为 0.9.3（文档漂移）。
3. `ReplanDialog.tsx` 死代码（656 行）与现行 ProposalDialog 流程双轨。
4. App.tsx 巨石化（2554 行，含 4 个页面内联实现）；styles.css 约 287KB。
5. 无路由层；浏览器后退退出应用。
6. settings 中 v0.7 兼容字段（coreTargetDate/chemistryTargetDate/bufferDays/targetDate/dueDate）仍在模型中。
7. alert/confirm 原生弹窗与自有 Modal 体系并存。
8. 测试覆盖偏 lib 层（coverage 仅统计 src/lib/**）；App.tsx 大量 UI 逻辑无组件级测试（有 a11y 冒烟）。

## 8. 当前测试覆盖概览

- Vitest 19 文件 / 97 用例：执行账本、冲突阻塞分类、长任务阈值、supabase 协议(revision/回退/soft 归一)、
  录入批次隔离、依赖环检测、时钟注入、教程 checkpoint/竞态、a11y(axe)、PWA、modal、scroll-lock、移动端回归
- scripts/ 运行级验证：100/500/1000 任务调度性能基准(P50/P95)、录入 P95<100ms 且不污染正式计划、
  场景/调整/UI/效率审计、bundle 体积门禁、supabase RLS 冒烟
- `test:quality` = typecheck + vitest + 性能门禁 + build + bundle 检查

## 9. License

Study Planner：**AGPL-3.0-or-later**（LICENSE, Copyright (c) 2026 yhwlwl）。
我们的二次开发产物同样受 AGPL 约束（详见 REFERENCE_ANALYSIS.md §License）。
