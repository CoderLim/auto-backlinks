# 自动外链系统设计决策

> 状态：讨论中，持续更新
> 日期：2026-07-24
> 当前阶段：已确认目标架构、POC 范围和 GitHub 过渡存储方案；POC 结果将决定后续 D1 设计

## 1. 背景

目前有三个相关项目或能力：

- `link-booster-extension`：Plasmo Chrome 扩展，已经支持页面内容提取、AI 评论生成，以及常见评论表单的姓名、邮箱、网站和评论字段填充。
- `link-master`：Next.js Web 平台，管理待投放外链、目标网站资料和历史投放记录。
- `opencli`：可以获取竞品的具体外链来源页面 URL，但不纳入一期范围。

`auto-backlinks` 仓库作为跨项目设计与集成工程目录。POC 不在该仓库创建第三个后端或管理界面。

## 2. 现有数据事实

2026-07-24 对 `link-master/data/json` 的检查结果：

- 外链候选共 2,561 条。
- 目标网站共 7 个。
- 投放记录共 179 条，涉及 85 个不同候选页面。
- 约 2,476 个外链候选尚未出现任何投放记录。
- 58 个候选页面曾被用于多个目标网站，单个页面最多用于 5 个目标网站。
- 178 条旧记录没有 `status` 字段；现有 LinkMaster 代码将这类记录视为 `published`。
- 当前发现 1 条记录引用了已不存在的外链，另有 1 组重复的 `(targetSite, backlinkId)` 记录。实现前需要清理或兼容。

POC 只按具体候选页面建模：

- `backlinkId` 标识一个具体 URL。
- `(targetSite, backlinkId)` 唯一确定某个目标网站是否已经向该页面提交，用于防止重复。
- POC 不提取 `channelKey`，也不把同一域名的不同 URL 合并或共享成功经验。

178 条没有 `status` 的旧记录只视为“历史提交证据”，不能视为已经验证链接可见：

- 继续用于 `(targetSite, backlinkId)` 去重，避免再次提交同一页面。
- 可以用于组成 Campaign 中约 25% 的有历史记录样本。
- 不能证明同一域名下其他页面可提交，也不建立自动提交白名单。

## 3. 已确认的 POC 一期范围

### 3.1 输入来源

- 一期直接使用 LinkMaster 中已有的外链候选。
- 一期不接入 `opencli`，也不实现竞品外链抓取。
- 后续把 `opencli` 作为新的候选数据源接入，不改变 Campaign、Item 和执行协议。

### 3.2 外链类型

- 一期优先处理博客评论类外链。
- 数据模型需要预留目录站、产品提交站、论坛和社区等类型，但一期不实现对应执行器。
- 现有 `link_category`、`type` 和 `link_type` 可能不准确，不能作为 POC 的硬过滤条件。
- 页面实际类型和链接能力在运行时重新检测。
- POC 对两个含义模糊的旧字段做一对一改名，不进一步拆字段：`type` 改为新的 `link_type`，旧的 `link_type` 改为 `link_rel`。

### 3.3 Campaign

- 每个 Campaign 只选择一个目标网站。
- 用户只需选择目标网站、输入本轮处理数量并启动 Campaign。
- POC 处理数量限制为 20 至 30 条。
- 数量表示本轮要处理的候选数，不表示最终成功发布数。
- `silent_reject`、`cannot_submit`、`skipped` 和 `failed` 都计入处理数量，不自动补充候选。
- 系统从该目标网站尚未提交过的候选页面中生成固定 Campaign Items。
- Campaign Items 按约 25% 有历史提交记录、75% 无历史记录候选组成。
- 一期不判断候选页面行业与目标网站主题是否相关，也不以相关性低为由跳过。
- 页面行业分类在运行时重新识别并用于纠正 LinkMaster 候选数据，但只作为元数据，不参与 POC 筛选。
- 一期不自动在多个目标网站中做匹配。

### 3.4 自动化边界

采用“受控自动化”：

