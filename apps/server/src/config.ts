import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataUseServiceInfo } from "@policymate/contracts";

/**
 * 运行配置。所有影响能力可用性的输入都必须来自配置或外部边界提供者，
 * 不得由页面文案或自然语言结果决定。
 */
export interface AppConfig {
  host: string;
  port: number;
  /** 真实模型与开发测试替身显式分开，不自动回退。 */
  providerMode: "fixture" | "llm";
  /** 是否挂载测试用替身控制接口；生产环境必须关闭。 */
  enableTestControls: boolean;
  /** 后端总开关；关闭时所有入口均不可用。 */
  masterSwitch: boolean;
  analysisEnabled: boolean;
  documentsEnabled: boolean;
  /** 交通事故责任认定辅助开关；未设置时默认开启。 */
  accidentLiabilityEnabled?: boolean;
  /** 构建后的 H5 静态资源目录；不存在时仅为 null（后端只提供 API）。 */
  staticDir: string | null;
  /**
   * 部署相关的服务信息。受控试行前必须填写实际值；未配置时保持 `null`，
   * 页面必须如实显示“尚未配置”，不得使用虚构主体或联系人。
   */
  service: DataUseServiceInfo;
  /** 允许访问后端的 H5 来源白名单；同源请求始终允许。 */
  allowedOrigins?: string[];
  /** 短期匿名令牌有效期。 */
  anonymousTokenTtlMs?: number;
  /** 受保护接口的固定窗口频率上限与窗口长度。 */
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  /** 同一令牌允许的并发在途请求上限。 */
  maxConcurrency?: number;
  /** 请求体大小上限（字节）。 */
  bodyLimitBytes?: number;
  /** 候选事实提取单次超时（规格：30 秒）。 */
  analysisTimeoutMs?: number;
  /** 完整报告生成超时（规格：90 秒）。 */
  reportTimeoutMs?: number;
  /** 外部边界最多尝试次数（1 次自动重试 => 2）。 */
  maxProviderAttempts?: number;
  /** 真实模型接口配置；密钥只存在于后端。 */
  llmBaseUrl?: string | null;
  llmApiKey?: string | null;
  llmModel?: string | null;
  /** 报告上的工作流版本标注；默认 `policymate-llm-v1.0.0`。 */
  llmWorkflowVersion?: string | null;
  /** 结构化输出方式；接口不支持 json_schema 时用 json_object（仍由后端 Schema 校验）。 */
  llmResponseFormat?: "json_schema" | "json_object";
  llmMaxResponseBytes?: number;
  /**
   * 案情分析输出形态（ADR-0015）：`stream` 为流式纯文本，`structured` 为结构化报告。
   * 未设置时 `llm` 模式默认 `stream`，其余默认 `structured`。
   */
  reportFormat?: ReportFormat;
  /** 流式上游连续无新内容的空闲超时（含首字等待）。 */
  streamIdleTimeoutMs?: number;
  /** 流式输出字符数上限，到达即截断。 */
  streamMaxChars?: number;
  /** 运行环境标识；用于发布检查，不参与产品行为。 */
  environment?: "development" | "production";
}

export type ReportFormat = "stream" | "structured";

export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30 * 1000;
export const DEFAULT_STREAM_MAX_CHARS = 12000;

/** 当前生效的输出形态；配置未显式给出时按提供者模式取默认。 */
export function resolveReportFormat(config: Pick<AppConfig, "reportFormat" | "providerMode">): ReportFormat {
  return config.reportFormat ?? (config.providerMode === "llm" ? "stream" : "structured");
}

/** 已解析的运行时安全/超时配置。 */
export interface ResolvedRuntimeConfig {
  allowedOrigins: string[];
  anonymousTokenTtlMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxConcurrency: number;
  bodyLimitBytes: number;
  analysisTimeoutMs: number;
  reportTimeoutMs: number;
  maxProviderAttempts: number;
  streamIdleTimeoutMs: number;
  streamMaxChars: number;
}

export const DEFAULT_ANALYSIS_TIMEOUT_MS = 30 * 1000;
export const DEFAULT_REPORT_TIMEOUT_MS = 90 * 1000;
export const DEFAULT_MAX_PROVIDER_ATTEMPTS = 2;

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];

/** 把可选配置解析为具体运行值；测试可以只覆盖关心的字段。 */
export function resolveRuntimeConfig(config: AppConfig): ResolvedRuntimeConfig {
  return {
    allowedOrigins: config.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    anonymousTokenTtlMs: config.anonymousTokenTtlMs ?? 30 * 60 * 1000,
    rateLimitMax: config.rateLimitMax ?? 300,
    rateLimitWindowMs: config.rateLimitWindowMs ?? 60 * 1000,
    maxConcurrency: config.maxConcurrency ?? 4,
    bodyLimitBytes: config.bodyLimitBytes ?? 128 * 1024,
    analysisTimeoutMs: config.analysisTimeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS,
    reportTimeoutMs: config.reportTimeoutMs ?? DEFAULT_REPORT_TIMEOUT_MS,
    maxProviderAttempts: config.maxProviderAttempts ?? DEFAULT_MAX_PROVIDER_ATTEMPTS,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    streamMaxChars: config.streamMaxChars ?? DEFAULT_STREAM_MAX_CHARS,
  };
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultStaticDir = resolve(packageRoot, "../web/dist");

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "on", "yes"].includes(raw.trim().toLowerCase());
}

