# Dify 真实分析接入与验收

本文件说明 PoliceMate 后端如何接入真实 Dify Workflow，以及工作流必须满足的输入、输出与
版本契约。基础设施流程见 [腾讯云部署](tencent-cloud-policymate-dify.md)。

**在 Dify 控制台里要做什么，见 [Dify 工作流搭建任务](dify-workflow-build.md)**，它包含全部
节点、代码、Prompt 文件位置、验收步骤与留档要求。本文件是后端侧的契约参考。

## 当前实现

- `apps/server/src/providers/dify.ts`：真实 Dify Workflow 适配器，调用
  `POST {PM_DIFY_BASE_URL}/workflows/run`，携带后端私有 Bearer Key、
  `response_mode: "blocking"` 与不含身份信息的随机 `user` 标识。
- `apps/server/src/providers/content.ts`：受治理内容读取边界，与模型和测试控制独立。
- `apps/server/src/config.ts`：`PM_PROVIDER_MODE` 选择 `fixture` 或 `dify`；真实模式
  不回退 fixture。
- `apps/server/src/index.ts`：按配置装配 provider；真实模式注入 Dify provider 与受治理内容。
- `apps/server/src/analysis/engine.ts`：状态机、超时/重试、取消传播与结果校验，不因
  接入真实模型而改变。
- `apps/server/src/providers/schemas/dify-extract.json`、`dify-report.json`：由
  `npm run dify:schema` 从 TypeScript 契约生成的输出 Schema（生成物，不手改）。

真实模式的行为边界：

- Key、基地址或允许的工作流版本缺失时失败关闭，**不自动回退 fixture**；
- 只有 `data.status === "succeeded"` 且输出通过结构契约校验才可用；
- HTTP 200 但工作流失败视为失败；
- 上游响应限制大小，超限或非法 JSON 一律拒绝，原始响应不交给 H5；
- 超时、空结果、结构错误、来源校验失败或请求取消最多自动重试一次，仍失败则停止；
- 取消传播到 HTTP 层；**不能保证**上游模型随即停止运行，该边界必须如实披露。

## 工作流设计

单个 Workflow 应用，用 `operation` 区分提取与报告，避免额外凭据。开始节点必须声明以下
四个字符串输入（缺任一个时可用性探测判定为不兼容）：

| 开始变量 | 类型 | 用途 |
| --- | --- | --- |
| `operation` | string | `extract` 或 `report` |
| `payload_json` | string | JSON 序列化后的操作输入（见下） |
| `contract_version` | string | 结构契约版本，当前为 `1.0` |
| `workflow_version` | string | 审查通过的工作流版本 |

节点：开始 → 按 operation 分支 → 对应 LLM 结构化输出 → 必要结构整理 → 输出。
输出节点统一映射为对象 `result`。若版本只能输出 JSON 字符串，后端解析一次并做校验，
不接受 Markdown 代码围栏、"自动修复"或猜测字段。

工作流草稿不直接生效。导出不含供应商凭据的 DSL、提示词与 Schema，记录审查版本；
发布应用后先做虚构数据测试，确认返回的工作流版本与允许版本一致
（`PM_DIFY_WORKFLOW_VERSION`）。

### 输入封装

`payload_json` 是后端生成的 JSON，顶层为元数据加 `operation` 与实际 `payload`：

```json
{
  "contractVersion": "1.0",
  "promptVersion": "actionable-analysis-v1",
  "workflowVersion": "审查通过的工作流版本",
  "requestId": "本次报告请求编号或随机编号",
  "snapshotVersion": 1,
  "snapshotHash": "…",
  "contentReleaseId": "release-trial-0001",
  "operation": "report",
  "payload": { "…": "见下" }
}
```

提取操作的 `snapshotVersion`、`snapshotHash`、`contentReleaseId` 为 `null`。
`payload` 对应 `CaseExtractionRequest` 或 `ReportGenerationRequest` 的类型定义，
实际字段以共享契约与生成 Schema 为准。

### 事实提取

`payload` 为 `{ "caseText": "…" }`。输出 `result` 对应 `CaseExtractionResult`，
顶层为 `matters` 数组，每个事项包含 `matterId`、`label` 与完整 `CandidateFact[]`。

提示词约束：仅从输入提取；不把推断变成确认事实；保留"未知""待核实"与不同说法；
同一事实的冲突说法使用一致争议分组；不合并互不相关事项；不凭空补充人物身份或行为。
`status` 只能是 `candidate` 或 `disputed`，`sourceRound` 必须为 `0`，
`confirmationMethod`、`confirmedAt`、`excludes`、`replacesFactId`、`supersededByFactId`
必须为初始值，`resolvesGapIds` 必须为空（缺口绑定只能由民警在补充流程中建立），
`category`、`categoryLabel`、`statusLabel`、`riskCategory` 必须取契约枚举内的值。

### 报告生成