- 扩展一次只打开并处理一个 Campaign Item。
- 扩展复用一个专用自动化标签页串行访问所有 Item，不为每条候选批量打开标签页。
- 每个候选页面自动分析和填充后暂停。
- 用户逐条选择“提交并继续”或“跳过”，不批量打开多个待检查标签页。
- 登录、验证码、页面结构异常、内容风险或低置信度情况转人工处理。
- POC 不根据域名或历史记录自动点击提交。

链接放置策略按页面能力决定：

1. 页面同时提供用户名和 Website URL 字段时，使用 `author_website`，让目标链接挂在用户名上；评论正文只写与当前页面相关的自然评论，不提及也不重复目标网站 URL。
2. 页面不支持 `author_website` 时，只有运行时证据表明现有评论正文允许站外链接，才选择已识别的 `comment_body/*` 格式并把目标链接放进正文。
3. 无法确认正文支持站外链接时，不强行插入链接，Item 标记为 `cannot_submit` 或由用户 `skipped`。
4. 即使页面同时支持多种方式，POC 也优先 `author_website`；正文链接只是回退方式，不进行双重放置。
5. 用户名链接和正文链接都优先使用 LinkMaster 目标网站配置中的 `name` 作为锚文本；即使网站名本身也是 SEO 关键词，也按网站正式名称处理。
6. 生成模型不得根据当前页面自行改写、扩展或堆叠其他关键词锚文本。网站名无法自然放入正文时回退为裸域名。

### 3.5 执行环境

- 一期使用 Chrome 扩展作为唯一浏览器执行器。
- 复用用户的真实 Chrome、Cookie、登录状态和现有扩展能力。
- 一期不引入独立 Playwright、远程浏览器、代理池或验证码代解服务。

### 3.6 验证规模

- POC 只创建一个活动 Campaign。
- Campaign 只推广一个目标网站。
- 系统从 LinkMaster 现有候选库中自动选择 20 至 30 条候选。
- 只允许一个 Chrome 扩展实例串行执行，一次只处理一个 Item。
- 所有 Item 在同一个专用自动化标签页中依次打开；扩展侧边栏保留 Campaign 控制和当前 Item 状态。
- POC 不承诺无人值守连续运行、并发执行或浏览器崩溃后的自动恢复。

### 3.7 POC 完成标准

POC 完成不等于系统已经可以规模化运行。POC 的完成标准是：

- 20 至 30 条候选全部得到明确结果，不遗留无法解释的中间状态。
- 没有对同一 `(targetSite, backlinkId)` 重复提交。
- 能统计页面可访问率、评论页识别率、表单识别率、填充成功率、人工接管原因、静默失败率和最终提交结果。
- 用户可以检查生成评论后手动提交每个候选页面。
- 所有 Item 结果都保存到 Campaign；确认 `published` 或 `cannot_submit` 的结果能与现有 LinkMaster 记录关联。
- POC 结束后，根据实际成功率、人工耗时和失败分类决定是否进入 D1 阶段。

POC 的首要目标是验证评论链路并纠正候选数据：页面是否可访问、能否识别评论区域和链接放置方式、能否填充、能否提交，以及提交后属于哪种结果。目标网站与候选页面的行业相关性不属于一期成功条件。

### 3.8 候选筛选

2026-07-24 的数据检查显示，2,561 条候选中有 2,304 条是域名首页或根路径。POC 不实现站内文章发现器，因此直接过滤这些 URL。

候选必须满足：

1. URL 包含非根路径。
2. 状态不是 `inaccessible` 或 `unsubmittable`。
3. 当前目标网站不存在相同 `(targetSite, backlinkId)` 的最终记录。
4. 不根据现有 `link_category`、`type` 或 `link_type` 排除候选；POC 数据迁移后，原 `type` 使用新的 `link_type`，原 `link_type` 使用 `link_rel`。

按上述规则，当前约有 255 条非根路径且未被标记为不可用的候选，其中 45 个页面有历史记录、210 个页面没有历史记录，足以组成 POC 的混合样本。

扩展打开页面后再做运行时检查：

