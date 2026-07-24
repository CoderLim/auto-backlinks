# 自动外链系统设计决策

> 状态：讨论中，持续更新
> 日期：2026-07-24
> 当前阶段：已确认目标架构、POC 范围和 GitHub 过渡存储方案；POC 结果将决定后续 D1 设计

## 1. 背景

目前有三个相关项目或能力：

- `link-booster-extension`：Plasmo Chrome 扩展，已经支持页面内容提取、AI 评论生成，以及常见评论表单的姓名、邮箱、网站和评论字段填充。
- `link-master`：Next.js Web 平台，管理待投放外链、目标网站资料和历史投放记录。
- `opencli`：可以获取竞品的具体外链来源页面 URL，但不纳入一期范围。

`auto-backlinks` 仓库当前用于保存跨项目设计。它最终是否承载 Cloudflare Worker，或仅作为设计与集成工程目录，待 POC 后决定。

## 2. 现有数据事实

2026-07-24 对 `link-master/data/json` 的检查结果：

- 外链候选共 2,561 条。
- 目标网站共 7 个。
- 投放记录共 179 条，涉及 85 个不同外链渠道。
- 约 2,476 个外链候选尚未出现任何投放记录。
- 58 个外链渠道曾被用于多个目标网站，单个渠道最多用于 5 个目标网站。
- 178 条旧记录没有 `status` 字段；现有 LinkMaster 代码将这类记录视为 `published`。
- 当前发现 1 条记录引用了已不存在的外链，另有 1 组重复的 `(targetSite, backlinkId)` 记录。实现前需要清理或兼容。

因此必须分别建模：

- **渠道是否已验证可投放**：某个 `backlinkId` 对应的页面或站点是否曾成功接受提交。
- **某目标站是否已在该渠道投放**：由 `(targetSite, backlinkId)` 唯一确定，用于防止重复提交。

这两个概念不能合并。

## 3. 已确认的 POC 一期范围

### 3.1 输入来源

- 一期直接使用 LinkMaster 中已有的外链候选。
- 一期不接入 `opencli`，也不实现竞品外链抓取。
- 后续把 `opencli` 作为新的候选数据源接入，不改变 Campaign、任务和执行协议。

### 3.2 外链类型

- 一期优先处理博客评论类外链。
- 数据模型需要预留目录站、产品提交站、论坛和社区等类型，但一期不实现对应执行器。

### 3.3 Campaign

- 每个 Campaign 只选择一个目标网站。
- 系统从该目标网站尚未提交过的候选渠道中生成任务。
- 一期不自动在多个目标网站中做相关性匹配，也不在同一渠道批量投放所有目标网站。

### 3.4 自动化边界

采用“受控自动化”：

- 已验证且满足低风险规则的渠道可以自动提交。
- 新渠道首次运行默认只自动分析和填充，由用户检查后手动提交。
- 登录、验证码、页面结构异常、内容风险或低置信度情况转人工处理。
- 新渠道人工提交并验证成功后，才有资格进入自动提交白名单。

### 3.5 执行环境

- 一期使用 Chrome 扩展作为唯一浏览器执行器。
- 复用用户的真实 Chrome、Cookie、登录状态和现有扩展能力。
- 一期不引入独立 Playwright、远程浏览器、代理池或验证码代解服务。

### 3.6 验证规模

- POC 只创建一个活动 Campaign。
- Campaign 只推广一个目标网站。
- 从 LinkMaster 现有候选库中人工选择 20 至 30 条博客评论页面。
- 只允许一个 Chrome 扩展实例串行执行，一次只处理一条任务。
- POC 不承诺无人值守连续运行、并发执行或浏览器崩溃后的自动恢复。

### 3.7 POC 完成标准

POC 完成不等于系统已经可以规模化运行。POC 的完成标准是：

