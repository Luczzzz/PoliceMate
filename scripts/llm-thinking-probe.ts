import { loadConfig } from "../apps/server/src/config";

/**
 * 思考强度探测（ADR-0020）。
 *
 * 目的：在打开任何"降低思考强度"的开关之前，先确认**上游网关接受哪一种方言**。
 * OpenAI 兼容层对未知字段的常见反应是直接 400，而这个仓库已经在 `json_schema` 上
 * 踩过一次（部署日志 6.4）。所以这里逐个变体单独试，只打印非内容元数据：
 * HTTP 状态、是否出现思维链、思维链字符数、首个思维链/正文 token 的到达时间。
 *
 * 用法：
 *   PM_LLM_BASE_URL=... PM_LLM_API_KEY=... PM_LLM_MODEL=... npm run llm:thinking
 *
 * 任一变体被接受且确实减少了思维链，就该把它对应的环境变量写进部署配置：
 *   `reasoning_effort` 可用 → PM_LLM_REASONING_EFFORT=minimal（或 low）
 *   `thinking:{type:disabled}` 可用 → PM_LLM_THINKING=off
 */

/** 只用来逼出"短回答 + 明显需要推理"的提示，不含任何案情。 */
const PROBE_PROMPT = "用一句话回答：一个数加它自己等于 10，这个数是多少？只给数字。";

interface Variant {
  label: string;
  fields: Record<string, unknown>;
  env: string;
}

const VARIANTS: Variant[] = [
  { label: "baseline（不发思考字段）", fields: {}, env: "（默认，无需配置）" },
  { label: 'reasoning_effort: "minimal"', fields: { reasoning_effort: "minimal" }, env: "PM_LLM_REASONING_EFFORT=minimal" },
  { label: 'reasoning_effort: "low"', fields: { reasoning_effort: "low" }, env: "PM_LLM_REASONING_EFFORT=low" },
  { label: 'thinking: {type:"disabled"}', fields: { thinking: { type: "disabled" } }, env: "PM_LLM_THINKING=off" },
  { label: "enable_thinking: false", fields: { enable_thinking: false }, env: "（本仓库未接线，仅探测网关是否接受）" },
  {
    label: "chat_template_kwargs: {enable_thinking:false}",
    fields: { chat_template_kwargs: { enable_thinking: false } },
    env: "（本仓库未接线，仅探测网关是否接受）",
  },
];

interface ProbeResult {
  status: number;
  reasoningChars: number;
  firstReasoningMs?: number;
  firstContentMs?: number;
  totalMs: number;
  contentChars: number;
  errorCode?: string;
}

function fail(message: string): never {
  console.error(`[llm:thinking] 未通过：${message}`);
  process.exit(1);
}

async function probe(
  baseUrl: string,
  apiKey: string,
  model: string,
  fields: Record<string, unknown>,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2,
      max_tokens: 512,
      messages: [{ role: "user", content: PROBE_PROMPT }],
      ...fields,
    }),
    redirect: "error",
  });
  if (!response.ok || response.body === null) {
    await response.body?.cancel();
    return {
      status: response.status,
      reasoningChars: 0,
      totalMs: Math.max(1, Math.round(performance.now() - startedAt)),
      contentChars: 0,
      errorCode: `HTTP ${response.status}`,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reasoningChars = 0;
  let contentChars = 0;
  let firstReasoningMs: number | undefined;
  let firstContentMs: number | undefined;

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") return;
    let event: { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }> };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const delta = event.choices?.[0]?.delta;
    const reasoning =
      typeof delta?.reasoning_content === "string" ? delta.reasoning_content
        : typeof delta?.reasoning === "string" ? delta.reasoning : "";
    if (reasoning !== "") {
      reasoningChars += Array.from(reasoning).length;
      firstReasoningMs ??= Math.round(performance.now() - startedAt);
    }
    if (typeof delta?.content === "string" && delta.content !== "") {
      contentChars += Array.from(delta.content).length;
      firstContentMs ??= Math.round(performance.now() - startedAt);
    }
  };

  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line.trimEnd());
    }
    handleLine(buffer.trim());
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return {
    status: response.status,
    reasoningChars,
    ...(firstReasoningMs === undefined ? {} : { firstReasoningMs }),
    ...(firstContentMs === undefined ? {} : { firstContentMs }),
    totalMs: Math.max(1, Math.round(performance.now() - startedAt)),
    contentChars,
  };
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.llmBaseUrl || !config.llmApiKey || !config.llmModel) {
    fail("缺少 PM_LLM_BASE_URL、PM_LLM_API_KEY 或 PM_LLM_MODEL。");
  }
  console.log(`[llm:thinking] 目标 ${config.llmBaseUrl}，模型 ${config.llmModel}，共 ${VARIANTS.length} 个变体。`);
  console.log("[llm:thinking] 只打印状态与耗时，不打印任何上游正文。\n");

  const rows: Array<{ variant: Variant; result: ProbeResult }> = [];
  for (const variant of VARIANTS) {
    // 逐个串行：并发会互相争抢上游配额，把"思考时间"和"排队时间"混在一起。
    const result = await probe(config.llmBaseUrl, config.llmApiKey, config.llmModel, variant.fields);
    rows.push({ variant, result });
    const verdict =
      result.errorCode !== undefined
        ? `被拒绝（${result.errorCode}）`
        : result.reasoningChars === 0
          ? "接受，无思维链"
          : `接受，思维链 ${result.reasoningChars} 字符`;
    console.log(`- ${variant.label}：${verdict}`);
    console.log(
      `    首个思维链 ${result.firstReasoningMs ?? "—"} ms／首个正文 ${result.firstContentMs ?? "—"} ms／` +
        `总 ${result.totalMs} ms／正文 ${result.contentChars} 字符`,
    );
  }

  const baseline = rows[0].result;
  const accepted = rows.filter((row) => row.result.errorCode === undefined);
  console.log("");
  if (accepted.length <= 1) {
    console.log("[llm:thinking] 结论：除 baseline 外没有变体被接受——这个网关不吃任何思考强度字段。");
    console.log("[llm:thinking] 可选路径：① 换非推理版模型；② 让网关侧支持这些字段；③ 接受现状，只做感知延迟优化。");
    return;
  }
  if (baseline.reasoningChars === 0) {
    console.log("[llm:thinking] 结论：baseline 就没有思维链——当前模型不是推理模型，思考强度开关无意义。");
    console.log("[llm:thinking] 这也意味着首字慢的原因不在思考，请改看载荷与上游排队。");
    return;
  }
  const reduced = accepted
    .slice(1)
    .filter((row) => row.result.reasoningChars < baseline.reasoningChars);
  if (reduced.length === 0) {
    console.log("[llm:thinking] 结论：字段被接受，但思维链长度没变——降低思考强度对这个模型无效。");
    return;
  }
  console.log("[llm:thinking] 结论：以下变体确实减少了思维链，按需写入部署配置：");
  for (const row of reduced) {
    const save = row.result.totalMs - baseline.totalMs;
    console.log(
      `  · ${row.variant.label} → ${row.variant.env}｜思维链 ${baseline.reasoningChars} → ${row.result.reasoningChars} 字符｜总耗时变化 ${save} ms`,
    );
  }
  console.log("");
  console.log("[llm:thinking] 提醒：降低思考强度会提高条号写错与漏引的概率。切换前后请对比报告里");
  console.log("「〔条号未经核对〕」出现的次数——它是这条取舍唯一可测的质量指标。");
}

await main();
