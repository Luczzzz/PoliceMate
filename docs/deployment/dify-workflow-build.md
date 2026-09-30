# Dify 工作流搭建任务（交给服务器 AI）

本文件是给在 Dify 控制台里操作的 AI 或运维人员的可执行任务说明。完成后，PoliceMate
后端即可通过 `POST /v1/workflows/run` 使用该工作流进行真实案情分析。

配套材料：

- 后端期望的输入/输出契约与验收条件：[dify-integration.md](dify-integration.md)
- 提取节点 System Prompt：[dify-prompts/extract-system.md](dify-prompts/extract-system.md)
- 报告节点 System Prompt：[dify-prompts/report-system.md](dify-prompts/report-system.md)
- LLM 结构化输出 Schema：`apps/server/src/providers/schemas/dify-extract-result.json`、
  `apps/server/src/providers/schemas/dify-report-result.json`
- 后端期望的完整输出封装 Schema（用于核对，不贴给 LLM）：
  `apps/server/src/providers/schemas/dify-extract.json`、`dify-report.json`

## 0. 纪律与边界

- **只用虚构案情测试**。输入不得包含真实姓名、身份证号、手机号、精确住址或真实案件材料。
- **不输出密钥**。应用 Key 只在服务器本地 `chmod 600` 的环境文件中，不打印、不粘贴到聊天或 GitHub。
- 不修改 PoliceMate 代码来迁就工作流；字段不匹配时改工作流。
- 不关闭模型供应商的插件签名校验，不关闭 Dify 的鉴权。
- 工作流必须先测试、后发布；不把草稿当作已发布版本，不伪造验收记录。
- 完成后如实报告：应用 ID、工作流版本字符串、模型名称、测试结果、未完成项。

## 1. 前置条件

- Dify 已部署并可登录（见 [腾讯云部署](tencent-cloud-policymate-dify.md)）。
- 已安装并测试通过至少一个支持**结构化输出 / JSON Schema** 的中文长上下文模型。
- 已确认模型供应商的数据留存与训练政策，并记录在受控试行说明中。

## 2. 创建应用

1. 新建应用，类型选择 **Workflow（工作流）**，不要选 Chatflow、Agent 或 Text Generator。
2. 应用命名建议 `policymate-analysis`；描述写明“程序辅助分析：候选事实提取与六模块报告”。
3. 不要启用会话记忆、引用知识库或联网工具；本工作流不使用聊天历史。
4. 不要给工作流挂任何知识库检索节点：法源一律由后端在 `payload_json` 中提供，
   模型不得从向量库或记忆中补写条文。

## 3. 开始节点变量

开始节点必须声明以下 **4 个字符串变量，全部必填、无默认值**。
缺任一个，PoliceMate 的可用性探测会判定工作流不兼容：

| 变量名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `operation` | string | 是 | `extract` 或 `report` |
| `payload_json` | string | 是 | 后端生成的操作输入（JSON 字符串） |
| `contract_version` | string | 是 | 结构契约版本，当前为 `1.0` |
| `workflow_version` | string | 是 | 审查通过的工作流版本字符串 |

不要增加其他开始变量。`user` 由后端在请求体中携带，不属于开始节点变量。

## 4. 节点一：`unwrap`（代码节点）

作用：把 `payload_json` 拆成干净的 `payload` 与 `metadata`，让 LLM 只看到载荷。

- 输入变量：`payload_json`（string，引用 `{{#start.payload_json#}}`）。
- 输出变量：`payload`（string）、`metadata`（string）。
- 代码（Python3）：

```python
import json

def main(payload_json: str) -> dict:
    data = json.loads(payload_json)
    if not isinstance(data, dict) or "payload" not in data:
        raise ValueError("payload_json 缺少 payload")
    keys = (
        "contractVersion", "promptVersion", "workflowVersion",
        "requestId", "snapshotVersion", "snapshotHash", "contentReleaseId",
    )
    metadata = {key: data.get(key) for key in keys}
    for key in ("contractVersion", "promptVersion", "workflowVersion", "requestId"):
        if not isinstance(metadata[key], str) or metadata[key] == "":
            raise ValueError("payload_json 缺少必填元数据：" + key)
    if metadata["promptVersion"] != "actionable-analysis-v1":
        raise ValueError("promptVersion 不受支持")
    return {
        "payload": json.dumps(data["payload"], ensure_ascii=False),
        "metadata": json.dumps(metadata, ensure_ascii=False),
    }
```