- 20 至 30 条候选全部得到明确结果，不遗留无法解释的中间状态。
- 没有对同一 `(targetSite, backlinkId)` 重复提交。
- 能统计页面可访问率、评论页识别率、表单识别率、填充成功率、人工接管原因和最终提交结果。
- 用户可以检查生成评论后手动提交新渠道。
- 至少验证一次“人工确认渠道后，后续任务允许自动提交”的白名单路径。
- 所有任务结果都保存到 Campaign；确认 `published` 或 `cannot_submit` 的结果能与现有 LinkMaster 记录关联。
- POC 结束后，根据实际成功率、人工耗时和失败分类决定是否进入 D1 阶段。

## 4. 已确认的总体架构

采用 **控制面 + 浏览器执行器**，不把 LinkMaster 整体迁入插件。

### 4.1 LinkMaster：控制面和事实来源

LinkMaster 负责：

- 外链候选池
- 目标网站资料
- Campaign 配置
- 任务创建与排队
- `(targetSite, backlinkId)` 去重
- 渠道验证状态和可信度
- 执行记录、提交证据和最终验证结果
- 失败分类、重试策略和人工处理队列
- Campaign 统计与审计

关键业务状态必须保存在控制面，不能只存在浏览器内存或扩展本地存储。

### 4.2 Link Booster：浏览器执行器

扩展负责：

- 从控制面领取一条任务
- 打开并等待目标页面
- 判断页面是否可访问、是否为可评论页面
- 提取正文和页面语言
- 生成与页面相关的评论
- 识别并填写表单字段
- 按任务策略自动提交或暂停等待人工确认
- 检测登录、验证码、审核提示和异常页面
- 回传执行步骤、错误类型、截图、最终 URL 和页面反馈

扩展可以展示 Campaign、队列和执行进度，但这些只是 LinkMaster 数据的客户端视图，不是新的事实来源。

### 4.3 共享任务协议

LinkMaster 与扩展通过稳定 API 契约互通，不直接依赖彼此内部代码。

目标架构采用扩展主动拉取任务的模式：

1. 扩展请求下一条可执行任务。
2. 控制面原子地将任务租给该扩展实例。
3. 扩展执行期间续租或上报进度。
4. 扩展将任务标记为完成、等待人工、待验证、可重试或永久失败。
5. 租约超时后，控制面可以安全地回收任务。

目标架构不要求 WebSocket。轮询加任务租约更容易实现中断恢复，也符合 Chrome Manifest V3 service worker 会被回收的运行特性。

POC 因使用 GitHub JSON 且只有一个执行器，暂不实现数据库租约：

1. LinkMaster API 串行返回当前 Campaign 的下一条 `pending` 任务。
2. 每条任务使用稳定 `taskId`，并以 `(targetSite, backlinkId)` 作为业务幂等键。
3. 扩展把当前 `taskId` 和最后一步保存在 `chrome.storage.local`，只用于中断提示和人工恢复。
4. LinkMaster 保存任务结果后，扩展才请求下一条任务。
5. 中断的 `inspecting` 任务由用户选择继续或重置，不自动分配给其他执行器。
6. POC 禁止同时打开两个自动执行窗口。

POC 的最小任务状态为：

- `pending`：等待执行。
- `inspecting`：正在打开页面、提取内容和识别表单。
- `awaiting_review`：已经生成并填充，等待用户检查或处理登录、验证码。
- `submitted`：已触发提交，但可能仍在站点审核中。
- `published`：已经确认评论或外链在最终页面可见。
- `skipped`：用户主动跳过或规则判定不相关。
- `cannot_submit`：确认该页面无法提交。
- `failed`：发生 POC 范围内不自动重试的技术错误。

`submitted` 与 `published` 必须分开。点击提交按钮、看到“等待审核”提示或收到成功响应，只能进入 `submitted`；只有在页面上确认目标链接可见后才能进入 `published`。

### 4.4 后续扩展

未来可以增加 Playwright、Skyvern 或其他远程浏览器 Worker。新 Worker 只需实现相同任务协议，不需要迁移 Campaign 和历史数据。