- 页面必须包含可提取正文和评论表单。
- 没有评论表单、实际属于目录/论坛或页面类型不受支持时，标记 `cannot_submit` 或 `skipped`。
- 不尝试从域名首页自动寻找文章。
- 失败或跳过后继续下一条，不补足成功数量。

### 3.9 运行时元数据纠正

每个 Campaign Item 在页面检查阶段生成 `observedMetadata`：

- `topicCategory`：页面实际主题。
- `placementType`：`blog_comment`、`forum`、`directory`、`profile` 或 `unknown`。
- `placementCapabilities`：页面支持的链接放置能力。
- `requiresLogin`、`hasCaptcha`、`usesModeration`。
- `checkedAt` 和检测置信度。

`placementCapabilities` 可以同时包含多种方式：

- `author_website`：通过 Website 字段或用户名产生链接。
- `comment_body/plain_url`：正文纯 URL 会自动转为链接。
- `comment_body/html`：正文接受 HTML Anchor。
- `comment_body/markdown`：正文接受 Markdown。
- `comment_body/bbcode`：正文接受 BBCode。

扩展通过已有评论中的站外 Anchor、作者区域、表单字段和编辑器提示推断能力。`link_rel` 只保存业务需要的 `Dofollow`、`Nofollow` 或 `Unknown`：检测到 `nofollow` 时写入 `Nofollow`，明确没有 `nofollow` 时写入 `Dofollow`，无法检查时写入 `Unknown`。POC 忽略 `ugc` 和 `sponsored` 等其他 `rel` token。渲染后的 Anchor 不能单独证明原输入是 HTML、Markdown 还是 BBCode。

POC 直接纠正 LinkMaster 现有候选字段，不长期维护一套“原值”和一套“实测值”：

- Item 执行时先把检测结果保存在 Campaign 文件中，避免每个步骤同时写多个 JSON 文件。
- Campaign 结束时批量覆盖 `backlinks.json`：`topicCategory` 写入 `link_category`，实际链接方式写入新的 `link_type`，Dofollow/Nofollow 检测结果写入 `link_rel`，并更新检查状态和时间。
- 只覆盖本次得到明确结果的字段；`unknown`、页面未加载成功或没有足够证据的字段保持原值。
- Campaign Item 保存每次纠正的字段、修改前值和修改后值，Git 提交历史提供额外追溯能力。
- `link_category` 是固定枚举、单选的页面行业字段，分类器不能自由生成新值。
- 分类器无法给出明确行业时写入 `General`。
- 大小写差异、拼写错误和同义分类统一为枚举中的标准值。
- `Forum`、`Blog`、`Directory` 等来源或页面形态不属于行业分类，不能写入 `link_category`。
- POC 允许的行业值为：`General`、`Gaming`、`Technology`、`Software & SaaS`、`AI`、`Business & Startup`、`Marketing & SEO`、`Finance`、`Education`、`Health`、`Sports`、`Entertainment`、`Arts & Design`、`Lifestyle`、`Travel`、`Food`、`Home & Garden`、`Automotive`、`Real Estate`、`Legal`、`Science`。
- 只有成功提取到页面正文时才运行行业分类；页面正文无法读取时不覆盖原 `link_category`。

字段迁移只改变名称和纠正值，不增加更多持久化字段：

- `type` -> `link_type`，表示链接方式，例如 `UserName Link`、`Text Link`、`HTML Link`、`Markdown Link` 或 `BBCode Link`。
- 原 `link_type` -> `link_rel`，只允许 `Dofollow`、`Nofollow` 或 `Unknown`。
- 迁移必须在内存中从旧对象同时读取两个字段，再生成新对象，不能先把 `type` 改名为 `link_type` 后覆盖旧值。

### 3.10 评论生成质量门槛

评论正文必须：

- 使用当前文章的主要语言。
- 引用或回应至少一个从当前页面正文提取出的具体内容点。
- 默认控制在 1 至 3 句，不用固定开场白、结尾或可跨页面复用的通用夸赞。
- 不虚构使用经历、身份、关系或无法从页面和目标网站资料证明的事实。
- 链接使用方式遵循 3.4 的页面能力和放置策略。