`payload` 对应 `ReportGenerationRequest`：`requestId`、`facts`、`snapshot`、`legalSources`、
可选 `caseFocusId`、`unresolvedGapIds`、`gapBranches`、`alternativeDirections`、
`contentReleaseId`。`gapBranches` 已包含每个未解决缺口的"若…则…"条件与程序路径，
模型应围绕这些条件给出条件性分析，而不是只重复"信息不足"。

`result` 对应 `ReportGenerationResult`：`status`、`headline`、`participantBehaviorSummary`、
`factLimitations`、完整六模块 `modules`（含链路引用、结构化证据与询问要点字段）、
`documentTasks`、`contentReleaseId`、`workflowVersion`。

结构约束由生成 Schema 机械校验，重点包括：

- 六个模块 ID 齐全且不重复，`label` 与契约一致；
- `present` 模块的每条 `traceLinks` 至少引用一个当前事实，且 `factIds` 与
  `factReferences` 一一对应；`factReferences` 会被后端用快照事实覆盖，模型不得自行
  声称"已确认"；
- `formal_basis` 链路的 `basis` 必须逐字段匹配后端提供的当前有效法源（含条款原文、
  版本、地域、核验日期），`practical_check` 链路的 `basis` 必须为 `null`；
- 证据与询问模块只允许 `evidence_checklist` / `interview_points` 携带结构化项目，
  其优先级、掌握状态、角色名称必须取契约枚举；
- 文书任务只使用结构化条件，且 `boundaryStatement` 必须等于契约固定文案；
- `status === "complete"` 要求至少一条当前有效法源，且三个关键模块为 `present`。

法源仅使用本次后端提供且当前有效的受治理记录，不依赖模型记忆或联网补写。
不给模型生成或拼装正式文书的能力。证据临时核对标记不发送给 Dify。

### 输出封装

输出 `result` 必须是对象，包含与输入完全一致的元数据字段，外加 `result`：

```json
{
  "contractVersion": "1.0",
  "promptVersion": "actionable-analysis-v1",
  "workflowVersion": "审查通过的工作流版本",
  "requestId": "与输入一致",
  "snapshotVersion": 1,
  "snapshotHash": "与输入一致",
  "contentReleaseId": "与输入一致",
  "result": { "…": "对应操作的结果" }
}
```

任一字段与本次请求不一致、`promptVersion` 不是 `actionable-analysis-v1`、
报告正文字段与封装不一致时，后端丢弃该响应并失败关闭。

## 配置

```dotenv
PM_PROVIDER_MODE=dify
PM_ANALYSIS_ENABLED=on
PM_DIFY_BASE_URL=https://实际Dify域名/v1
PM_DIFY_API_KEY=实际应用Key
PM_DIFY_WORKFLOW_VERSION=审查通过的工作流版本
# 可选
PM_DIFY_MAX_RESPONSE_BYTES=524288
```

`PM_DIFY_BASE_URL` 必须是以 `/v1` 结尾的 HTTPS 地址，不得包含凭据、查询或片段。
`PM_ENABLE_TEST_CONTROLS` 只允许在非生产 `fixture` 模式启用，真实模式启用即启动失败。

## 允许开启分析的条件

- 真实提供者已实现、审查并提交版本库，健康/能力信息与真实可用状态一致。
- 可用性探测确认应用类型为 Workflow 且四个开始变量齐全；不使用运行模型的方式探测。
- 真实虚构场景提取和报告成功，快照绑定、引用校验及六模块结构符合现有契约。
- 空结果、无效 JSON、错误契约、上游 401/429/5xx、超时、取消、失效法源、版本错配、
  跨模块矛盾均按预期失败关闭，不展示半成品或 fixture 结果。
- 修改事实后旧报告失效且新报告绑定新快照；同时验证文书功能不因 Dify 故障失效。
- Key 不进入客户端产物或浏览器请求；隐私 canary 不进入日志、历史、知识库或遥测。
- Dify/模型供应商实际留存边界已核对并如实披露，试行所有者已决定适用数据范围；
  已说明取消不能保证上游立即停止处理。
- 项目测试及受控试行门槛完成；真实设备与角色记录不能由 AI 自动伪造通过。

以上完成后再将 `/etc/policymate/policymate.env` 的 `PM_ANALYSIS_ENABLED` 改为 `on`，
重启并用虚构数据做 HTTPS 验收。上线前后保留快速关闭方式；Dify 故障时关闭分析，
不把有效文书范例一并停用。

## 契约测试

`apps/server/test/dify-provider.test.ts` 覆盖：请求封装与随机 `user`、对象与单次 JSON
编码输出、逐字段版本错配、空/无效/不完整结构、HTTP 错误、200 但工作流失败、响应大小
限制、配置缺失、可用性探测契约、取消与超时重试，以及真实 API 端到端（提取 + 报告 +
文书范例不依赖模型）。修改工作流契约时必须同步更新该测试与生成 Schema。

真实环境验收：

```bash
npm run dify:schema   # 契约变化后重新生成 Schema 并提交
npm run dify:smoke    # 需要 PM_DIFY_* 配置；只打印非内容元数据
```