## 5. 不采用的方案

### 5.1 全部迁入 Chrome 扩展

不采用。扩展适合执行当前浏览器中的动作，但不适合成为长期任务队列和唯一事实来源。Manifest V3 service worker 会在空闲时终止，扩展升级、浏览器关闭和本地存储损坏也会影响任务一致性。

### 5.2 一期全部迁入远程浏览器服务

不采用。虽然适合持续运行和横向扩容，但一期会提前引入登录状态托管、CAPTCHA、代理、反爬和基础设施成本。

### 5.3 LinkMaster 与扩展共享 JSON 文件

正式系统不采用。共享文件无法提供可靠的任务领取、租约、并发控制、幂等写入和冲突处理。

POC 允许 LinkMaster 在服务端通过 GitHub API 管理 JSON，但扩展不能直接读写 GitHub 文件。扩展仍然只使用 LinkMaster API，因此后续更换 D1 时不改变扩展协议。

## 6. POC 技术妥协

### 6.1 GitHub 作为过渡存储

POC 暂不引入 Supabase 或 D1。GitHub 继续保存低频目录数据和 POC 运行状态。

建议使用：

- 现有 `backlinks.json`：候选外链目录。
- 现有 `sites.json`：目标网站资料。
- 现有 `records.json`：既有和最终归档的投放记录。
- 新增 POC Campaign 文件：保存 Campaign 快照、20 至 30 个稳定任务 ID、顺序、状态和最小结果摘要。

POC Campaign 文件是运行期间的事实来源。Campaign 结束时，再把最终 `published` 或 `cannot_submit` 结果按 `(targetSite, backlinkId)` 幂等合并到 `records.json`。这样避免每一步同时更新多个 JSON 文件。

GitHub 写入约束：

- 只允许 LinkMaster 服务端写入，扩展不得持有 GitHub Token。
- 同一时间只允许一个活动 Campaign 和一个写入者。
- 只在任务发生有意义的状态转换时写入，不记录每次 DOM 操作。
- 写入必须携带当前文件 SHA；SHA 冲突时重新读取并按 `taskId` 合并，不能直接覆盖远端新状态。
- 所有变更请求串行发送，并在限流或冲突时停止 Campaign，等待人工恢复。
- POC 不把截图、页面 HTML 或大段模型输入输出写入 GitHub。

### 6.2 POC 认证

- 扩展通过 LinkMaster 的自动化 API 领取和回写任务。
- POC 使用单独的 Bearer Token，例如 `AUTOMATION_API_TOKEN`。
- Token 由用户在扩展设置中配置，只授予自动化 API 权限。
- GitHub Token 只保存在 LinkMaster 服务端环境变量中。
- 后续进入正式阶段时，再替换为可撤销的 Worker 身份和短期访问令牌。

### 6.3 POC 执行证据

GitHub 中只保存足够诊断和迁移的数据：

- `taskId`
- `targetSite`
- `backlinkId`
- 页面 URL 和最终 URL
- 任务状态与标准化失败原因
- 生成评论的哈希或短摘要，不默认保存完整敏感内容
- 表单识别结果
- 提交反馈摘要
- `createdAt`、`startedAt`、`completedAt`

截图只保存在本地扩展存储或用户明确选择的目录中。POC 不实现云端证据存储。

### 6.4 明确暂缓的能力

以下能力不属于 POC：

- D1、数据库事务和原子任务租约
- 多扩展实例或远程 Worker
- 自动心跳、租约过期回收和崩溃自动恢复
- 定时 Campaign 和无人值守连续运行
- 大规模重试调度和退避队列
- 自动登录、验证码代解、代理池和账号管理
- 发布后定时复查和搜索引擎索引验证
- `opencli` 导入和自动发现竞品外链
- 目录站、产品提交站、论坛和社区执行器
- 完整截图、录像和模型调用追踪

### 6.5 迁移到 D1 的触发条件