这些要求既写入生成提示，也在填表前进行检查。首次结果不合格时允许自动重新生成一次；第二次仍不合格则不填表，Item 标记为 `skipped`，原因为 `comment_quality_failed`。

这里的内容相关只指“评论必须回应当前文章”，不要求当前文章所属行业与被推广目标网站相同。

## 4. 已确认的总体架构

采用 **控制面 + 浏览器执行器**，不把 LinkMaster 整体迁入插件。

### 4.1 LinkMaster：控制面和事实来源

LinkMaster 负责：

- 外链候选池
- 目标网站资料，包括提交评论时使用的网站 `name`、`domain` 和邮箱
- Campaign 配置
- Campaign Items 的选择、顺序和进度
- `(targetSite, backlinkId)` 去重
- 执行记录、提交证据和最终验证结果
- 失败分类、重试策略和人工处理队列
- Campaign 统计与审计

关键业务状态必须保存在控制面，不能只存在浏览器内存或扩展本地存储。

### 4.2 Link Booster：浏览器执行器

扩展负责：

- 通过 LinkMaster API 主动加载当前唯一的活动 Campaign
- 获取当前 Campaign 的下一条 Item
- 打开并等待目标页面
- 判断页面是否可访问、是否为可评论页面
- 提取正文和页面语言
- 生成与页面相关的评论
- 识别并填写表单字段
- 填充后暂停等待人工确认
- 检测登录、验证码、审核提示和异常页面
- 回传执行步骤、错误类型、截图、最终 URL 和页面反馈

扩展可以展示 Campaign、队列和执行进度，但这些只是 LinkMaster 数据的客户端视图，不是新的事实来源。

### 4.3 POC 用户界面职责

POC 不让用户手工派发单条任务。界面分工如下：

- LinkMaster：选择目标网站、输入本轮处理数量、创建 Campaign，以及查看总体进度和结果。
- 扩展侧边栏：加载活动 Campaign、开始或暂停执行、显示当前 Item，并提供“提交并继续”和“跳过”。
- LinkMaster 不负责远程唤醒或控制扩展；扩展由用户启动后主动读取活动 Campaign。
- `auto-backlink` 不另建一套 POC 管理界面。

### 4.4 目标任务协议与 POC Item API

LinkMaster 与扩展通过稳定 API 契约互通，不直接依赖彼此内部代码。

目标架构采用扩展主动拉取任务的模式：

1. 扩展请求下一条可执行任务。
2. 控制面原子地将任务租给该扩展实例。
3. 扩展执行期间续租或上报进度。
4. 扩展将任务标记为完成、等待人工、待验证、可重试或永久失败。
5. 租约超时后，控制面可以安全地回收任务。

目标架构不要求 WebSocket。轮询加任务租约更容易实现中断恢复，也符合 Chrome Manifest V3 service worker 会被回收的运行特性。

POC 因使用 GitHub JSON 且只有一个执行器，暂不实现数据库租约：

1. LinkMaster API 串行返回当前 Campaign 的下一条 `pending` Item。
2. 每个 Item 使用稳定 `itemId`，并以 `(targetSite, backlinkId)` 作为业务幂等键。
3. LinkMaster 保存 Item 结果后，扩展才请求下一个 Item。
4. POC 禁止同时打开两个自动执行窗口。
5. POC 不实现扩展重载、浏览器关闭或页面崩溃后的步骤恢复。中断后不自动重新打开或再次提交当前 Item，用户可以结束或放弃当前 Campaign。

POC 的最小 Item 状态为：

- `pending`：等待执行。
- `inspecting`：正在打开页面、提取内容和识别表单。
- `awaiting_review`：已经生成并填充，等待用户检查或处理登录、验证码。
- `submitted`：已触发提交，等待判断即时结果。
- `published`：已经确认评论或外链在最终页面可见。
- `pending_moderation`：页面明确提示正在等待审核。
- `silent_reject`：提交后不可见，也没有审核提示。
- `explicit_reject`：页面明确拒绝提交。
- `skipped`：用户主动跳过或规则判定不相关。
- `cannot_submit`：确认该页面无法提交。
- `failed`：发生 POC 范围内不自动重试的技术错误。

