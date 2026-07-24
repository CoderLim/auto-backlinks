# 自动外链系统设计决策

> 状态：讨论中，持续更新
> 日期：2026-07-24
> 当前阶段：已确认总体架构与一期边界，任务状态机、验证机制和存储方案仍待确认

## 1. 背景

目前有三个相关项目或能力：

- `link-booster-extension`：Plasmo Chrome 扩展，已经支持页面内容提取、AI 评论生成，以及常见评论表单的姓名、邮箱、网站和评论字段填充。
- `link-master`：Next.js Web 平台，管理待投放外链、目标网站资料和历史投放记录。
- `opencli`：可以获取竞品的具体外链来源页面 URL，但不纳入一期范围。

`auto-backlink` 当前为空目录，本设计文档先放在这里。它最终是否承载独立服务或仅作为设计与集成工程目录，尚未决定。

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

## 3. 已确认的一期范围

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

一期采用扩展主动拉取任务的模式：

1. 扩展请求下一条可执行任务。
2. 控制面原子地将任务租给该扩展实例。
3. 扩展执行期间续租或上报进度。
4. 扩展将任务标记为完成、等待人工、待验证、可重试或永久失败。
5. 租约超时后，控制面可以安全地回收任务。

一期不要求 WebSocket。轮询加任务租约更容易实现中断恢复，也符合 Chrome Manifest V3 service worker 会被回收的运行特性。

### 4.4 后续扩展

未来可以增加 Playwright、Skyvern 或其他远程浏览器 Worker。新 Worker 只需实现相同任务协议，不需要迁移 Campaign 和历史数据。

## 5. 不采用的方案

### 5.1 全部迁入 Chrome 扩展

不采用。扩展适合执行当前浏览器中的动作，但不适合成为长期任务队列和唯一事实来源。Manifest V3 service worker 会在空闲时终止，扩展升级、浏览器关闭和本地存储损坏也会影响任务一致性。

### 5.2 一期全部迁入远程浏览器服务

不采用。虽然适合持续运行和横向扩容，但一期会提前引入登录状态托管、CAPTCHA、代理、反爬和基础设施成本。

### 5.3 LinkMaster 与扩展共享 JSON 文件

不采用。共享文件无法提供可靠的任务领取、租约、并发控制、幂等写入和冲突处理。两者应共享数据契约，不共享存储实现。

## 6. 市场与开源项目参考

### 6.1 Semrush Link Building Tool

Semrush 将流程组织为 `Prospects -> In Progress -> Monitor`，说明候选、执行中任务和结果监控应当是不同阶段：

- https://zh.semrush.com/kb/737-reviewing-link-building-prospects

### 6.2 GSA Search Engine Ranker

GSA SER 使用 Project、过滤器、提交和独立验证机制，并区分提交 URL 与最终验证 URL。可借鉴其项目级配置、质量过滤和延迟验证，但不照搬其高强度批量发布模式：

- https://www.gsa-online.de/en/product/search_engine_ranker/
- https://www.gsa-online.de/download/search_engine_ranker-script_language.pdf

### 6.3 Automa

Automa 证明浏览器扩展可以执行表单填充、重复任务和定时工作流，适合作为本机执行器：

- https://github.com/AutomaApp/automa

### 6.4 Skyvern 与 Stagehand

Skyvern 的 Task、Workflow、Run 模型，以及输出、失败原因、截图和录像等执行证据值得参考。Stagehand 的“确定性代码处理已知步骤，AI 处理未知页面”原则适合作为执行器设计原则：

- https://github.com/Skyvern-AI/skyvern
- https://www.skyvern.com/docs/developers/getting-started/core-concepts
- https://github.com/browserbase/stagehand

### 6.5 Chrome Manifest V3

Chrome 扩展 service worker 会因空闲或超时被终止，关键状态必须持久化，并允许恢复：

- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

## 7. 质量与合规原则

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

## 8. 待确认问题

以下内容尚未定稿：

1. 任务和投放记录的完整状态机。
2. 渠道白名单的精确定义，以及旧记录如何迁移为渠道验证数据。
3. 评论提交成功、进入审核和最终发布的检测与复查机制。
4. 每批任务数量、域名级和目标站级限速。
5. LinkMaster 当前 JSON/GitHub 存储是否迁移到支持事务的数据库。
6. 扩展实例认证、任务租约、幂等键和 API 权限模型。
7. 评论生成质量门槛、重复度检查和禁发规则。
8. 一期 UI 放在 LinkMaster、扩展侧边栏，还是两边分别承载哪些操作。
9. `auto-backlink` 仓库的最终职责。
