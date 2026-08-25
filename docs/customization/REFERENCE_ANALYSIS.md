# REFERENCE_ANALYSIS — 参考项目对比与借鉴判定

> 范围：仅产品设计与架构思想参考。不复制第三方实现代码（见 §License）。
> 主项目唯一是 `yhwlwl/study-planner`；以下全部为 reference。
> 调研时间：2026-08-25，基于各仓库 `main`/默认分支浅克隆。

---

## 1. 能力对比矩阵（Capability Matrix）

重点不是谁功能多，而是：已拥有 / 缺失 / 值得借鉴 / 会造成 scope creep。

| 能力 | Study Planner (主项目) | StudyOS | DegreeFlow | Vale | Shovel (商业) |
|---|---|---|---|---|---|
| **核心调度** | ✅ 确定性 date-level 引擎，4 策略最小扰动 | ❌ 无调度引擎；Day Planner 是固定时长的轮转切块 | ⚠️ 简易 heuristic + commitments 避让 | ❌ 无调度（课表编排器） | ✅ 专有 Cushion 时间预算 + time-blocking |
| **Execution-aware / Repair** | ✅ 完整闭环（baseline+review+repair） | ❌ 仅本地计时统计 | ⚠️ 冲突块后移 + movedNotes | ❌ 无 | ⚠️ Cushion 实时反馈但非 execution-aware |
| **容量/约束感知** | ✅ 日容量、每日上限、长任务、高强度等 10+ 约束 | ❌ 无 | ✅ 每日 free slots + exam 优先级 | ⚠️ 冲突检测 | ✅ 可用时间 vs 所需时间全学期计算 |
| **Intent 保护** | ✅ locked/manual + protected dates | ❌ 无 | ⚠️ manuallyMoved 审计字段 | ❌ 无 | ❌ 无 |
| **多方案 + diff + 冲突解释** | ✅ Proposal / movements / goalImpacts / 5 类冲突 | ❌ 无 | ⚠️ Preview→Confirm + Impact 计数 | ❌ 仅冲突 toast | ❌ 无 |
| **AI 语义层** | ❌ 仅正则 NL 解析 | ✅ Provider 抽象 + Tutor/摘要/抽卡（有本地降级） | ❌ 仅正则 mock 解析 | ❌ 无 | ✅ AI syllabus 抽取 |
| **AI Provider 抽象** | ❌ 预留 `PlanIntentParser` 接口而已 | ✅ Ollama/OpenAI-compatible/NIM 统一 `callNIM(q,fallback)` | ❌ 无 | ❌ 无 | — |
| **Backlog/Topic/Mastery** | ⚠️ TaskGroup 数量拆分，无 Topic/Mastery | ⚠️ mastery slider + 3D galaxy | ✅ Theory/Exercise/Deliverable + Readiness/Risk | ❌ 无 | ❌ 无 |
| **Calendar / Time-block** | ⚠️ date-level 全天 ICS | ⚠️ 生成 HH:MM 时间线（假 AI） | ✅ 生成具体 start/end StudyBlock + GCal timed 推送 | ✅ FullCalendar 周视图（实际不可拖拽） | ✅ 具体 time-blocking 日历 |
| **GCal 集成** | ⚠️ 全天 ICS 导出（`exports.ts:419` `VALUE=DATE`） | ❌ 无 | ✅ OAuth 单向推送 timed event（幂等键） | ⚠️ ICS/CSV 导出 | ✅ Canvas/Brightspace/Moodle/GCal 同步 |
| **Syllabus 导入** | ✅ CSV/XLSX/粘贴/NL 正则 + 可编辑预览 | ❌ 无 | ❌ 无 | ✅ CSV/JSON + 模板 | ✅ PDF syllabus AI 抽取 |
| **UX 亮点** | 信息丰富但层级分散 | 零后端、单文件、AI 配置教学文案 | NL Preview→Confirm + movedNotes 差异说明 | tokens.css 设计系统 + 冲突提示文案规范 | Pile→Cushion→Timeline 叙事 |
| **离线/PWA** | ✅ IndexedDB + PWA | ✅ localStorage 零依赖 | ⚠️ localStorage→Supabase JSONB | ⚠️ localStorage mock | 付费 SaaS |

