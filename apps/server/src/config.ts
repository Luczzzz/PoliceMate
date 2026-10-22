import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataUseServiceInfo } from "@policymate/contracts";
import { DEFAULT_USAGE_TIME_ZONE, isValidUsageTimeZone } from "./usage-stats";

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
  /** 流式上游连续无新内容的空闲超时；只管首字之后的间隔（ADR-0018）。 */
  streamIdleTimeoutMs?: number;
  /** 流式等待首字的独立超时（ADR-0018）：首字延迟明显长于段间间隔，故与空闲超时分开。 */
  streamFirstTokenTimeoutMs?: number;
  /** 流式输出字符数上限，到达即截断。 */
  streamMaxChars?: number;
  /** 遥测接收端：`memory`（默认，测试用）或 `stdout`（逐行 JSON，部署用）。 */
  telemetrySink?: "memory" | "stdout";
  /**
   * 首页匿名使用计数的持久化文件；`null` 表示只保存在进程内存。
   * 文件只包含累计次数、当日日期与当日次数，不含任何案情或身份信息。
   */
  usageStatsFile?: string | null;
  /** 使用计数按哪个 IANA 时区跨日；默认 Asia/Shanghai。 */
  usageTimeZone?: string;
  /**
   * 思考强度：直传 OpenAI 风格的 `reasoning_effort`。未设置时不发该字段，
   * 请求体与之前逐字节一致（ADR-0020）。
   */
  llmReasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | null;
  /**
   * 关闭思考：发送 `thinking: {type:"disabled"}`（部分厂商方言）。未设置时不发。
   * 与 `llmReasoningEffort` 互斥；两者同时设置时启动即报错，避免语义含糊。
   */
  llmThinkingDisabled?: boolean;
  /** 各操作的单次生成上限（token）；只封顶不强制，避免模型写超长输出。 */
  llmMaxTokens?: Partial<Record<LlmTokenBudget, number>>;
  /** 事故问答单次边界调用超时。 */
  accidentTimeoutMs?: number;
  /** 事故问答一次请求的重试总预算（含首次）；超出即失败关闭，不再重试。 */
  accidentTotalBudgetMs?: number;
  /** 运行环境标识；用于发布检查，不参与产品行为。 */
  environment?: "development" | "production";
  /** 日历功能开关；环境变量 PM_CALENDAR_ENABLED。 */
  calendarEnabled?: boolean;
  /** 日历数据目录；环境变量 PM_CALENDAR_DATA_DIR（默认 ./data/calendar）。 */
  calendarDataDir?: string;
  /** 期限规则JSON文件路径；环境变量 PM_DEADLINE_RULES_PATH。 */
  deadlineRulesPath?: string;
}

export type ReportFormat = "stream" | "structured";

export type LlmTokenBudget = "extract" | "report" | "stream" | "accident";

/**
 * 生成预算默认值：只封顶，不强制。
 *
 * 注意 `max_tokens` 是**思维链 + 正文**的合计额度：推理型模型先在
 * `reasoning_content` 里思考，那部分也计价。取值因此给足余量——封得太紧会把
 * 一次正常回答变成 `finish_reason=length` 硬失败，而不是"短一点"。
 */
export const DEFAULT_LLM_MAX_TOKENS: Record<LlmTokenBudget, number> = {
  extract: 2048,
  report: 8192,
  stream: 8192,
  accident: 6144,
};

export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30 * 1000;
/** 首字预算；部署侧实测公网首字上限 40.6 秒，取 60 秒留余量（ADR-0018）。 */
export const DEFAULT_STREAM_FIRST_TOKEN_TIMEOUT_MS = 60 * 1000;
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
  streamFirstTokenTimeoutMs: number;
  streamMaxChars: number;
}

