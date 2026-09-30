import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import type { DifyExtractionOutput, DifyReportOutput } from "./types";

export const DIFY_PROMPT_VERSION = "actionable-analysis-v1";
const ajv = new Ajv({ allErrors: false, allowUnionTypes: true });
const extractSchema = JSON.parse(readFileSync(new URL("./schemas/dify-extract.json", import.meta.url), "utf8"));
const reportSchema = JSON.parse(readFileSync(new URL("./schemas/dify-report.json", import.meta.url), "utf8"));
const validateExtract = ajv.compile<DifyExtractionOutput>(extractSchema);
const validateReport = ajv.compile<DifyReportOutput>(reportSchema);
import type {
  CaseAnalysisProvider,
  CaseExtractionRequest,
  CaseExtractionResult,
  DifyProvider,
  ReportGenerationRequest,
  ReportGenerationResult,
  ServiceAvailability,
} from "./types";
import type { AppConfig } from "../config";

const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DIFY_WORKFLOW_PATH = "/workflows/run";

export interface DifyProviderOptions {
  fetchImpl?: typeof fetch;
  maxResponseBytes?: number;
}

function configured(config: AppConfig): ServiceAvailability {
  if (config.providerMode !== "dify") {
    return { available: false, reason: "当前未启用真实 Dify 提供者。" };
  }
  if (config.difyBaseUrl === null || config.difyBaseUrl === undefined || config.difyBaseUrl === "") {
    return { available: false, reason: "真实分析服务尚未配置 Dify 基地址。" };
  }
  try {
    const url = new URL(config.difyBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, "").endsWith("/v1")) {
      throw new Error("invalid URL");
    }
  } catch {
    return { available: false, reason: "真实分析服务基地址必须是以 /v1 结尾的 HTTPS 地址。" };
  }
  if (config.difyApiKey === null || config.difyApiKey === undefined || config.difyApiKey === "") {
    return { available: false, reason: "真实分析服务尚未配置 Dify 应用密钥。" };
  }
  if (config.difyWorkflowVersion === null || config.difyWorkflowVersion === undefined || config.difyWorkflowVersion === "") {
    return { available: false, reason: "真实分析服务尚未配置允许的工作流版本。" };
  }
  return { available: true, reason: null };
}

function parseResultOutput(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error("Dify 输出不是有效 JSON。");
    }
  }
  return value;
}

async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Dify 响应超过大小限制。");
  }
  if (response.body === null) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Dify 响应超过大小限制。");
    return JSON.parse(text) as unknown;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Dify 响应超过大小限制。");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function responseOutput(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Dify 响应结构无效。");
  }
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Dify 响应缺少工作流结果。");
  }
  const record = data as { status?: unknown; error?: unknown; outputs?: unknown };
  if (record.status !== "succeeded") {
    throw new Error("Dify 工作流未成功完成。");
  }
  if (typeof record.outputs !== "object" || record.outputs === null || Array.isArray(record.outputs)) {
    throw new Error("Dify 成功响应缺少 outputs。");
  }
  const result = (record.outputs as { result?: unknown }).result;
  if (result === undefined) throw new Error("Dify 输出缺少 result 字段。");
  return parseResultOutput(result);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}结果必须是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

/**
 * PoliceMate 到 Dify Workflow 的真实适配器。
 *
 * Dify 只负责结构化提取和报告草拟；法源、快照、引用和最终状态仍由后端
 * 校验。响应正文不写日志，Bearer key 只存在于此适配器的后端闭包中。
 */
