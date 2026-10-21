/**
 * 允许记录的运行元数据。
 *
 * 只包含非内容信息：随机请求编号、时间与耗时、状态与错误分类、版本、
 * 字符数、重试/取消/限流情况、法源记录 ID 和匿名功能计数。任何案情正文、
 * 事实值、报告正文、检索词或工作台标记都不得进入这里。
 */

export type TelemetryOutcome =
  | "ok"
  | "invalid_request"
  | "rejected"
  | "throttled"
  | "not_found"
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "retry"
  | "error";

export interface TelemetryEvent {
  /** 随机请求编号（或运行内关联编号），不含内容。 */
  requestId: string;
  timestamp: string;
  /** 稳定的功能分类，例如 `http.request`、`analysis.extraction`。 */
  kind: string;
  outcome: TelemetryOutcome;
  /** HTTP 状态码；非 HTTP 事件可省略。 */
  status?: number;
  durationMs?: number;
  contractVersion?: string;
  workflowVersion?: string;
  contentReleaseId?: string;
  /** 输入字符数（只计数，不记录内容）。 */
  inputCharacters?: number;
  /** 输出条目数量（数量本身不含内容）。 */
  outputItems?: number;
  /** 报告序列化字符数（只计数）。 */
  outputCharacters?: number;
  /** 超过 ADR-0012 数量上限的部分个数（只计数）。 */
  capExceeded?: number;
  attempts?: number;
  /** 流式分析从请求开始到第一段文字到达的毫秒数（只计数）。 */
  firstChunkMs?: number;
  /** 本次调用交给模型的法源材料字符数（只计数，不含内容）。 */
  payloadChars?: number;
  /** 上游思维链（thinking）字符数（只计数，不含内容）。 */
  reasoningChars?: number;
  /** 从请求开始到首个思维链 token 到达的毫秒数（只计数）。 */
  firstReasoningMs?: number;
  /** 已匹配的受治理法源记录 ID。 */
  matchedSourceIds?: string[];
  /** 匿名功能/页面状态计数增量。 */
  featureCount?: number;
  /** 页面或功能状态标识（固定枚举，不是用户输入）。 */
  featureState?: string;
}

/** 运行元数据接收端。默认实现仅保存在内存，便于测试断言无内容泄漏。 */
export interface TelemetrySink {
  record(event: TelemetryEvent): void;
}

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "requestId",
  "timestamp",
  "kind",
  "outcome",
  "status",
  "durationMs",
  "contractVersion",
  "workflowVersion",
  "contentReleaseId",
  "inputCharacters",
  "outputItems",
  "outputCharacters",
  "capExceeded",
  "attempts",
  "firstChunkMs",
  "payloadChars",
  "reasoningChars",
  "firstReasoningMs",
  "matchedSourceIds",
  "featureCount",
  "featureState",
]);

export interface MemoryTelemetrySink extends TelemetrySink {
  readonly events: TelemetryEvent[];
  reset(): void;
}

/** 内存遥测接收端。写入前只保留白名单字段，防止误传内容字段。 */
export function createMemoryTelemetrySink(): MemoryTelemetrySink {
  const events: TelemetryEvent[] = [];
  return {
    events,
    record(event: TelemetryEvent): void {
      events.push(sanitizeTelemetryEvent(event));
    },
    reset(): void {
      events.length = 0;
    },
  };
}

/** 只保留白名单字段；任何内容字段名都不在白名单内，因而不会被写出。 */
export function sanitizeTelemetryEvent(event: TelemetryEvent): TelemetryEvent {
  const safe: Record<string, unknown> = {};
  for (const key of Object.keys(event)) {
    if (ALLOWED_KEYS.has(key)) safe[key] = (event as unknown as Record<string, unknown>)[key];
  }
  return safe as unknown as TelemetryEvent;
}

/**
 * 逐行 JSON 的标准输出遥测接收端（部署侧长期要求）。
 *
 * 字段仍先过 `ALLOWED_KEYS` 白名单，所以案情、事实值、报告正文、法条原文都
 * 不可能被迫传进来；输出行只用于事后定位阶段、耗时与上游错误分类。
 */
export function createStdoutTelemetrySink(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): TelemetrySink {
  return {
    record(event: TelemetryEvent): void {
      write(JSON.stringify(sanitizeTelemetryEvent(event)));
    },
  };
}

/** 按配置选择遥测接收端；未配置时仍用内存（测试断言无内容泄漏）。 */
export function createTelemetrySink(
  kind: "memory" | "stdout",
  write?: (line: string) => void,
): TelemetrySink {
  return kind === "stdout" ? createStdoutTelemetrySink(write) : createMemoryTelemetrySink();
}

/** 把 HTTP 状态码归类为错误分类；不读取响应正文。 */
export function classifyStatus(status: number): TelemetryOutcome {
  if (status < 400) return "ok";
  if (status === 429) return "throttled";
  if (status === 404) return "not_found";
  if (status === 410) return "unavailable";
  if (status === 400 || status === 413) return "invalid_request";
  if (status === 401 || status === 403) return "rejected";
  if (status >= 500) return "error";
  return "rejected";
}
