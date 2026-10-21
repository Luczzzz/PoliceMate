import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hydrateReportDraft } from "../analysis/report-draft";
import { DEFAULT_LLM_MAX_TOKENS, type AppConfig } from "../config";
import { parseTolerantJson, pruneToSchema } from "./tolerant-json";
import { ANALYSIS_PROMPT_VERSION, readJsonBounded, validateExtract, validateReport } from "./contract";
import type {
  AccidentLiabilityConsultOutput,
  AccidentLiabilityConsultRequest,
  AccidentLiabilityProvider,
  CaseAnalysisProvider,
  CaseExtractionRequest,
  CaseExtractionResult,
  ModelExtractionOutput,
  ModelReportOutput,
  ReportGenerationRequest,
  ReportGenerationResult,
  ServiceAvailability,
  StreamAnalysisRequest,
} from "./types";

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_WORKFLOW_VERSION = "policymate-llm-v1.0.0";
const TEMPERATURE = 0.2;

/**
 * 思考强度相关的可选请求字段（ADR-0020）。
 *
 * 默认两者都不发：请求体与未引入该能力时逐字节一致。网关不认识这些字段时通常
 * 直接 400，因此必须先跑 `npm run llm:thinking` 探测，再把确认可用的那一种写进
 * 环境变量，而不是在代码里同时发多种方言。
 */
function thinkingFields(config: AppConfig): Record<string, unknown> {
  if (config.llmThinkingDisabled === true) return { thinking: { type: "disabled" } };
  if (config.llmReasoningEffort !== undefined && config.llmReasoningEffort !== null) {
    return { reasoning_effort: config.llmReasoningEffort };
  }
  return {};
}

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

/** 条文节选长度：事故报告只需知道“这一条讲什么”，不需要全文（ADR-0019）。 */
export const ACCIDENT_ARTICLE_EXCERPT_CHARACTERS = 80;

/** 把条文原文裁剪为节选，并显式标注，避免模型把节选当成完整条文。 */
function excerptForPrompt(text: string): string {
  const characters = Array.from(text);
  return characters.length <= ACCIDENT_ARTICLE_EXCERPT_CHARACTERS
    ? text
    : `${characters.slice(0, ACCIDENT_ARTICLE_EXCERPT_CHARACTERS).join("")}…〔节选〕`;
}
const PROMPTS = {
  extract: read("./prompts/extract-system.txt"),
  report: read("./prompts/report-system.txt"),
  stream: read("./prompts/stream-system.txt"),
  accident: read("./prompts/accident-liability-system.txt"),
};
/** 只暴露提示词文本供单元测试断言口径；不参与运行路径。 */
export const PROMPT_FOR_TEST = PROMPTS;

const SCHEMAS = {
  extract: JSON.parse(read("./schemas/extract-result.json")) as object,
  report: JSON.parse(read("./schemas/report-result.json")) as object,
  accident: JSON.parse(read("./schemas/accident-liability-result.json")) as object,
};

type LlmOperation = "extract" | "report" | "accident";

export interface LlmProviderOptions {
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
  /** 容忍了末尾逗号或丢弃了自创字段时回调；只含操作名、是否修复和字段名，不含内容。 */
  onRepair?: (info: { operation: LlmOperation; trailingCommas: boolean; droppedKeys: string[] }) => void;
}

function configured(config: AppConfig): ServiceAvailability {
  if (config.providerMode !== "llm") return { available: false, reason: "当前未启用直连模型提供者。" };
  if (!config.llmBaseUrl) return { available: false, reason: "真实分析服务尚未配置模型接口地址。" };
  try {
    const url = new URL(config.llmBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, "").endsWith("/v1")) {
      throw new Error("invalid URL");
    }
  } catch {
    return { available: false, reason: "真实分析服务模型接口地址必须是以 /v1 结尾的 HTTPS 地址。" };
  }
  if (!config.llmApiKey) return { available: false, reason: "真实分析服务尚未配置模型接口密钥。" };
  if (!config.llmModel) return { available: false, reason: "真实分析服务尚未配置模型名称。" };
  return { available: true, reason: null };
}

/** 只接受纯 JSON；允许去掉一层代码围栏，其余内容一律报错。 */
function parseModelJson(content: string): { value: unknown; repaired: boolean } {
  let text = content.trim();
  if (text.startsWith("```")) {
    text = text.split("\n").slice(1).join("\n").trimEnd();
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();
  }
  if (text === "") throw new Error("模型未返回内容。");
  try {
    return parseTolerantJson(text);
  } catch {
    throw new Error("模型输出不是有效 JSON。");
  }
}

/** 上游思维链字段的字符数：`reasoning_content`（DeepSeek/vLLM）或 `reasoning`（OpenAI 风格）。 */
function reasoningCharsOf(holder: { reasoning_content?: unknown; reasoning?: unknown } | undefined): number {
  if (holder === undefined) return 0;
  const value = typeof holder.reasoning_content === "string" ? holder.reasoning_content : holder.reasoning;
  return typeof value === "string" ? Array.from(value).length : 0;
}