**一句话判定**：Study Planner 在调度内核与执行闭环上已远超全部参考项目；缺的是 **AI 语义层、Readiness/Risk 可解释指标、以及 calendar 的 timed 粒度** —— 而这三项都可在不触动内核的前提下补齐。

---

## 2. Reference A — StudyOS (`A2ROYAL/StudyOS`)

- 仓库形态：单文件 `index.html` (~1959 行) + `galaxy.html`，零依赖，`localStorage` 持久化。
- License 状态：**README 徽章自称 MIT，但仓库根目录无 `LICENSE` 文件**（见 §5）。视为**未明确授权**，不可复制代码。

### 重点研究发现

**AI Day Planner 并非 LLM 驱动**（`index.html:1246 genPlan()`）：按 `pomodoro 25/5 / deep 50/10 / balanced 40/10 / exam 60/10` 固定切块、轮转任务名生成 `blocks[{type,label,dur,start}]`。AI 仅做 `aiRefinePlan()` 追加 3 条 tips。命名有误导性。

**Provider 抽象**（`index.html:1619-1659`）：
- `localStorage['studyos_ai'] = {type:'ollama'|'openai'|'nim'|'none', key, base, model}`
- 统一 `callNIM(q, fallback)`：Ollama → `/api/chat`；OpenAI-compatible/NIM → `/chat/completions` + Bearer；`max_tokens:600, temperature:.6`；system prompt 统一
- CORS 失败做**面向用户的教学文案**（NIM 无 CORS 头→建议代理；Ollama 连不上→`OLLAMA_ORIGINS=*`；file://→建议 `python -m http.server`）

**Tutor/Notes/Flashcards**：Tutor 侧滑抽屉 + `localReply()` 正则算术回退；`summarizeNote()` 截断 2500 字符 + `localSummary()` 取前 5 长句；`noteToCards()` 用行格式约束 `Q: ... | A: ...` + 正则解析（对小模型更稳）。

**AI 配置 UX**（`index.html:1687 connectAI()`）：单 Modal，下拉切换动态字段（nim 警示条+key；openai key+base+model；ollama Server URL+model），`updateAIStatus()` 同步徽标。无「连接测试」按钮，错误以内联聊天消息呈现。

### 判定

| 项 | 判定 | 理由 |
|---|---|---|
| Provider 抽象（统一封装 + fallback 参数 + 定制错误文案） | **Borrow Idea** | 零调度侵入；每个 AI 能力强制配本地降级 `callNIM(q, fallback)` 模式可直接复用 |
| 行格式约束输出 + 正则解析 | **Borrow Idea** | 比 JSON mode 对小模型稳；用于 intent 结构化输出 |
| CORS 教学文案 | **Borrow Idea** | 显著降低 AI 不可用时的挫败感 |
| AI 配置表单与本地存储 | **Borrow Idea** | 字段设计与默认值占位可参考 |
| 单文件/零依赖架构、明文 key 存 localStorage | **Reject** | 不适用于 React+TS 项目；安全与可维护性差 |
| "AI Day Planner" 假 AI 命名 | **Reject** | 失信风险；我们的 AI 绝不直接生成日程 |
| 3D Galaxy 等装饰 | **Later** | ROI 低 |

**最小借鉴形态**：新增 `src/services/ai/` 下 `provider.ts`（Provider 接口+ OpenAI-compatible 实现+ Ollama 实现+ 错误分类）、`config.ts`（持久化到 IndexedDB 而非 localStorage，加密提示）、`intent-parser.ts`（实现 `PlanIntentParser`），每个 AI 调用必传 fallback。

---

## 3. Reference B — DegreeFlow (`matteosgobba/degreeflow`, MIT)

- 栈：React + TanStack Start + Tailwind + Supabase + Google Cloud OAuth；整包 `user_app_state` JSONB 持久化。
- 领域类型在 `src/lib/types.ts`（285 行）。

### 数据模型（`src/lib/types.ts`）