## 5. 节点二：条件分支（IF/ELSE）

- 条件：`{{#start.operation#}}` 等于 `extract` → 走提取分支；否则（等于 `report`）走报告分支。
- 两个分支之后都连到同一个 `wrap` 节点（见第 8 节）。

## 6. 节点三（提取分支）：`llm_extract`（LLM 节点）

- 模型：选择已在第 1 步测试通过的中文长上下文模型。
- 温度：偏低（0～0.3）。
- System Prompt：逐字使用 [dify-prompts/extract-system.md](dify-prompts/extract-system.md) 中
  “复制时从下一行开始”之后的内容。
- User 消息：`{{#unwrap.payload#}}`
- 输出：启用**结构化输出**，Schema 使用
  `apps/server/src/providers/schemas/dify-extract-result.json` 的完整内容。
  若当前模型不支持结构化输出，改为普通文本输出，并在第 8 节说明该节点输出的是 JSON 文本
  （`wrap` 节点会做严格解析）。

## 7. 节点四（报告分支）：`llm_report`（LLM 节点）

- 同第 6 节的模型与温度设置。
- System Prompt：逐字使用 [dify-prompts/report-system.md](dify-prompts/report-system.md) 中
  “复制时从下一行开始”之后的内容。
- User 消息：`{{#unwrap.payload#}}`
- 输出：启用结构化输出，Schema 使用
  `apps/server/src/providers/schemas/dify-report-result.json` 的完整内容。

报告输入可能很长（含事实、法源原文与缺口分支）。检查模型上下文窗口与 Dify 的输入长度
设置，**不得静默截断**；超限时应在 Dify 侧报错，而不是丢掉法源或事实。

## 8. 节点五：`wrap`（代码节点，两个分支汇合）

作用：严格解析 LLM 输出，补上后端要求的封装元数据，并把 `result` 序列化为字符串。

- 输入变量：
  - `operation`（string，引用 `{{#start.operation#}}`）
  - `metadata`（string，引用 `{{#unwrap.metadata#}}`）
  - `extract_output`（string，引用 `{{#llm_extract.text#}}`；结构化输出时引用其文本或对象序列化结果，
    以实际节点输出变量名为准）
  - `report_output`（string，引用 `{{#llm_report.text#}}`）
- 输出变量：`result`（string）
- 代码（Python3）：

```python
import json

def main(operation: str, metadata: str, extract_output: str = "", report_output: str = "") -> dict:
    meta = json.loads(metadata)
    raw = extract_output if operation == "extract" else report_output
    text = (raw or "").strip()
    # 只接受纯 JSON；允许去掉一层代码围栏，其余内容一律报错。
    if text.startswith("```"):
        parts = text.split("\n", 1)
        text = parts[1] if len(parts) > 1 else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    text = text.strip()
    if text == "":
        raise ValueError("LLM 未返回内容")
    try:
        result = json.loads(text)
    except Exception as error:
        raise ValueError("LLM 输出不是有效 JSON") from error
    if not isinstance(result, dict):
        raise ValueError("LLM 输出不是 JSON 对象")
    if operation == "report":
        # 版本与批次以后端输入为准，避免模型改写。
        result["workflowVersion"] = meta["workflowVersion"]
        result["contentReleaseId"] = meta["contentReleaseId"]
    envelope = {
        "contractVersion": meta["contractVersion"],
        "promptVersion": meta["promptVersion"],
        "workflowVersion": meta["workflowVersion"],
        "requestId": meta["requestId"],
        "snapshotVersion": meta["snapshotVersion"],
        "snapshotHash": meta["snapshotHash"],
        "contentReleaseId": meta["contentReleaseId"],
        "result": result,
    }
    return {"result": json.dumps(envelope, ensure_ascii=False)}
