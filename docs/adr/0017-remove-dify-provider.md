# ADR-0017：移除 Dify，只保留直连模型提供者

- 状态：已接受
- 关联：取代 ADR-0010 第 1 条（“接入真实 Dify Workflow”）与 ADR-0014 中“Dify 模式暂时保留作回退”的部分；ADR-0012、ADR-0013、ADR-0015。

## 背景

ADR-0014 已新增 `PM_PROVIDER_MODE=llm` 直连模型，Dify 只作为回退保留，并约定“验收通过后删除 Dify 模式、工作流文档与 DSL 留档要求”。当前生产已切到直连模型（`llm` + 流式），Dify 在这套系统里只承担转发，没有证据表明有人需要在 Dify 界面里改提示词。继续保留会同时维护两套提示词与 Schema 真源、两套部署和排障路径，并挡住按段重试、分段并行等后端优化。

## 决策

1. 删除 Dify 提供者与 `PM_PROVIDER_MODE=dify`。提供者模式只剩 `fixture` 与 `llm`；生产默认 `llm`，开发默认 `fixture`，缺配置时失败关闭，不自动回退。
2. 删除 Dify 专属配置 `PM_DIFY_BASE_URL`、`PM_DIFY_API_KEY`、`PM_DIFY_WORKFLOW_VERSION`、`PM_DIFY_MAX_RESPONSE_BYTES`；真实模型只用 `PM_LLM_*`。
3. 提示词与输出 Schema 只来自仓库：`providers/prompts/*.txt` 直接作为提示词真源（由 `docs/deployment/dify-prompts/*.md` 生成的那一步随之取消），输出 Schema 由 `npm run schemas:generate` 从 TypeScript 契约生成，随代码提交。
4. 可用性判断不再有独立的外部边界对象：`CaseAnalysisProvider` 自身暴露 `getAvailability()`，首页入口可用性由它直接决定；流式能力检查仍在前端入口层完成。
5. 测试替身与浏览器黑盒测试的控制字段由 `difyAvailable` 改名为 `analysisAvailable`，含义不变。
6. 删除 Dify 专属文档（工作流搭建、接入验收、腾讯云 Dify 部署、提示词 Markdown）与 `dify:schema`、`dify:smoke` 脚本；后者改为 `schemas:generate` 与 `llm:smoke`。
7. 使用与数据说明中“内容提交与 Dify 处理”一节改为“内容提交与模型服务处理”，只描述实际存在的模型服务处理边界。

## 后果

- 仓库里只有一套提示词与 Schema 真源（ADR-0014 第 2 点的目标由第 3 点直接达成）。
- 部署配置必须从 `PM_DIFY_*` 迁到 `PM_LLM_*`；未迁移且 `PM_PROVIDER_MODE` 缺省时，生产会因缺少模型配置而让案情分析入口失败关闭，而不是静默回退。
- 历史部署日志 `docs/agents/deploy-agent-log.md` 保留原始记录，其中的 Dify 路径与脚本引用不再指向现存文件。
- 首次改用直连模型时的验收（ADR-0014 的“未验证与风险”：`json_schema` 支持、耗时、数据留存与训练政策）仍然有效，删除 Dify 不改变这些门槛。