function completionContent(body: unknown): string {
  const choice = (body as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> } | null)?.choices?.[0];
  if (choice === undefined) throw new Error("模型响应缺少 choices。");
  if (choice.finish_reason === "length") throw new Error("模型输出被截断。");
  const content = choice.message?.content;
  if (typeof content !== "string") throw new Error("模型响应缺少内容。");
  return content;
}

/**
 * 直连 OpenAI 兼容 chat completions 的提供者（ADR-0014）。
 *
 * 提示词与输出 Schema 只来自仓库；模型只输出提取结果或报告草稿，封装元数据、
 * 补全与校验仍由后端完成。响应正文不写日志，密钥只存在于此闭包。
 */
export function createLlmProvider(
  config: AppConfig,
  options: LlmProviderOptions = {},
): CaseAnalysisProvider & AccidentLiabilityProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxResponseBytes ?? config.llmMaxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const workflowVersion = config.llmWorkflowVersion ?? DEFAULT_WORKFLOW_VERSION;

  const complete = async (
    operation: LlmOperation,
    payload: unknown,
    signal?: AbortSignal,
    onThinking?: (info: { reasoningChars: number }) => void,
  ): Promise<unknown> => {
    const availability = configured(config);
    if (!availability.available) throw new Error(availability.reason ?? "模型接口不可用。");
    const maxTokens =
      config.llmMaxTokens?.[operation] ?? DEFAULT_LLM_MAX_TOKENS[operation as keyof typeof DEFAULT_LLM_MAX_TOKENS];
    const responseFormat = config.llmResponseFormat === "json_object"
      ? { type: "json_object" }
      : { type: "json_schema", json_schema: { name: `policymate_${operation}`, strict: false, schema: SCHEMAS[operation] } };
    const response = await fetchImpl(`${config.llmBaseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.llmApiKey!}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.llmModel,
        temperature: TEMPERATURE,
        stream: false,
        // 只封顶不强制：输出超过预算会以 finish_reason=length 报错，不静默截断。
        max_tokens: maxTokens,
        ...thinkingFields(config),
        response_format: responseFormat,
        messages: [
          { role: "system", content: PROMPTS[operation] },
          { role: "user", content: JSON.stringify(payload) },
        ],
        user: `policymate-${randomUUID()}`,
      }),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`LLM HTTP ${response.status}。`);
    }
    const body = await readJsonBounded(response, maxBytes);
    // 推理型模型会把思维链放在 message.reasoning_content 里；它计入 max_tokens
    // 但不出现在正文，只统计字符数（不含内容）用于解释耗时与截断。
    const reasoningChars = reasoningCharsOf(
      (body as { choices?: Array<{ message?: { reasoning_content?: unknown; reasoning?: unknown } }> } | null)?.choices?.[0]?.message,
    );
    if (reasoningChars > 0) onThinking?.({ reasoningChars });
    const parsed = parseModelJson(completionContent(body));
    const pruned = pruneToSchema(parsed.value, SCHEMAS[operation] as Parameters<typeof pruneToSchema>[1]);
    if (parsed.repaired || pruned.dropped.length > 0) {
      options.onRepair?.({ operation, trailingCommas: parsed.repaired, droppedKeys: [...new Set(pruned.dropped)] });
    }
    return pruned.value;
  };

  /** 逐段读取 chat/completions 的 SSE，只产出 delta.content；不做结构校验（ADR-0015）。 */
  async function* streamAnalysis(request: StreamAnalysisRequest, signal?: AbortSignal): AsyncGenerator<string> {
    const availability = configured(config);
    if (!availability.available) throw new Error(availability.reason ?? "模型接口不可用。");
    const response = await fetchImpl(`${config.llmBaseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.llmApiKey!}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: config.llmModel,
        temperature: TEMPERATURE,
        stream: true,
        max_tokens: config.llmMaxTokens?.stream ?? DEFAULT_LLM_MAX_TOKENS.stream,
        ...thinkingFields(config),
        messages: [
          { role: "system", content: PROMPTS.stream },
          { role: "user", content: JSON.stringify({ caseText: request.caseText, legalSources: request.legalSources.map((source) => ({
            sourceId: source.sourceId, title: source.title, version: source.version, issuingAuthority: source.issuingAuthority,
            articles: source.articles.map((article) => ({ location: article.location, text: article.minimalText })),
          })) }) },
        ],
        user: `policymate-${randomUUID()}`,
      }),
      signal,
      redirect: "error",
    });
    if (!response.ok || response.body === null) {
      await response.body?.cancel();
      throw new Error(`LLM HTTP ${response.status}。`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let produced = false;
    // 思维链只计数：推理型模型先流 reasoning_content，正文之前的时间不是"卡住"。
    const streamStartedAt = performance.now();
    let reasoningChars = 0;
    let firstReasoningMs: number | undefined;
    const handleLine = (line: string): string | null => {
      if (!line.startsWith("data:")) return null;
      const data = line.slice(5).trim();
      if (data === "" || data === "[DONE]") return null;
      let event: { choices?: Array<{ finish_reason?: unknown; delta?: { content?: unknown } }> };
      try { event = JSON.parse(data); } catch { throw new Error("模型流式输出格式无效。"); }
      const choice = event.choices?.[0];
      if (choice?.finish_reason === "length") throw new Error("模型输出被截断。");
      const delta = choice?.delta as
        | { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }
        | undefined;
      const reasoning =
        typeof delta?.reasoning_content === "string" ? delta.reasoning_content
          : typeof delta?.reasoning === "string" ? delta.reasoning : "";
      if (reasoning !== "") {
        reasoningChars += Array.from(reasoning).length;
        firstReasoningMs ??= Math.round(performance.now() - streamStartedAt);
      }
      return typeof delta?.content === "string" && delta.content !== "" ? delta.content : null;
    };
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const piece = handleLine(line.trimEnd());
          if (piece !== null) { produced = true; yield piece; }
        }
      }
      buffer += decoder.decode();
      const tail = handleLine(buffer.trim());
      if (tail !== null) { produced = true; yield tail; }
    } finally {
      await reader.cancel().catch(() => undefined);
      if (reasoningChars > 0) {
        request.onThinking?.({ reasoningChars, ...(firstReasoningMs === undefined ? {} : { firstReasoningMs }) });
      }
    }
    if (!produced) throw new Error("模型未返回内容。");
  }

  return {
    streamAnalysis,
    async getAvailability() {
      return configured(config);
    },
    async extractCaseFacts(request: CaseExtractionRequest, signal?: AbortSignal): Promise<CaseExtractionResult> {
      const result = await complete("extract", { caseText: request.caseText }, signal);
      const envelope = {
        contractVersion: "1.0", promptVersion: ANALYSIS_PROMPT_VERSION, workflowVersion, requestId: randomUUID(),
        snapshotVersion: null, snapshotHash: null, contentReleaseId: null, result,
      };
      if (!validateExtract(envelope)) throw new Error("模型输出未通过结构契约校验。");
      return (envelope as unknown as ModelExtractionOutput).result;
    },
    async generateReport(request: ReportGenerationRequest, signal?: AbortSignal): Promise<ReportGenerationResult> {
      const result = await complete("report", request, signal);
      const envelope = {
        contractVersion: "1.0", promptVersion: ANALYSIS_PROMPT_VERSION, workflowVersion,
        requestId: request.requestId ?? randomUUID(),
        snapshotVersion: request.snapshot.snapshotVersion, snapshotHash: request.snapshot.snapshotHash,
        contentReleaseId: request.contentReleaseId ?? null, result,
      };
      if (!validateReport(envelope)) throw new Error("模型输出未通过结构契约校验。");
      return hydrateReportDraft((envelope as unknown as ModelReportOutput).result, {
        facts: request.facts,
        legalSources: request.legalSources,
        contentReleaseId: request.contentReleaseId ?? "",
        workflowVersion,
      });
    },
    /**
     * 事故责任认定辅助：把完整问答记录交给模型，由模型决定追问还是给报告。
     * 后端不预设问题分支；只校验输出形状（ADR-0016）。
     *
     * 法源分两档交给模型（ADR-0019）：
     * - `sourceScope`：只有法源名与效力信息、没有条款的法源，仅可用于方向提示；
     * - `citableArticles`：带逐字核验条文（此处只给节选）的法源，才可以写成确定引用。
     * 两档之外的法源一律不得出现在输出里，这比整批 20,800 字符的法源全文小一个量级。
     */
    async consultAccidentLiability(
      request: AccidentLiabilityConsultRequest,
      signal?: AbortSignal,
    ): Promise<AccidentLiabilityConsultOutput> {
      const sourceScope = request.legalSources
        .filter((source) => source.articles.length === 0)
        .map((source) => ({
          title: source.title,
          issuingAuthority: source.issuingAuthority,
          version: source.version,
          note: "仅可点名，不得写出条号或条文内容",
        }));
      const citableArticles = request.legalSources
        .filter((source) => source.articles.length > 0)
        .map((source) => ({
          title: source.title,
          version: source.version,
          issuingAuthority: source.issuingAuthority,
          articles: source.articles.map((article) => ({
            location: article.location,
            excerpt: excerptForPrompt(article.minimalText),
          })),
        }));
      const result = (await complete(
        "accident",
        {
          forceReport: request.forceReport,
          turns: request.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
          sourceScope,
          citableArticles,
        },
        signal,
        (info) => request.onThinking?.(info),
      )) as { kind?: unknown; text?: unknown } | null;
      if (
        result === null ||
        (result.kind !== "question" && result.kind !== "report") ||
        typeof result.text !== "string" ||
        result.text.trim() === ""
      ) {
        throw new Error("模型输出未通过事故问答结构校验。");
      }
      return { kind: result.kind, text: result.text };
    },
  };
}
