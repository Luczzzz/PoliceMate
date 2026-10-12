import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hydrateReportDraft } from "../analysis/report-draft";
import type { AppConfig } from "../config";
import { parseTolerantJson, pruneToSchema } from "./tolerant-json";
import { DIFY_PROMPT_VERSION, readJsonBounded, validateExtract, validateReport } from "./contract";
import type {
  CaseAnalysisProvider,
  CaseExtractionRequest,
  CaseExtractionResult,
  DifyExtractionOutput,
  DifyProvider,
  DifyReportOutput,
  ReportGenerationRequest,
  ReportGenerationResult,
  ServiceAvailability,
} from "./types";

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_WORKFLOW_VERSION = "policymate-llm-v1.0.0";
const TEMPERATURE = 0.2;

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const PROMPTS = { extract: read("./prompts/extract-system.txt"), report: read("./prompts/report-system.txt") };
const SCHEMAS = {
  extract: JSON.parse(read("./schemas/dify-extract-result.json")) as object,
  report: JSON.parse(read("./schemas/dify-report-result.json")) as object,
};

export interface LlmProviderOptions {
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
  /** 容忍了末尾逗号或丢弃了自创字段时回调；只含操作名、是否修复和字段名，不含内容。 */
  onRepair?: (info: { operation: "extract" | "report"; trailingCommas: boolean; droppedKeys: string[] }) => void;
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
export function createLlmProvider(config: AppConfig, options: LlmProviderOptions = {}): DifyProvider & CaseAnalysisProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxResponseBytes ?? config.llmMaxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const workflowVersion = config.llmWorkflowVersion ?? DEFAULT_WORKFLOW_VERSION;

  const complete = async (operation: "extract" | "report", payload: unknown, signal?: AbortSignal): Promise<unknown> => {
    const availability = configured(config);
    if (!availability.available) throw new Error(availability.reason ?? "模型接口不可用。");
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
    const parsed = parseModelJson(completionContent(await readJsonBounded(response, maxBytes)));
    const pruned = pruneToSchema(parsed.value, SCHEMAS[operation] as Parameters<typeof pruneToSchema>[1]);
    if (parsed.repaired || pruned.dropped.length > 0) {
      options.onRepair?.({ operation, trailingCommas: parsed.repaired, droppedKeys: [...new Set(pruned.dropped)] });
    }
    return pruned.value;
  };

  return {
    async getAvailability() {
      return configured(config);
    },
    async extractCaseFacts(request: CaseExtractionRequest, signal?: AbortSignal): Promise<CaseExtractionResult> {
      const result = await complete("extract", { caseText: request.caseText }, signal);
      const envelope = {
        contractVersion: "1.0", promptVersion: DIFY_PROMPT_VERSION, workflowVersion, requestId: randomUUID(),
        snapshotVersion: null, snapshotHash: null, contentReleaseId: null, result,
      };
      if (!validateExtract(envelope)) throw new Error("模型输出未通过结构契约校验。");
      return (envelope as unknown as DifyExtractionOutput).result;
    },
    async generateReport(request: ReportGenerationRequest, signal?: AbortSignal): Promise<ReportGenerationResult> {
      const result = await complete("report", request, signal);
      const envelope = {
        contractVersion: "1.0", promptVersion: DIFY_PROMPT_VERSION, workflowVersion,
        requestId: request.requestId ?? randomUUID(),
        snapshotVersion: request.snapshot.snapshotVersion, snapshotHash: request.snapshot.snapshotHash,
        contentReleaseId: request.contentReleaseId ?? null, result,
      };
      if (!validateReport(envelope)) throw new Error("模型输出未通过结构契约校验。");
      return hydrateReportDraft((envelope as unknown as DifyReportOutput).result, {
        facts: request.facts,
        legalSources: request.legalSources,
        contentReleaseId: request.contentReleaseId ?? "",
        workflowVersion,
      });
    },
  };
}
