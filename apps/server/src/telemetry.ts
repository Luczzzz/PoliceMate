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
  attempts?: number;
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
  "attempts",
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
      const safe: Record<string, unknown> = {};
      for (const key of Object.keys(event)) {
        if (ALLOWED_KEYS.has(key)) safe[key] = (event as unknown as Record<string, unknown>)[key];
      }
      events.push(safe as unknown as TelemetryEvent);
    },
    reset(): void {
      events.length = 0;
    },
  };
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
