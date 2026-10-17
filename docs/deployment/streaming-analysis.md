# 流式纯文本分析部署说明（ADR-0015）

## 配置

- `PM_PROVIDER_MODE=llm`，并配置 `PM_LLM_BASE_URL`、`PM_LLM_API_KEY`、`PM_LLM_MODEL`（见 ADR-0014）。流式只由直连模型提供者支持；边界未实现流式时（如 `fixture`，或未来不支持流式的提供者），显式设置 `PM_REPORT_FORMAT=stream` 会让案情分析入口显示不可用，不会静默回退。
- `PM_REPORT_FORMAT=stream|structured`：未设置时 `llm` 默认 `stream`，`fixture` 默认 `structured`。设为 `structured` 即回退到结构化报告。
- `PM_STREAM_IDLE_TIMEOUT_MS`（默认 30000）：首字之后，上游连续这么久没有新内容就中断。它不管首字等待（ADR-0018）。
- `PM_STREAM_FIRST_TOKEN_TIMEOUT_MS`（默认 60000）：等待首字的独立预算；超时以 `first_token_timeout` 中断。部署侧实测公网首字 10.7–40.6 秒，故默认值高于空闲超时。
- `PM_REPORT_TIMEOUT_MS`（默认 90000）：整段输出的总时限，流式沿用。
- `PM_STREAM_MAX_CHARS`（默认 12000）：输出字符上限，到达即截断并标“内容不完整”。

## 缓冲检查（上线前必做）

后端对 `/api/v1/analysis/stream` 的响应已带 `X-Accel-Buffering: no` 与 `Cache-Control: no-cache`，Nginx 默认会遵守前者，所以现有站点配置不用改，`proxy_read_timeout 300s` 也够用。

但流式输出一旦被任何一层缓冲，就会攒到最后一起出现，等于白做，所以上线前要在真实环境确认文字是逐段到达的：

1. 在真实域名下，用浏览器提交一段较长案情，肉眼确认文字边生成边出现，而不是等十几秒后整段弹出。
2. 或用命令行：`curl -N -X POST https://<域名>/api/v1/analysis/stream -H 'x-pm-contract-version: 1.0' -H "x-pm-anonymous-token: $TOKEN" -H 'content-type: application/json' -d '{"caseText":"虚构案情"}'`，观察 `event: delta` 是否陆续打印。
3. 若请求链路上还有 CDN、负载均衡或 WAF（腾讯云常见），逐层检查是否开启了响应缓冲或压缩，必要时对 `/api/v1/analysis/stream` 关闭。
4. 若发现被缓冲，在 Nginx 对应 `location` 加 `proxy_buffering off;` 作为兜底。

检查结果记入 `docs/acceptance/manual-evidence.md`。

## 验收口径

在 ADR-0007 的基础上：首字延迟中位数 ≤ 10 秒；5 次运行的法条引用，用虚构案情逐条人工比对仓库法源并记录。