```
Commitment {day:Weekday, start:"HH:mm", end, type:Lecture|Work|Commute|Sport|Personal|Other}
Exam {ects, difficulty, examType, priority, goal(Pass/Good/Excellent), status, options:ISO[]（多候选考试日）, theory[], exercises[], deliverables[]}
BacklogItem = TheoryTopic | ExerciseCategory | Deliverable（判别联合，各自有 difficulty/estimatedHours/materialStatus/progress/preferredMethod）
Preferences {preferredStudyTime, minBreakMinutes, unavailableDays[], restSlots[], blockDuration:45|60|90|120, ...}
UnexpectedEvent {date, start, end, importance}
StudyBlock {date, start, end, examId, taskId, taskTitle, kind, method, priority, reason, soft?, moved?, manuallyMoved?, originalDate?, originalStart?}
```

### 关键机制

**Readiness/Risk**（`src/lib/metrics.ts`）：枚举→分数映射（theory 0/25/50/75/100 等），`overall = theory*0.4+exercise*0.35+project*0.15+material*0.1`；Risk 纯阈值 + 人话 `reason`（如 "Exam in 7 days and readiness only 45%"）；`pickNextAction` 五级阶梯；`computeWeeklyMomentum` 用已完成 block Set 算周完成率。

**Smart Reschedule**（`src/lib/scheduler.ts:1118 parseNaturalEvent`）：**纯正则 mock**——星期名词表→未来最近该日；时间段正则；事件名关键词表+首句截断；importance 恒 Medium、缺省 15:00-17:00。**NL Preview→Confirm** 流程做得好：解析卡 + `Impact: N blocks affected` 预计算。

**Google Calendar**（`src/lib/google-calendar.ts`）：OAuth `calendar.events`，`syncStudyBlocks()` 把每个 Block 推成 `start/end:{dateTime:RFC3339带时区}` timed event，`extendedProperties.private.degreeflow_block_id` 幂等键，PATCH→404→POST 三段式。

**调度引擎**（`scheduler.ts:960 generateStudySchedule`）：backlog→TaskUnit 队列→`buildScheduleSpace` 从 commitments/restSlots 算 free slots→`tryPlace` 放 `slot.start`，尊重 `blockDuration/minBreakMinutes/bufferDays`；放不下走 `allowLateForHard`；`rescheduleAroundEvent` 冲突块保时长逐日后移+10 天，保留 `originalDate/originalStart` 审计字段。**粒度是具体 start/end**。

### 判定

| 项 | 判定 | 理由 |
|---|---|---|
| **Course/Exam/Backlog 是否需要新增模型** | **Keep (不需要)** | 详见 `BASELINE_AUDIT.md §3.3`；Goal+TaskGroup+Assignment 已覆盖 scheduler 所需；新增模型只会造成重复与迁移成本 |
| **Readiness/Risk/Momentum 指标 + 人话 reason + nextAction 阶梯** | **Borrow Idea — P1** | 零模型改动，纯计算层；直接提升"目标是否可达"可解释性 |
| **NL Preview→Confirm 流 + Impact 计数 + movedNotes 差异** | **Borrow Idea — P1** | 交互模式可复用；解析本身用正则起步足够 |
| **StudyBlock provenance 字段（reason/moved/originalDate/originalStart）** | **Borrow Idea — P2** | 与 date-level 引擎天然契合，增强变更审计能力 |
| **枚举进度→分数映射（下拉而非数字输入）** | **Borrow Idea — Later** | 降低录入负担；可在 TaskGroup 创建表单中渐进引入 |
| **Google Calendar timed 推送（幂等键+三段式）** | **Borrow Idea — P2** | 需先有 time-block 分配层；当前 ICS 为全天，P2 再做 |
| **整包 JSONB 持久化** | **Reject** | 已有更优的 IndexedDB 分键存储 |
| **正则 mock 的默认值（15:00-17:00 等）直接上线** | **Reject** | 需显式让用户确认/纠正 |

---

## 4. Reference C — Vale (`diegnghtmr/vale`, MIT)

