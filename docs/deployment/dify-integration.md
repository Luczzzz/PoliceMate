# Dify 真实分析接入与验收

本文件是部署后的代码任务与契约说明，不是“配置密钥即可启用”的操作说明。基础设施流程见 [腾讯云部署](tencent-cloud-policymate-dify.md)。

## 当前实现

- `apps/server/src/index.ts`：构造 `createFixtureControls()`，没有真实 Dify HTTP 调用。
- `apps/server/src/config.ts`：`providerMode` 只有 `fixture`，预留基地址与单个 API Key。
- `apps/server/src/providers/types.ts`：事实提取与报告生成的 TypeScript 契约。
- `apps/server/src/analysis/engine.ts`：状态机、超时/重试及结果校验；接入时保留。
- `packages/contracts/src/index.ts`：完整候选事实、快照、六模块报告及法源类型。

实现和验收真实提供者前，生产式部署保持案情分析关闭。fixture 可用于开发/测试，不能向用户表述为真实模型分析。未来代码变更后，以实际已审查的代码为准更新此说明。

## 工作流设计

推荐先用一个 Workflow 应用区分两个操作，避免当前单 Key 配置无法对应两个应用。应用设计是建议，变量尚未被代码实现；实现前同步确定输入与输出 Schema。

| 开始变量 | 类型 | 用途 |
| --- | --- | --- |
| `operation` | string | `extract` 或 `report` |
| `payload_json` | string | JSON 序列化后的操作输入 |
| `contract_version` | string | 结构契约版本，当前 H5/后端为 `1.0` |
| `workflow_version` | string | 审查通过的工作流版本 |

节点：开始 → 按 operation 分支 → 对应 LLM 结构化输出 → 必要结构整理 → 输出。输出节点可统一映射为对象 `result`；如果版本只能输出 JSON 字符串，后端明确解析一次并做校验，不接受 Markdown 代码围栏、“自动修复”或猜测字段。

工作流草稿不直接生效。导出不含供应商凭据的 DSL、提示词与 Schema，记录审查版本；发布应用后先做测试，确认返回的工作流版本与允许版本一致。

### 事实提取

`payload_json` 内容对应 `CaseExtractionRequest`：

```json
{"caseText":"虚构测试：甲某与乙某发生口角，具体原因待核实。"}
```

`result` 内容对应 `CaseExtractionResult`，顶层为 `matters` 数组。每个事项包含 `matterId`、`label` 与完整 `CandidateFact[]`；具体字段、枚举、引用和长度限制从共享契约及 engine 校验提取，不使用只含两个字段的简化示例作为正式 Schema。

提示词约束：仅从输入提取；不把推断变成确认事实；保留“未知”“待核实”与不同说法；同一事实的冲突说法使用一致争议分组；不合并互不相关事项；不凭空补充人物身份或行为。

### 报告生成

`payload_json` 内容对应 `ReportGenerationRequest`：`facts`、`snapshot`、`legalSources` 及可选 `mode`。输入可能很长，检查 Dify 输入长度设置和模型上下文，不能静默截断。

`result` 内容对应 `ReportGenerationResult`：

- `status`、`headline`、`participantBehaviorSummary`、`factLimitations`。
- 完整六模块 `modules`，包括链路引用、结构化证据与询问要点字段。
- `documentTasks`、`contentReleaseId`、`workflowVersion`。

以代码为权威来源生成实际 JSON Schema。版本化封装还应携带契约版本、请求关联标识，报告响应回传快照版本/哈希，由后端校验后再映射为 provider 结果。当前 provider 结果类型没有这些所有封装字段，不能把设计建议冒充已实现类型。

法源仅使用本次后端提供且当前有效的受治理记录，不依赖模型记忆或随意联网补写。每项结论的事实 ID、法源记录与条款必须可匹配；未确认事实注明来源，决定性缺口以条件分支呈现。证据临时核对标记不发送给 Dify。不给模型生成或拼装正式文书的能力。

## 后端开发任务

1. 引入真实 provider 模式及配置校验，定义不含秘密的可用性探测。Key/URL 缺失、workflow 不兼容时失败关闭；真实模式不得自动回退 fixture。
2. 实现 `POST {PM_DIFY_BASE_URL}/workflows/run`，携带后端私有 Bearer Key，`inputs`、`response_mode: blocking` 与不含身份信息的随机 `user` 标识。
3. 限制上游响应大小，检查 HTTP 状态、`data.status === succeeded` 和输出结构。API 200 但 workflow failed 必须视为失败，原始响应不能直接交给 H5。
4. 把操作关联的契约、工作流、提示词、内容批次及快照版本绑定到请求/响应。校验引用与跨模块一致性，不兼容或迟到响应丢弃。
5. 将 AbortSignal 与 engine 取消/超时传播到 HTTP 层，保留事实提取 30 秒、报告 90 秒与最多一次自动重试。不要叠加 SDK 自动重试形成多次调用和重复计费。
6. 在入口按配置注入真实 analysis/dify 边界，保持受治理内容源、会话内存、失败处理与测试控制独立。供应商请求/响应正文、Key 和案情不进入日志/遥测。
7. 增加适配器契约测试和既有浏览器边界测试，代码审查后发布；不要只在服务器 current 目录修改却不回仓库留版本。

单 Workflow 可使用现有预留配置：

```dotenv
PM_DIFY_BASE_URL=https://实际Dify域名/v1
PM_DIFY_API_KEY=实际应用Key
```

若采用两个应用，需要新增提取/报告独立 Key 等配置，由实现确定变量名称。不要发明环境变量让运维误以为当前代码支持它。HTTPS 域名在同机可解析到 loopback，使用正常证书验证，不通过关闭 TLS 验证绕开问题。

## 允许开启分析的条件

- 真实提供者已实现、审查并提交版本库，健康/能力信息与真实可用状态一致。
- 真实虚构场景提取和报告成功，快照绑定、引用校验及六模块结构符合现有契约。
- 空结果、无效 JSON、错误契约、上游 401/429/5xx、超时、取消、失效法源、版本错配、跨模块矛盾均按预期失败关闭，不展示半成品或 fixture 结果。
- 修改事实后旧报告失效且新报告绑定新快照；同时验证文书功能不因 Dify 故障失效。
- Key 不进入客户端产物或浏览器请求；隐私 canary 不进入日志、历史、知识库或遥测。
- Dify/模型供应商实际留存边界已核对并如实披露，试行所有者已决定适用数据范围。
- 项目测试及受控试行门槛完成；真实设备与角色记录不能由 AI 自动伪造通过。

以上完成后再将 `/etc/policymate/policymate.env` 的 `PM_ANALYSIS_ENABLED` 改为 `on`，重启并用虚构数据做 HTTPS 验收。上线前后保留快速关闭方式；Dify 故障时关闭分析，不把有效文书范例一并停用。
