# ADR-0014：新增直连模型模式，逐步替代 Dify

- 状态：已接受；其中“Dify 模式暂时保留作回退”已被 ADR-0017 取代（Dify 已移除）
- 关联：ADR-0010 第 1 条（“接入真实 Dify Workflow”）被部分取代；ADR-0012、ADR-0013。

## 背景

Dify 在这套系统里只承担转发：工作流只有拆包、分支、两个 LLM 节点、封装和结束，非 LLM 节点合计约 0.16 秒；法源由后端提供，不用知识库；契约由后端 Schema 校验。代价是提示词和 Schema 在仓库与 Dify 节点里各有一份，每次改版都要部署端手工同步（ADR-0012、0013 都因此需要部署端配合，旧工作流被拒），还多一套要部署和排障的系统。同时 Dify 也挡住了按段重试、分段并行、流式进度这类后端能做的优化。没有证据表明有人需要在 Dify 界面里改提示词。

## 决策

1. 新增 `PM_PROVIDER_MODE=llm`，由 `providers/llm.ts` 直接调用 OpenAI 兼容的 `chat/completions`。`dify` 与 `fixture` 模式不变，三者显式分离，缺配置时失败关闭，不自动回退。
2. 提示词与输出 Schema 只来自仓库：`providers/prompts/*.txt` 直接作为提示词真源，输出 Schema 由 `npm run schemas:generate` 生成（两者都需随代码提交），运行时读取，不再有第二份。
3. 沿用同一模型与供应商，`temperature=0.2`。结构化输出默认用 `response_format: json_schema`；接口不支持时设 `PM_LLM_RESPONSE_FORMAT=json_object`，仍由后端 Schema 校验。
4. 与 Dify 模式共用同一套结构契约与 ADR-0013 的补全：模型只写提取结果或报告草稿，后端封装元数据、校验、补全。提示词版本沿用 `actionable-analysis-v3`。
5. 可用性只做本地配置检查（地址须为以 `/v1` 结尾的 HTTPS、密钥、模型名），不再探测上游，因此“可用”不保证上游当前可达，由请求时失败关闭兜底。
6. 解析失败、截断（`finish_reason=length`）、结构不符都抛错，由引擎既有的“最多重试一次”处理。

7. **容错两类已知偏差**（部署端日志第五节：事件 5、6）：解析前删除字符串之外、紧随 `]`/`}` 的多余逗号（修复后仍须能解析）；校验前按输出 Schema 白名单丢弃模型自创字段，已知字段内容不改。两者发生时通过 `onRepair` 回调记一条只含操作名、是否修复、被丢弃字段名的 `console.warn`，不含内容，避免悄悄掩盖质量问题。副作用：模型回抄的法条多余字段也会被丢弃，条文始终以仓库法源为准（ADR-0013）。这取代了此前“Dify `wrap` 节点热修”在直连模式下缺失的状态。

## 配置

`PM_LLM_BASE_URL`（如 `https://…/v1`）、`PM_LLM_API_KEY`、`PM_LLM_MODEL`；可选 `PM_LLM_WORKFLOW_VERSION`（报告上的版本标注，默认 `policymate-llm-v1.0.0`）、`PM_LLM_RESPONSE_FORMAT`、`PM_LLM_MAX_RESPONSE_BYTES`（默认 1 MiB）。密钥只放在服务器本地环境文件。

## 未验证与风险

- 单元测试只用模拟接口。真实供应商对 `json_schema`（含 `$ref`/`definitions`）的支持**尚未实测**，上线前必须用虚构案情实测，不行就切 `json_object`。
- 迁移需重新做受控试行验收（ADR-0007）：至少 5 次、含短长案情，报告耗时中位 ≤ 90 秒、最大 ≤ 150 秒，并核对数据留存与训练政策未因密钥改持有方而变化。
- 每次尝试的时限仍是 `PM_REPORT_TIMEOUT_MS / 2`。

## 后续

Dify 模式、工作流文档与 DSL 留档要求已由 ADR-0017 删除；再评估分段并行与按段重试。