function readOptional(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function readNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const staticDirCandidate = readOptional(env.PM_WEB_DIST) ?? defaultStaticDir;
  const configuredOrigins = readList(env.PM_ALLOWED_ORIGINS);
  const mode = readOptional(env.PM_PROVIDER_MODE) ?? (env.NODE_ENV === "production" ? "llm" : "fixture");
  if (mode !== "fixture" && mode !== "llm") throw new Error("PM_PROVIDER_MODE 必须为 fixture 或 llm。");
  const llmFormat = readOptional(env.PM_LLM_RESPONSE_FORMAT) ?? "json_schema";
  if (llmFormat !== "json_schema" && llmFormat !== "json_object") throw new Error("PM_LLM_RESPONSE_FORMAT 必须为 json_schema 或 json_object。");
  const rawFormat = readOptional(env.PM_REPORT_FORMAT);
  if (rawFormat !== null && rawFormat !== "stream" && rawFormat !== "structured") throw new Error("PM_REPORT_FORMAT 必须为 stream 或 structured。");
  const reportFormat: ReportFormat = rawFormat ?? resolveReportFormat({ reportFormat: undefined, providerMode: mode });
  const testControls = readBoolean(env.PM_ENABLE_TEST_CONTROLS, false);
  if (testControls && (mode !== "fixture" || env.NODE_ENV === "production")) {
    throw new Error("测试控制只允许在非生产 fixture 模式启用。");
  }

  return {
    host: readOptional(env.PM_HOST) ?? "127.0.0.1",
    port: Number(readOptional(env.PM_SERVER_PORT) ?? "8787"),
    providerMode: mode,
    enableTestControls: testControls,
    masterSwitch: readBoolean(env.PM_MASTER_SWITCH, true),
    analysisEnabled: readBoolean(env.PM_ANALYSIS_ENABLED, env.NODE_ENV !== "production"),
    documentsEnabled: readBoolean(env.PM_DOCUMENTS_ENABLED, true),
    accidentLiabilityEnabled: readBoolean(env.PM_ACCIDENT_LIABILITY_ENABLED, true),
    staticDir: existsSync(resolve(staticDirCandidate, "index.html")) ? staticDirCandidate : null,
    service: {
      provider: readOptional(env.PM_SERVICE_PROVIDER),
      contact: readOptional(env.PM_SERVICE_CONTACT),
      dataProcessingStatement: readOptional(env.PM_DATA_PROCESSING_STATEMENT),
      technicalLoggingBoundary: readList(env.PM_TECHNICAL_LOGGING_BOUNDARY),
    },
    allowedOrigins: configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS,
    anonymousTokenTtlMs: readNumber(env.PM_ANONYMOUS_TOKEN_TTL_MS, 30 * 60 * 1000),
    rateLimitMax: readNumber(env.PM_RATE_LIMIT_MAX, 300),
    rateLimitWindowMs: readNumber(env.PM_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    maxConcurrency: readNumber(env.PM_MAX_CONCURRENCY, 4),
    bodyLimitBytes: readNumber(env.PM_BODY_LIMIT_BYTES, 128 * 1024),
    analysisTimeoutMs: readNumber(env.PM_ANALYSIS_TIMEOUT_MS, 30 * 1000),
    reportTimeoutMs: readNumber(env.PM_REPORT_TIMEOUT_MS, 90 * 1000),
    maxProviderAttempts: readNumber(env.PM_MAX_PROVIDER_ATTEMPTS, 2),
    llmBaseUrl: readOptional(env.PM_LLM_BASE_URL),
    llmApiKey: readOptional(env.PM_LLM_API_KEY),
    llmModel: readOptional(env.PM_LLM_MODEL),
    llmWorkflowVersion: readOptional(env.PM_LLM_WORKFLOW_VERSION),
    llmResponseFormat: llmFormat,
    llmMaxResponseBytes: readNumber(env.PM_LLM_MAX_RESPONSE_BYTES, 1024 * 1024),
    reportFormat,
    streamIdleTimeoutMs: readNumber(env.PM_STREAM_IDLE_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    streamMaxChars: readNumber(env.PM_STREAM_MAX_CHARS, DEFAULT_STREAM_MAX_CHARS),
    environment: env.NODE_ENV === "production" ? "production" : "development",
  };
}