`submitted` 与 `published` 必须分开。点击提交按钮或收到成功响应只能进入 `submitted`；看到审核提示进入 `pending_moderation`；只有在页面上确认目标链接可见后才能进入 `published`。

POC 不研究单站静默失败的根因，也不在同一 Campaign 中重试。`silent_reject` 只作为当前 Item 的结果，不推导同一域名下其他页面的可提交性。

提交后的即时结果判定：

1. 扩展保存规范化评论文本的指纹，用它在提交后的页面中定位本次评论。
2. 找到对应评论，并确认其用户名链接或正文链接指向当前目标网站，标记 `published`。
3. 页面明确提示评论等待审核，标记 `pending_moderation`。
4. 页面明确显示校验错误、反垃圾提示或拒绝信息，标记 `explicit_reject`。
5. 页面稳定后仍找不到对应评论，也没有审核提示或明确错误，标记 `silent_reject`。

只找到相同评论文字但没有目标链接，不能判定为 `published`。POC 不做数小时或数天后的自动复查；LinkMaster 允许用户人工修正最终状态和备注，但人工修正不会重新触发表单提交。

### 4.5 后续扩展

未来可以增加 Playwright、Skyvern 或其他远程浏览器 Worker。新 Worker 只需实现相同任务协议，不需要迁移 Campaign 和历史数据。

### 4.6 仓库职责

- `link-master`：实现 Campaign 管理界面、自动化 API、GitHub JSON 读写、候选纠正和结果归档。
- `link-booster-extension`：实现页面检测、评论生成、表单填充、受控提交和即时结果回传。
- `auto-backlink`：保存系统设计、跨项目 API 契约和必要的数据迁移脚本；POC 不运行线上服务。

一期不抽取共享运行时代码包。两个运行项目通过版本化 JSON API 契约集成，避免为了共享少量类型增加第三套发布流程。

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
- 新增 POC Campaign 文件：保存 Campaign 快照、20 至 30 个稳定 Item ID、顺序、状态和最小结果摘要。

POC Campaign 文件是运行期间的事实来源。Campaign 结束时，再把最终 `published` 或 `cannot_submit` 结果按 `(targetSite, backlinkId)` 幂等合并到 `records.json`。这样避免每一步同时更新多个 JSON 文件。

GitHub 写入约束：

- 只允许 LinkMaster 服务端写入，扩展不得持有 GitHub Token。
- 同一时间只允许一个活动 Campaign 和一个写入者。
- 只在 Item 发生有意义的状态转换时写入，不记录每次 DOM 操作。
- 写入必须携带当前文件 SHA；SHA 冲突时重新读取并按 `itemId` 合并，不能直接覆盖远端新状态。
- 所有变更请求串行发送，并在限流或冲突时停止 Campaign，等待人工恢复。
- POC 不把截图、页面 HTML 或大段模型输入输出写入 GitHub。

### 6.2 POC 认证

- 扩展通过 LinkMaster 的自动化 API 获取和回写 Item。
- POC 使用单独的 Bearer Token，例如 `AUTOMATION_API_TOKEN`。
- Token 由用户在扩展设置中配置，只授予自动化 API 权限。
- GitHub Token 只保存在 LinkMaster 服务端环境变量中。
- 后续进入正式阶段时，再替换为可撤销的 Worker 身份和短期访问令牌。

### 6.3 评论身份资料