export function createDifyProvider(
  config: AppConfig,
  options: DifyProviderOptions = {},
): DifyProvider & CaseAnalysisProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResponseBytes = options.maxResponseBytes ?? config.difyMaxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const runWorkflow = async (operation: "extract" | "report", payload: CaseExtractionRequest | ReportGenerationRequest, signal?: AbortSignal): Promise<CaseExtractionResult | ReportGenerationResult> => {
    const availability = configured(config);
    if (!availability.available) throw new Error(availability.reason ?? "Dify 不可用。");
    const endpoint = `${config.difyBaseUrl!.replace(/\/$/, "")}${DIFY_WORKFLOW_PATH}`;
    const report = operation === "report" ? payload as ReportGenerationRequest : null;
    const requestId = report?.requestId ?? randomUUID();
    const metadata = {
      contractVersion: "1.0",
      promptVersion: DIFY_PROMPT_VERSION,
      workflowVersion: config.difyWorkflowVersion,
      requestId,
      snapshotVersion: report?.snapshot.snapshotVersion ?? null,
      snapshotHash: report?.snapshot.snapshotHash ?? null,
      contentReleaseId: report?.contentReleaseId ?? null,
    };
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.difyApiKey!}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inputs: {
          operation,
          payload_json: JSON.stringify({ ...metadata, operation, payload }),
          contract_version: "1.0",
          workflow_version: config.difyWorkflowVersion,
        },
        response_mode: "blocking",
        user: `policymate-${randomUUID()}`,
      }),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Dify HTTP ${response.status}。`);
    }
    const body = await readJsonBounded(response, maxResponseBytes);
    const output = responseOutput(body);
    const valid = operation === "extract" ? validateExtract(output) : validateReport(output);
    if (!valid) throw new Error("Dify 输出未通过结构契约校验。");
    const envelope = output as DifyExtractionOutput | DifyReportOutput;
    for (const [key, value] of Object.entries(metadata)) {
      if (envelope[key as keyof typeof metadata] !== value) throw new Error("Dify 输出版本或请求绑定不匹配。");
    }
    if (operation === "report") {
      const result = envelope.result as ReportGenerationResult;
      if (result.workflowVersion !== metadata.workflowVersion || result.contentReleaseId !== metadata.contentReleaseId) {
        throw new Error("Dify 报告版本与封装不一致。");
      }
    }
    return envelope.result;
  };

  let probe: Promise<ServiceAvailability> | null = null;
  let expiresAt = 0;
  return {
    async getAvailability() {
      const local = configured(config);
      if (!local.available) return local;
      if (probe !== null && Date.now() < expiresAt) return probe;
      expiresAt = Date.now() + 15_000;
      probe = (async (): Promise<ServiceAvailability> => {
        try {
          const base = config.difyBaseUrl!.replace(/\/$/, "");
          const headers = { authorization: `Bearer ${config.difyApiKey!}` };
          const info = await fetchImpl(`${base}/info`, { headers, signal: AbortSignal.timeout(5000), redirect: "error" });
          if (!info.ok) { await info.body?.cancel(); throw new Error("probe failed"); }
          if (requireRecord(await readJsonBounded(info, 64 * 1024), "服务").mode !== "workflow") throw new Error("not workflow");
          const params = await fetchImpl(`${base}/parameters`, { headers, signal: AbortSignal.timeout(5000), redirect: "error" });
          if (!params.ok) { await params.body?.cancel(); throw new Error("probe failed"); }
          const form = requireRecord(await readJsonBounded(params, 64 * 1024), "参数").user_input_form;
          if (!Array.isArray(form)) throw new Error("missing form");
          const variables = form.flatMap((field: unknown) => Object.values(requireRecord(field, "输入")))
            .map((field) => requireRecord(field, "变量").variable);
          if (!["operation", "payload_json", "contract_version", "workflow_version"].every((name) => variables.includes(name))) throw new Error("incompatible form");
          return { available: true, reason: null };
        } catch {
          return { available: false, reason: "真实分析服务连接或工作流输入契约不可用，请联系维护者。" };
        }
      })();
      return probe;
    },
    async extractCaseFacts(request: CaseExtractionRequest, signal?: AbortSignal): Promise<CaseExtractionResult> {
      return requireRecord(
        await runWorkflow("extract", { caseText: request.caseText }, signal),
        "候选事实提取",
      ) as unknown as CaseExtractionResult;
    },
    async generateReport(request: ReportGenerationRequest, signal?: AbortSignal): Promise<ReportGenerationResult> {
      return requireRecord(await runWorkflow("report", request, signal), "报告生成") as unknown as ReportGenerationResult;
    },
  };
}
