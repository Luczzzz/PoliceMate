import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "@policymate/contracts";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { createMemoryTelemetrySink } from "../src/telemetry";
import type { Providers, StreamAnalysisRequest } from "../src/providers/types";
import { anonymousTokens } from "../src/security";

const caseText = "叶某昨晚酒后在东门烧烤将李某打伤，双方因上菜顺序起争执。";
const URL = "/api/v1/analysis/stream";
const headers = () => ({
  "x-pm-contract-version": CONTRACT_VERSION,
  "x-pm-anonymous-token": anonymousTokens.issue().token,
  "content-type": "application/json",
});
const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...loadConfig({}), staticDir: null, enableTestControls: false, reportFormat: "stream", ...over,
});

type StreamFn = NonNullable<Providers["analysis"]["streamAnalysis"]>;
function withStream(streamAnalysis: StreamFn): Providers {
  const fixtures = createFixtureControls();
  return { ...fixtures, analysis: { ...fixtures.analysis, streamAnalysis } };
}

interface SseEvent { event: string; data: Record<string, unknown> }
function parseSse(body: string): SseEvent[] {
  return body.split("\n\n").filter((block) => block.trim() !== "").map((block) => {
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? "";
    const data = /^data: (.*)$/m.exec(block)?.[1] ?? "{}";
    return { event, data: JSON.parse(data) as Record<string, unknown> };
  });
}
const textOf = (events: SseEvent[]) => events.filter((e) => e.event === "delta").map((e) => e.data.text as string).join("");
const doneOf = (events: SseEvent[]) => events.find((e) => e.event === "done")!.data;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("POST /api/v1/analysis/stream（ADR-0015）", () => {
  it("以 SSE 逐段返回分析文本，结尾的 done 事件由后端附带固定声明", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const response = await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    expect(response.headers["cache-control"]).toContain("no-cache");
    const events = parseSse(response.body);
    expect(events.filter((e) => e.event === "delta").length).toBeGreaterThan(1);
    expect(textOf(events)).toContain("案件定性");
    const done = doneOf(events);
    expect(done.status).toBe("complete");
    expect(String(done.disclaimer)).toContain("不构成正式法律意见");
    expect(events[events.length - 1].event).toBe("done");
  });

  it("把本次受治理法源交给提供者，而不是只给案情", async () => {
    let seen: StreamAnalysisRequest | undefined;
    const providers = withStream(async function* (request) { seen = request; yield "ok"; });
    const app = await buildApp({ config: config(), providers });
    await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } });
    expect(seen?.caseText).toBe(caseText);
    expect(seen!.legalSources.length).toBeGreaterThan(0);
  });

  it("沿用鉴权与输入校验：无令牌 401，空案情或超长案情在开流前以 JSON 错误返回", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const noToken = await app.inject({ method: "POST", url: URL, headers: { "x-pm-contract-version": CONTRACT_VERSION, "content-type": "application/json" }, payload: { caseText } });
    expect(noToken.statusCode).toBe(401);
    const empty = await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText: "  " } });
    expect(empty.statusCode).toBe(400);
    expect(empty.headers["content-type"]).toContain("application/json");
    const long = await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText: "字".repeat(10_001) } });
    expect(long.statusCode).toBe(400);
  });

  it("功能停用或上游不可用时失败关闭为 503，不开流", async () => {
    const off = await buildApp({ config: config({ analysisEnabled: false }), fixtures: createFixtureControls() });
    expect((await off.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).statusCode).toBe(503);
    const fixtures = createFixtureControls();
    fixtures.updateState({ difyAvailable: false });
    const down = await buildApp({ config: config(), fixtures });
    expect((await down.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).statusCode).toBe(503);
  });

  it("输出达到字符上限时截断：只发到上限，状态为 truncated，并中止上游", async () => {
    let aborted = false;
    const providers = withStream(async function* (_request, signal) {
      signal?.addEventListener("abort", () => { aborted = true; });
      yield "一二三四五";
      yield "六七八九十";
      yield "不应出现";
    });
    const app = await buildApp({ config: config({ streamMaxChars: 7 }), providers });
    const events = parseSse((await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).body);
    expect(textOf(events)).toBe("一二三四五六七");
    expect(doneOf(events).status).toBe("truncated");
    expect(aborted).toBe(true);
  });

  it("上游长时间没有新内容时按空闲超时中断，已出文字保留，done 标明 interrupted", async () => {
    const providers = withStream(async function* (_request, signal) {
      yield "已出的文字";
      await new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    const app = await buildApp({ config: config({ streamIdleTimeoutMs: 60 }), providers });
    const events = parseSse((await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).body);
    expect(textOf(events)).toBe("已出的文字");
    const done = doneOf(events);
    expect(done.status).toBe("interrupted");
    expect(done.reason).toBe("idle_timeout");
    expect(String(done.disclaimer)).not.toBe("");
  });

  it("首字迟迟不来同样算空闲超时；总时限到了也会中断", async () => {
    const never = withStream(async function* (_request, signal) {
      await new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      yield "不会到达";
    });
    const idleApp = await buildApp({ config: config({ streamIdleTimeoutMs: 50 }), providers: never });
    expect(doneOf(parseSse((await idleApp.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).body)).reason).toBe("idle_timeout");

    const slow = withStream(async function* () { for (;;) { await sleep(20); yield "字"; } });
    const totalApp = await buildApp({ config: config({ reportTimeoutMs: 150, streamIdleTimeoutMs: 1000 }), providers: slow });
    const done = doneOf(parseSse((await totalApp.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } })).body));
    expect(done.status).toBe("interrupted");
    expect(done.reason).toBe("total_timeout");
  });

  it("上游中途报错：保留已出文字，done 为 interrupted/upstream_error，错误信息不含内部细节", async () => {
    const providers = withStream(async function* () { yield "前半"; throw new Error("LLM HTTP 500 secret-detail"); });
    const app = await buildApp({ config: config(), providers });
    const response = await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } });
    const events = parseSse(response.body);
    expect(textOf(events)).toBe("前半");
    expect(doneOf(events)).toMatchObject({ status: "interrupted", reason: "upstream_error" });
    expect(response.body).not.toContain("secret-detail");
  });

  it("浏览器断开（点击停止）时中止上游调用", async () => {
    let aborted = false;
    const providers = withStream(async function* (_request, signal) {
      signal?.addEventListener("abort", () => { aborted = true; });
      for (;;) { await sleep(10); yield "字"; }
    });
    const app = await buildApp({ config: config(), providers });
    await app.listen({ port: 0, host: "127.0.0.1" });
    try {
      const address = app.server.address() as { port: number };
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${address.port}${URL}`, {
        method: "POST", headers: headers(), body: JSON.stringify({ caseText }), signal: controller.signal,
      });
      const reader = response.body!.getReader();
      await reader.read();
      controller.abort();
      for (let i = 0; i < 50 && !aborted; i += 1) await sleep(20);
      expect(aborted).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("遥测只记数字：耗时、首字延迟、字符数、结束状态，不含案情或输出", async () => {
    const telemetry = createMemoryTelemetrySink();
    const app = await buildApp({ config: config(), fixtures: createFixtureControls(), telemetry });
    await app.inject({ method: "POST", url: URL, headers: headers(), payload: { caseText } });
    const event = telemetry.events.find((e) => e.kind === "analysis.stream")!;
    expect(event.outcome).toBe("ok");
    expect(event.featureState).toBe("complete");
    expect(event.inputCharacters).toBe(Array.from(caseText).length);
    expect(event.outputCharacters).toBeGreaterThan(0);
    expect(event.firstChunkMs).toBeGreaterThanOrEqual(0);
    expect(event.durationMs).toBeGreaterThan(0);
    const dump = JSON.stringify(telemetry.events);
    expect(dump).not.toContain("叶某");
    expect(dump).not.toContain("案件定性");
  });

  it("提供者在开流后同步抛错：以 interrupted/upstream_error 结束，不二次发送响应，并发名额被释放", async () => {
    const providers = withStream((() => { throw new Error("boom-sync"); }) as unknown as StreamFn);
    const app = await buildApp({ config: config({ maxConcurrency: 1 }), providers });
    for (let i = 0; i < 2; i += 1) {
      const response = await app.inject({ method: "POST", url: URL, headers: { ...headers() }, payload: { caseText } });
      expect(response.statusCode).toBe(200);
      expect(doneOf(parseSse(response.body))).toMatchObject({ status: "interrupted", reason: "upstream_error" });
      expect(response.body).not.toContain("boom-sync");
    }
  });
});