```

说明：

- 任一分支未执行时，其输入变量为空字符串；代码按 `operation` 选择，不会误用另一分支的输出。
- 解析失败、字段缺失或 `promptVersion` 异常都直接抛错，让工作流失败；**不要**在这里补写、
  猜测或“自动修复”字段。PoliceMate 对失败的响应是失败关闭，不会展示半成品。
- 如果当前 Dify 版本不支持两个分支汇合到同一节点，改为在“结束”节点前各接一个 `wrap`
  节点，并让结束节点输出变量 `result` 分别引用两个 `wrap` 的输出。

## 9. 节点六：结束节点

- 输出变量：`result`（string），引用 `{{#wrap.result#}}`。
- 不要输出其他变量；后端只读取 `data.outputs.result`。

## 10. 发布与凭据

1. 先保存草稿，用第 11 节的虚构请求分别验证 `extract` 与 `report`。
2. 验证通过后再**发布**工作流；API 调用的是已发布版本。
3. 在“访问 API / API 文档”页创建应用 Key。
4. 在工作流中确定一个版本字符串（例如 `policymate-analysis-v1.0.0`），它会被
   `workflow_version` 原样回传；把同一个值写入服务器环境变量 `PM_DIFY_WORKFLOW_VERSION`。
   修改 Prompt、Schema、节点逻辑或模型后必须提升该字符串，并重新测试。
5. 服务器环境文件（`chmod 600`）追加：

```dotenv
PM_PROVIDER_MODE=dify
PM_ANALYSIS_ENABLED=on
PM_DIFY_BASE_URL=https://实际Dify域名/v1
PM_DIFY_API_KEY=实际应用Key
PM_DIFY_WORKFLOW_VERSION=policymate-analysis-v1.0.0
```

## 11. 验收

### 11.1 直接调用 Dify（虚构数据）

```bash
set +x
SMOKE_DIR=$(mktemp -d); chmod 700 "$SMOKE_DIR"
read -r -s -p 'Dify 应用 API Key: ' DIFY_KEY; printf '\n'
umask 077
printf 'header = "Authorization: Bearer %s"\n' "$DIFY_KEY" > "$SMOKE_DIR/curl.conf"
unset DIFY_KEY
cat > "$SMOKE_DIR/payload.json" <<'JSON'
{"contractVersion":"1.0","promptVersion":"actionable-analysis-v1","workflowVersion":"policymate-analysis-v1.0.0","requestId":"smoke-0001","snapshotVersion":null,"snapshotHash":null,"contentReleaseId":null,"operation":"extract","payload":{"caseText":"虚构测试：3月2日晚，甲某在虚构酒店门口殴打乙某，乙某手部擦伤。"}}
JSON
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));fs.writeFileSync(process.argv[2],JSON.stringify({inputs:{operation:p.operation,payload_json:JSON.stringify(p),contract_version:p.contractVersion,workflow_version:p.workflowVersion},response_mode:"blocking",user:"policymate-smoke"},null,2))' "$SMOKE_DIR/payload.json" "$SMOKE_DIR/request.json"
curl --config "$SMOKE_DIR/curl.conf" --fail-with-body --silent --show-error --max-time 120 \
  -H 'Content-Type: application/json' --data-binary @"$SMOKE_DIR/request.json" \
  "https://实际Dify域名/v1/workflows/run" --output "$SMOKE_DIR/response.json"
node -e 'const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(b.data?.status!=="succeeded"){console.error("工作流失败:",b.data?.status);process.exit(1)}const env=typeof b.data.outputs.result==="string"?JSON.parse(b.data.outputs.result):b.data.outputs.result;const ok=env.contractVersion==="1.0"&&env.promptVersion==="actionable-analysis-v1"&&env.requestId==="smoke-0001"&&Array.isArray(env.result?.matters)&&env.result.matters.length>0;console.log(ok?"提取封装校验通过":"提取封装校验失败");process.exit(ok?0:1)' "$SMOKE_DIR/response.json"
rm -f "$SMOKE_DIR"/curl.conf "$SMOKE_DIR"/*.json; rmdir "$SMOKE_DIR"
```

`report` 操作按同样方式发送，把 `operation` 换成 `report`、`payload` 换成最小
`ReportGenerationRequest`（含 `facts`、`snapshot`、`legalSources`、`gapBranches`），
并确认返回值含六个模块。更完整的端到端校验用 11.2。

### 11.2 通过 PoliceMate 后端端到端

在仓库目录执行（只使用虚构案情，脚本不打印案情与密钥）：

```bash
PM_PROVIDER_MODE=dify \
PM_ANALYSIS_ENABLED=on \
PM_DIFY_BASE_URL=https://实际Dify域名/v1 \
PM_DIFY_API_KEY=... \
PM_DIFY_WORKFLOW_VERSION=policymate-analysis-v1.0.0 \
npm run dify:smoke
```

脚本会做可用性探测、提取、生成报告，并打印模块状态、缺口数量与链路数量等非内容元数据；
任一失败以非零退出码结束。

### 11.3 必须确认的失败关闭行为

逐项验证并记录，任一不符合即视为未通过：

- [ ] 缺少 `PM_DIFY_API_KEY`、`PM_DIFY_WORKFLOW_VERSION` 或地址非 HTTPS（或非 `/v1` 结尾）时，
      可用性为不可用，且不发起 HTTP 调用；
- [ ] 开始节点缺少四个变量之一时，可用性探测判定不兼容；
- [ ] 上游返回 `data.status !== "succeeded"`（例如故意把 Prompt 改坏）→ 失败关闭，不展示半成品；
- [ ] 上游返回非法 JSON 或缺少 `result` → 失败关闭；
- [ ] `workflow_version` 与 `PM_DIFY_WORKFLOW_VERSION` 不一致 → 响应被丢弃；
- [ ] 报告返回了 `legalSources` 之外的法规或条号 → 后端校验拒绝；
- [ ] 把 `promptVersion` 改成其他值 → 响应被丢弃；
- [ ] 取消页面请求或确认新快照后，迟到的报告不会写回页面。

### 11.4 仓库留档

本仓库不预先提供未经导入验证的 DSL：工作流 DSL 与 Dify 版本强绑定，未在目标版本导入
验证过的 DSL 可能直接失败。必须由完成搭建的一方导出实际 DSL 后提交。

1. 导出不含供应商凭据的 DSL，提交到 `docs/deployment/dify-workflow.dsl.yml`。
2. 在 [dify-integration.md](dify-integration.md) 记录：应用 ID、工作流版本字符串、模型名称与版本、
   Prompt 版本 `actionable-analysis-v1`、测试日期与结果、DSL 导出日期。
3. 若改动了 Prompt 文件，同步提升后端 `DIFY_PROMPT_VERSION`
   （`apps/server/src/providers/dify.ts`）并重新执行 11.2 与仓库测试。
4. 若改动契约或类型，运行 `npm run dify:schema` 重新生成 Schema 并一起提交。

## 12. 常见问题

| 现象 | 处理 |
| --- | --- |
| PoliceMate 报告“真实分析服务连接或工作流输入契约不可用” | 检查 `/v1` 基地址、应用 Key、应用类型是否为 Workflow、开始节点四个变量名是否完全一致 |
| 工作流成功但后端报“输出未通过结构契约校验” | 按对应的 `dify-*-result.json`/`dify-*.json` Schema 逐字段核对；不要放宽后端校验 |
| 后端报“输出版本或请求绑定不匹配” | `wrap` 节点必须原样回传 `requestId`、`contractVersion`、`promptVersion`、`workflowVersion`、`snapshotVersion`、`snapshotHash`、`contentReleaseId` |
| 报告缺模块或模块名为空 | 六模块 `id` 与 `label` 必须齐全且与 Prompt 中的对照表一致 |
| 报告缺少有效链路 | `traceLinks[].factIds` 必须引用本次 `facts` 中的未排除事实；`formal_basis` 必须逐字段复制 `legalSources` |
| 模型不支持结构化输出 | 使用普通文本输出，依赖 `wrap` 节点严格解析；仍不接受围栏外的解释性文字 |
| 报告很长或超时 | 检查模型上下文与 Dify 超时；PoliceMate 报告预算为 90 秒（含一次重试），提取为 30 秒 |

## 13. 给服务器 AI 的复制粘贴指令

把下面整段发给服务器上的 AI，并把 `<所有者批准的提交SHA>` 换成所有者批准部署（或至少
允许读取）的提交；读取本文件时不要切换到该提交去运行服务，只读文件即可。

```text
你现在要在服务器上的 Dify 里搭建 PoliceMate 的案情分析工作流。严格遵守以下要求。

【先读文档，不要凭印象搭建】
1. git fetch origin，然后只读方式查看以下文件（不要部署、不要切换运行目录）：
   git show <所有者批准的提交SHA>:docs/deployment/dify-workflow-build.md
   git show <所有者批准的提交SHA>:docs/deployment/dify-integration.md
   git show <所有者批准的提交SHA>:docs/deployment/dify-prompts/extract-system.md
   git show <所有者批准的提交SHA>:docs/deployment/dify-prompts/report-system.md
   git show <所有者批准的提交SHA>:apps/server/src/providers/schemas/dify-extract-result.json
   git show <所有者批准的提交SHA>:apps/server/src/providers/schemas/dify-report-result.json
2. 按 dify-workflow-build.md 第 2 至 10 节搭建：Workflow 类型应用、开始节点 4 个字符串变量
   （operation、payload_json、contract_version、workflow_version）、unwrap 代码节点、
   operation 条件分支、两个 LLM 节点（System Prompt 与结构化输出 Schema 逐字照抄指定文件）、
   wrap 代码节点、结束节点输出 result。
3. 节点代码、变量名、Prompt、Schema 一律照抄，不要自行改写字段名或"优化"提示词。

【边界，不可违反】
- 只用虚构案情测试。不得输入真实姓名、身份证号、手机号、住址或真实案件材料。
- 不输出、不粘贴应用 Key 或任何密钥到聊天、日志或 GitHub；Key 只在服务器本地权限 600 的文件里。
- 不为了"跑通"而放宽 Schema、关闭结构化校验、关闭鉴权或插件签名校验。
- 不改 PoliceMate 仓库代码来迁就工作流；字段不匹配时改工作流。
- 不把草稿当已发布版本，不伪造验收记录；未验证的项如实报告为未验证。
- 模型供应商账号、Key 采购与数据留存政策由所有者确认；缺失时停下来向我索取，不要虚构。

【验收，逐项给出证据】
- 用虚构案情分别验证 extract 与 report 两个 operation，确认返回的 result 是完整封装，
  且 contractVersion、promptVersion、requestId、workflowVersion、snapshotVersion、
  snapshotHash、contentReleaseId 与输入一致。
- 发布工作流、创建应用 Key，并在服务器权限 600 的环境文件中配置
  PM_PROVIDER_MODE=dify、PM_ANALYSIS_ENABLED=on、PM_DIFY_BASE_URL=https://真实域名/v1、
  PM_DIFY_API_KEY、PM_DIFY_WORKFLOW_VERSION（与工作流回传的版本串一致）。
- 在所有者批准部署的 PoliceMate 提交上运行 npm run dify:schema 与 npm run dify:smoke，
  报告非内容元数据结果（状态、模块数、缺口与链路数量）；该脚本不打印案情与密钥。
- 按 dify-workflow-build.md 第 11.3 节逐条验证失败关闭行为（缺 Key、版本错配、上游失败、
  非法结构、迟到响应），每条给出通过/失败与证据。
- 按第 11.4 节留档：导出不含凭据的 DSL 到 docs/deployment/dify-workflow.dsl.yml，
  在 dify-integration.md 记录应用 ID、工作流版本串、模型名称与版本、Prompt 版本
  actionable-analysis-v1、测试日期与结果。

【交付报告格式】
只报告：应用 ID、工作流版本串、模型名称与版本、Dify tag/commit、验收逐项通过/失败与证据、
DSL 与文档提交情况、未完成项与阻塞原因。不要粘贴案情正文、报告正文、密钥或原始上游响应。
PoliceMate 的案情分析开关在所有者明确批准前保持关闭。
```