满足任一条件后，不再扩展 GitHub 运行态方案，先迁移到 D1：

- 单个 Campaign 超过 30 条任务。
- 需要同时运行多个 Campaign 或多个扩展实例。
- 需要无人值守、定时执行、自动重试或可靠崩溃恢复。
- GitHub SHA 冲突、限流或提交噪声开始影响正常使用。
- LinkMaster 开始迁移到 Cloudflare Workers 或 Pages。

D1 阶段保留现有 `taskId` 和 `(targetSite, backlinkId)` 幂等键，并将 Campaign、任务、运行记录、投放记录、渠道验证和 Worker 状态迁入关系表。扩展 API 契约不因迁移而改变。

## 7. 市场与开源项目参考

### 7.1 Semrush Link Building Tool

Semrush 将流程组织为 `Prospects -> In Progress -> Monitor`，说明候选、执行中任务和结果监控应当是不同阶段：

- https://zh.semrush.com/kb/737-reviewing-link-building-prospects

### 7.2 GSA Search Engine Ranker

GSA SER 使用 Project、过滤器、提交和独立验证机制，并区分提交 URL 与最终验证 URL。可借鉴其项目级配置、质量过滤和延迟验证，但不照搬其高强度批量发布模式：

- https://www.gsa-online.de/en/product/search_engine_ranker/
- https://www.gsa-online.de/download/search_engine_ranker-script_language.pdf

### 7.3 Automa

Automa 证明浏览器扩展可以执行表单填充、重复任务和定时工作流，适合作为本机执行器：

- https://github.com/AutomaApp/automa

### 7.4 Skyvern 与 Stagehand

Skyvern 的 Task、Workflow、Run 模型，以及输出、失败原因、截图和录像等执行证据值得参考。Stagehand 的“确定性代码处理已知步骤，AI 处理未知页面”原则适合作为执行器设计原则：

- https://github.com/Skyvern-AI/skyvern
- https://www.skyvern.com/docs/developers/getting-started/core-concepts
- https://github.com/browserbase/stagehand

### 7.5 Chrome Manifest V3

Chrome 扩展 service worker 会因空闲或超时被终止，关键状态必须持久化，并允许恢复：

- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

### 7.6 GitHub API

GitHub API 有请求和内容创建限流，官方也建议避免轮询、并发变更和高频写入。这是 GitHub 方案只限 POC 使用的直接原因：

- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://docs.github.com/en/rest/repos/contents

## 8. 质量与合规原则

自动评论不能只以“发布数量”为成功指标。系统需要：

- 只在内容相关且明确允许用户评论的页面工作。
- 禁止无关评论、批量重复文案和误用联系表单、订阅表单。
- 按目标站和渠道限速。
- 区分 `submitted`、`accepted`、`published` 和 `verified`。
- 保存最终落地 URL 和验证证据。
- 支持停止 Campaign、拉黑渠道以及删除或复查历史投放。

Google 明确将大规模用户生成垃圾内容和不自然链接列为搜索垃圾行为。自动化系统必须优化相关性、用户价值和可审计性，而不是最大提交量：

- https://support.google.com/webmasters/answer/9044175
- https://support.google.com/webmasters/answer/13580519

## 9. 待确认问题

以下内容尚未定稿：

1. D1 阶段的完整任务租约、重试和投放记录状态机。
2. 渠道白名单的精确定义，以及旧记录如何迁移为渠道验证数据。
3. 评论提交成功、进入审核和最终发布的检测与复查机制。
4. POC 内的域名级和目标站级限速。
5. POC 结束后 D1 的具体表结构、迁移步骤和 Cloudflare 部署边界。
6. 正式阶段的扩展实例认证和 API 权限模型。
7. 评论生成质量门槛、重复度检查和禁发规则。
8. POC UI 放在 LinkMaster、扩展侧边栏，还是两边分别承载哪些操作。
9. `auto-backlink` 仓库的最终职责。