- 大学选课/课表编排器：Course `Schedule[]{day,startTime,endTime}` → 勾选入周视图 → 冲突检测 → ICS/CSV 导出；CSV/JSON 导入（`components/FileUpload.tsx` react-dropzone）；学分 Dashboard；en/es i18n。
- 日历：`components/Calendar.tsx` 基于 `@fullcalendar/react` 仅 `timeGridWeek`，`slotDuration 30min`，可视 06:00-24:00，`headerToolbar={false}` 自绘控件。**核查发现：未设 `editable`/interaction 插件——README 宣传的 drag & drop 实际只有文件上传拖拽，日历事件本身不可拖；也无视图切换（仅周视图）。**
- 设计：`styles/tokens.css` 30KB 完整 CSS 变量系统（含 FullCalendar 覆写）。

### 判定

| 项 | 判定 | 理由 |
|---|---|---|
| Vale 的**冲突提示文案规范**（点名对象+双方时段+多行结构化） | **Borrow Idea** | ProposalDialog/conflict 提示可直接采用该文案模板 |
| Modal 无障碍三件套（aria-modal/Esc/自动聚焦/锁滚动，`EventDetailsModal.tsx:17-44`） | **Borrow Idea** | 补齐现有 Modal 的 a11y 细节 |
| tokens.css 设计令牌系统 | **Later** | 现有 `styles.css` 287KB 巨石化，长期值得 token 化，但 Phase 0 不动 |
| FullCalendar 引入 / 周视图 timeGrid 重写 | **Reject** | 与现有 date-level 引擎双轨冲突；当前月历已满足"哪天学什么"的核心问题 |
| 宣传的 drag & drop 日历交互 | **Reject** | 实际未实现；且即使实现，date-level 任务拖拽应在天粒度做，不引入 FullCalendar |
| GSAP 粒子/主题过渡等装饰动效 | **Reject** | 对规划类产品 ROI 低 |

**UX 参考价值总结**：Vale 的价值在**细节规范**（文案、无障碍、令牌），不在**架构**。

---

## 5. Reference D — Shovel (商业产品，闭源，仅公开体验与设计思想)

- 来源：官网 `shovelapp.io`、App Store / Google Play 描述、第三方测评（DormWay 2026 对比）。
- 核心叙事：**Pile（所有任务一处）→ Cushion（可用时间 - 所需时间 = 是否来得及的实时计算）→ Timeline（学期可视化）→ Time-blocking（把任务铺到日历的具体时间段）**。
- 关键理念：
  - **Task + Calendar unified workflow**：任务列表与日历并列，直接把任务 timebox 到日历
  - **Due date → Do date**：把"截止日"翻译成"执行日"
  - **Available study time vs Estimated work duration**：每任务预估时长，持续计算 workload feasibility
  - **Cushion / Future workload warning**：全学期实时看是否来得及，提前预警
  - **Syllabus import**：AI 读取 PDF syllabus 自动建任务（需 review）
  - 价格：$9.79/mo 或 $35/yr，7 天试用后付费

### 判定

| 理念 | 判定 | 最小融入方式 |
|---|---|---|
| **Do date vs Due date 的术语与心智模型** | **Borrow Idea — P0 文案层** | 零代码：Today/Calendar 文案中区分"截止日"与"计划执行日" |
| **Cushion 思想（可用 vs 所需的持续可行性计算）** | **Borrow Idea — P1/P2** | P1：用现有 capacity/estimatedMinutes/GoalProgress 做"未来 N 天是否排得下"的轻量预警条（纯计算，不改引擎）<br>P2：配合 time-block 分配层做精确 Cushion |
| **Task+Calendar 并列工作流** | **Later** | 需 time-block 层；当前 Intake→Calendar 已分离收集与排期，符合"Collect before schedule"，不急于合并视图 |
| **Semester timeline 可视化** | **Later** | Stats 页可加学期时间线，但优先级低于 Readiness/Risk |
| **Syllabus AI 抽取** | **Borrow Idea — P2** | 复用现有 Intake 的 CSV/XLSX 管道，新增 AI 辅助解析分支（仍经可编辑预览） |
| **整套 time-blocking 日历重写** | **Reject** | 属于新产品；违背 upstream-first |

---

## 6. 汇总判定表（Keep / Borrow Idea / Reject / Later）