- 当前 LinkMaster 的 `sites.json` 只有 `domain`、`tagline` 和 `description`；扩展本地配置另有 `name`、`url`、`userName` 和 `userEmail`，两处配置尚未统一。
- POC 将网站 `name` 和评论邮箱迁入 LinkMaster，由 LinkMaster 按目标网站集中保存，不让扩展维护另一份网站列表。
- 不新增 `brandName` 或独立 `commenterName`：表单用户名固定使用网站 `name`，Website URL 使用规范化后的 `domain`。
- 扩展现有 `userName` 字段不再参与自动发布；现有代码中缺少邮箱时使用的硬编码默认值必须移除。
- 创建 Campaign 时对身份资料做快照；自动化 API 只返回当前 Campaign 对应目标站的必要资料，不返回全部网站列表。
- 身份资料缺失时扩展停止当前 Item 并提示补全，禁止使用硬编码的默认邮箱或网站名替代用户名。
- 一期不把账号密码纳入身份资料，也不向扩展发送现有 `details` 字段。
- 当前 LinkMaster GitHub 仓库为私有仓库，但这只是一项 POC 风险缓解措施，不代表 GitHub JSON 适合长期存放个人资料；迁移 D1 时应进入受访问控制的数据表。

### 6.4 POC 执行证据

GitHub 中只保存足够诊断和迁移的数据：

- `itemId`
- `targetSite`
- `backlinkId`
- 页面 URL 和最终 URL
- Item 状态与标准化失败原因
- 生成评论的哈希或短摘要，不默认保存完整敏感内容
- 表单识别结果
- `observedMetadata` 和实际链接放置方式
- 提交反馈摘要
- 标准化结果：`published`、`pending_moderation`、`silent_reject`、`explicit_reject`、`cannot_submit`、`skipped` 或 `failed`
- `createdAt`、`startedAt`、`completedAt`

截图只保存在本地扩展存储或用户明确选择的目录中。POC 不实现云端证据存储。

现有 `details` 字段中可能包含明文账号信息。自动化 API 不得把整个 `details` 字段发送给扩展；登录继续由用户人工处理，敏感数据后续单独清理和迁移。

### 6.5 明确暂缓的能力

以下能力不属于 POC：

- D1、数据库事务和原子任务租约
- 多扩展实例或远程 Worker
- 自动心跳、租约过期回收和崩溃自动恢复
- 定时 Campaign 和无人值守连续运行
- 大规模重试调度和退避队列
- 自动登录、验证码代解、代理池和账号管理
- 发布后定时复查和搜索引擎索引验证
- 单站静默失败的自动根因分析
- `opencli` 导入和自动发现竞品外链
- 目录站、产品提交站、论坛和社区执行器
- 完整截图、录像和模型调用追踪

### 6.6 迁移到 D1 的触发条件

满足任一条件后，不再扩展 GitHub 运行态方案，先迁移到 D1：

- 单个 Campaign 超过 30 个 Item。
- 需要同时运行多个 Campaign 或多个扩展实例。
- 需要无人值守、定时执行、自动重试或可靠崩溃恢复。
- GitHub SHA 冲突、限流或提交噪声开始影响正常使用。
- LinkMaster 开始迁移到 Cloudflare Workers 或 Pages。

D1 阶段保留现有 `itemId` 和 `(targetSite, backlinkId)` 幂等键，并将 Campaign、Item、运行记录、投放记录和 Worker 状态迁入关系表。扩展 API 契约不因迁移而改变。只有后续确实需要跨页面复用外链网站经验时，才增加域名级分组。

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
- 按目标站和具体候选页面控制重复提交。
- 区分 `submitted`、`accepted`、`published` 和 `verified`。
- 保存最终落地 URL 和验证证据。
- 支持停止 Campaign、排除候选页面以及删除或复查历史投放。

Google 明确将大规模用户生成垃圾内容和不自然链接列为搜索垃圾行为。自动化系统必须优化相关性、用户价值和可审计性，而不是最大提交量：

- https://support.google.com/webmasters/answer/9044175
- https://support.google.com/webmasters/answer/13580519

## 9. 待确认问题

以下二期或扩展内容尚未定稿，不阻塞 POC：

1. D1 阶段的完整任务租约、重试和投放记录状态机。
2. 发布数小时或数天后的复查机制。
3. POC 结束后 D1 的具体表结构、迁移步骤和 Cloudflare 部署边界。
4. 正式阶段的扩展实例认证和 API 权限模型。
5. 评论跨 Campaign 重复度检查和长期禁发规则。
