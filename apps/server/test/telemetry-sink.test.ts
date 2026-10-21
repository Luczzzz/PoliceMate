import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import {
  createMemoryTelemetrySink,
  createStdoutTelemetrySink,
  createTelemetrySink,
  type TelemetryEvent,
} from "../src/telemetry";
import { AccidentLiabilityEngine } from "../src/accident-liability/engine";

const event = (extra: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  requestId: "r1",
  timestamp: new Date(0).toISOString(),
  kind: "analysis.stream",
  outcome: "ok",
  durationMs: 1234,
  firstChunkMs: 567,
  payloadChars: 8901,
  ...extra,
});

describe("遥测落盘（ADR-0019）", () => {
  it("stdout 接收端每事件一行 JSON，且只写白名单字段", () => {
    const lines: string[] = [];
    const sink = createStdoutTelemetrySink((line) => lines.push(line));
    // 故意塞入内容字段，验证白名单把它挡在落盘之外（金丝雀）。
    sink.record(event({ caseText: "虚构案情正文不得落盘", report: "报告正文" } as unknown as TelemetryEvent));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual({
      requestId: "r1",
      timestamp: new Date(0).toISOString(),
      kind: "analysis.stream",
      outcome: "ok",
      durationMs: 1234,
      firstChunkMs: 567,
      payloadChars: 8901,
    });
    expect(parsed.caseText).toBeUndefined();
    expect(parsed.report).toBeUndefined();
  });

  it("默认仍是内存接收端；按配置可切到 stdout", () => {
    const memory = createTelemetrySink("memory") as ReturnType<typeof createMemoryTelemetrySink>;
    memory.record(event());
    expect(memory.events).toHaveLength(1);
    memory.reset();
    expect(memory.events).toHaveLength(0);

    const lines: string[] = [];
    createTelemetrySink("stdout", (line) => lines.push(line)).record(event());
    expect(lines).toHaveLength(1);
  });

  it("配置项只接受 memory 或 stdout", () => {
    expect(loadConfig({ PM_TELEMETRY_SINK: "stdout" }).telemetrySink).toBe("stdout");
    expect(loadConfig({}).telemetrySink).toBe("memory");
    expect(() => loadConfig({ PM_TELEMETRY_SINK: "syslog" })).toThrow(/PM_TELEMETRY_SINK/);
  });
});

describe("事故问答的重试总预算（ADR-0019）", () => {
  /** 永不返回的边界，同时记录被实际发起的次数。 */
  function hangCounter() {
    const calls: number[] = [];
    const provider = () => {
      calls.push(performance.now());
      return new Promise<never>(() => undefined);
    };
    return { provider, calls };
  }

  it("重试不得把等待翻倍：预算耗尽后不再发起新的完整超时", async () => {
    const events: TelemetryEvent[] = [];
    const { provider, calls } = hangCounter();
    const engine = new AccidentLiabilityEngine(provider as never, {
      timeoutMs: 500,
      totalBudgetMs: 120,
      maxAttempts: 5,
      telemetry: { record: (event) => events.push(event) },
    });
    const startedAt = performance.now();
    await expect(engine.createSession("虚构事故概况", [])).rejects.toThrow(/暂不可用/);
    // 真正的不变量：整个请求的耗时被总预算按住，而不是 5 × 500 毫秒。
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(events.at(-1)?.outcome).toBe("error");
  });

  it("每次尝试的时限取“单次超时”和“剩余预算”的较小值", async () => {
    const events: TelemetryEvent[] = [];
    const { provider, calls } = hangCounter();
    const engine = new AccidentLiabilityEngine(provider as never, {
      timeoutMs: 60,
      totalBudgetMs: 100,
      maxAttempts: 2,
      telemetry: { record: (event) => events.push(event) },
    });
    const startedAt = performance.now();
    await expect(engine.createSession("虚构事故概况", [])).rejects.toThrow(/暂不可用/);
    expect(performance.now() - startedAt).toBeLessThan(400);
    expect(calls).toHaveLength(2);
    expect(events.at(-1)?.payloadChars).toBe(2);
    expect(events.at(-1)?.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe("思维链诊断字段（ADR-0019）", () => {
  it("reasoningChars 与 firstReasoningMs 可落盘，且仍不含内容", () => {
    const lines: string[] = [];
    createStdoutTelemetrySink((line) => lines.push(line)).record(
      event({ reasoningChars: 4321, firstReasoningMs: 8123 } as TelemetryEvent),
    );
    const parsed = JSON.parse(lines[0]);
    expect(parsed.reasoningChars).toBe(4321);
    expect(parsed.firstReasoningMs).toBe(8123);
  });
});