export const DEFAULT_ANALYSIS_TIMEOUT_MS = 30 * 1000;
export const DEFAULT_REPORT_TIMEOUT_MS = 90 * 1000;
export const DEFAULT_MAX_PROVIDER_ATTEMPTS = 2;
/** 事故问答实测首问约 13 秒、研判报告 28–41 秒，单次 60 秒已留足余量。 */
export const DEFAULT_ACCIDENT_TIMEOUT_MS = 60 * 1000;
/** 重试不得把等待翻倍：两次尝试合计不超过 120 秒。 */
export const DEFAULT_ACCIDENT_TOTAL_BUDGET_MS = 120 * 1000;

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
    streamFirstTokenTimeoutMs: config.streamFirstTokenTimeoutMs ?? DEFAULT_STREAM_FIRST_TOKEN_TIMEOUT_MS,
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
  const rawReasoningEffort = readOptional(env.PM_LLM_REASONING_EFFORT);
  const reasoningEffortValues = ["none", "minimal", "low", "medium", "high"] as const;
  if (rawReasoningEffort !== null && !(reasoningEffortValues as readonly string[]).includes(rawReasoningEffort)) {
    throw new Error(`PM_LLM_REASONING_EFFORT 必须为 ${reasoningEffortValues.join(" / ")}。`);
  }
  const rawThinking = readOptional(env.PM_LLM_THINKING);
  if (rawThinking !== null && rawThinking !== "off" && rawThinking !== "on") {
    throw new Error("PM_LLM_THINKING 必须为 on 或 off。");
  }
  const thinkingDisabled = rawThinking === "off";
  if (thinkingDisabled && rawReasoningEffort !== null) {
    throw new Error("PM_LLM_THINKING=off 与 PM_LLM_REASONING_EFFORT 不能同时设置：二者语义重叠，只选一种。");
  }

  const rawTelemetrySink = readOptional(env.PM_TELEMETRY_SINK);
  if (rawTelemetrySink !== null && rawTelemetrySink !== "memory" && rawTelemetrySink !== "stdout") {
    throw new Error("PM_TELEMETRY_SINK 必须为 memory 或 stdout。");
  }

  const usageTimeZone = readOptional(env.PM_USAGE_TIME_ZONE) ?? DEFAULT_USAGE_TIME_ZONE;
  if (!isValidUsageTimeZone(usageTimeZone)) {
    throw new Error(`PM_USAGE_TIME_ZONE 不是有效的 IANA 时区：${usageTimeZone}。`);
  }
  const rawUsageFile = readOptional(env.PM_USAGE_STATS_FILE);
  const isTestRun =
    env.NODE_ENV === "test" || process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
  const usageStatsFile =
    rawUsageFile !== null && rawUsageFile.toLowerCase() === "off"
      ? null
      : (rawUsageFile ?? (isTestRun ? null : resolve(packageRoot, "../../data/usage-stats.json")));

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
    streamFirstTokenTimeoutMs: readNumber(env.PM_STREAM_FIRST_TOKEN_TIMEOUT_MS, DEFAULT_STREAM_FIRST_TOKEN_TIMEOUT_MS),
    streamMaxChars: readNumber(env.PM_STREAM_MAX_CHARS, DEFAULT_STREAM_MAX_CHARS),
    telemetrySink: rawTelemetrySink === "stdout" ? "stdout" : "memory",
    usageStatsFile,
    usageTimeZone,
    llmReasoningEffort: rawReasoningEffort as AppConfig["llmReasoningEffort"],
    llmThinkingDisabled: thinkingDisabled,
    llmMaxTokens: {
      extract: readNumber(env.PM_LLM_MAX_TOKENS_EXTRACT, DEFAULT_LLM_MAX_TOKENS.extract),
      report: readNumber(env.PM_LLM_MAX_TOKENS_REPORT, DEFAULT_LLM_MAX_TOKENS.report),
      stream: readNumber(env.PM_LLM_MAX_TOKENS_STREAM, DEFAULT_LLM_MAX_TOKENS.stream),
      accident: readNumber(env.PM_LLM_MAX_TOKENS_ACCIDENT, DEFAULT_LLM_MAX_TOKENS.accident),
    },
    accidentTimeoutMs: readNumber(env.PM_ACCIDENT_TIMEOUT_MS, DEFAULT_ACCIDENT_TIMEOUT_MS),
    accidentTotalBudgetMs: readNumber(env.PM_ACCIDENT_TOTAL_BUDGET_MS, DEFAULT_ACCIDENT_TOTAL_BUDGET_MS),
    environment: env.NODE_ENV === "production" ? "production" : "development",
    calendarEnabled: readBoolean(env.PM_CALENDAR_ENABLED, false),
    calendarDataDir: readOptional(env.PM_CALENDAR_DATA_DIR) ?? resolve(packageRoot, "../../data/calendar"),
    deadlineRulesPath: readOptional(env.PM_DEADLINE_RULES_PATH) ?? resolve(packageRoot, "src/content/deadline-rules.json"),
  };
}