| 能力/理念 | 判定 | 优先级 | 备注 |
|---|---|---|---|
| Study Planner 现有调度内核与执行闭环 | **Keep** | — | 不重写、不替换 |
| AI Provider 抽象（统一封装+fallback+错误教学） | **Borrow Idea** | P0 骨架 | 新增 `src/services/ai/`，不污染 scheduler |
| 行格式约束输出 + 正则解析 | **Borrow Idea** | P0 | 用于 intent 结构化输出，比 JSON 稳 |
| CORS/连接失败的教学文案 | **Borrow Idea** | P0 | 降低 AI 不可用挫败感 |
| Readiness / Risk 人话指标 + nextAction 阶梯 | **Borrow Idea** | P1 | 纯计算层，零模型改动 |
| NL Preview→Confirm + Impact 计数 | **Borrow Idea** | P1 | 交互模式复用 |
| Do date vs Due date 术语 | **Borrow Idea** | P0 | 文案层零代码 |
| 轻量 Cushion 预警（未来可行性） | **Borrow Idea** | P1 | 基于现有 capacity/估时计算 |
| StudyBlock provenance 审计字段 | **Borrow Idea** | P2 | 增强变更可解释性 |
| Google Calendar timed 推送 | **Borrow Idea** | P2 | 需先有 time-block 层 |
| Vale 冲突文案规范 + Modal a11y 细节 | **Borrow Idea** | P1 | 文案与无障碍补齐 |
| tokens.css 令牌化 | **Later** | P2 | 长期值得，短期不动 |
| Time-block 二阶段分配器 | **Later** | P2 | date→time 旁路分配，引擎零改 |
| Syllabus AI 抽取 | **Later** | P2 | 复用 Intake 管道 |
| Topic/Mastery/Course 层级重建模 | **Reject** | — | 与现有 Goal+TaskGroup 重复，造成迁移负担 |
| FullCalendar / 整套日历重写 / GSAP 动效 | **Reject** | — | 双轨冲突、ROI 低 |
| StudyOS 单文件架构 / 明文 key 存储 | **Reject** | — | 安全与可维护性差 |
| DegreeFlow 整包 JSONB 持久化 / mock 默认值直上线 | **Reject** | — | 已有更优方案 / 需用户确认 |

---

## 7. License Audit（许可审计）

> 原则：参考思想与产品设计，不复制第三方实现代码。若未来确需复用，必须满足本节兼容性要求。

| 项目 | 仓库 | License 文件 | License | 兼容性与要求 |
|---|---|---|---|---|
| **主项目 Study Planner** | `yhwlwl/study-planner` | `LICENSE` | **AGPL-3.0-or-later** (Copyright (c) 2026 yhwlwl) | 我们的二次开发产物同样受 AGPL 约束；对外提供网络服务需开源对应源码 |
| **StudyOS** | `A2ROYAL/StudyOS` | **无 LICENSE 文件** | README 徽章自称 MIT，但**无法律效力**（GitHub 官方规则：无 LICENSE = 默认保留所有权利） | **不可复制任何代码**；仅思想参考。若需复用必须先获作者明确授权并补 LICENSE |
| **DegreeFlow** | `matteosgobba/degreeflow` | `LICENSE` | **MIT** (Copyright (c) 2026 Matteo Sgobba) | 与 AGPL 兼容（MIT 可被 AGPL 吸收）；若复用需保留 MIT 声明与 copyright；不得移除 attribution |
| **Vale** | `diegnghtmr/vale` | `LICENSE` | **MIT** (Copyright (c) 2025 Diego Alejandro Flores Quintero) | 同上，与 AGPL 兼容；复用需保留声明 |
| **Shovel** | 商业闭源 | — | 闭源商用 | **禁止复制实现**；仅公开设计思想参考（合理使用） |

**对二次开发的含义**：
- 主项目 AGPL 决定了我们的 fork 若对外提供服务，必须以 AGPL 开源（含修改部分）。
- 参考项目的 MIT 代码**可以**被 AGPL 项目吸收（MIT→AGPL 单向兼容），但必须保留原 copyright/permission notice。
- StudyOS 当前**不能**以 MIT 假设复用代码；如确需复用其片段，应先通过 issue 请求作者补 LICENSE 或获书面授权。
- 任何复用都应在代码文件头与 `docs/customization/REFERENCE_ANALYSIS.md` 中注明 source + license + attribution。
