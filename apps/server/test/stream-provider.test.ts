import { describe, expect, it, vi } from "vitest";
import type { LegalSourceReference } from "@policymate/contracts";
import { createLlmProvider } from "../src/providers/llm";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";

const config = (): AppConfig => ({
  ...loadConfig({}), providerMode: "llm", enableTestControls: false,
  llmBaseUrl: "https://llm.test/v1", llmApiKey: "private-llm-key", llmModel: "test-model", staticDir: null,
});
const caseText = "叶某昨晚酒后在东门烧烤将李某打伤，双方因上菜顺序起争执。";
const source = {
  sourceId: "law-test", version: "v1", title: "测试法", articles: [{ location: "第五十一条", minimalText: "殴打他人的，处五日以上十日以下拘留。" }],
} as unknown as LegalSourceReference;

/** 把若干 SSE 文本片段按给定边界切成字节流，模拟网络分包。 */
function sseResponse(parts: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Response(body, { ...init, headers: { "content-type": "text/event-stream" } });
}
const delta = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`;

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const piece of iterable) out.push(piece);
  return out;
}

describe("流式分析提供者（ADR-0015）", () => {
  it("llm：以 stream:true 请求纯文本，并按到达顺序逐段产出", async () => {
    const transport = vi.fn<typeof fetch>(async () => sseResponse([delta("1、案件定性："), delta("涉嫌殴打他人。"), delta("", "stop"), "data: [DONE]\n\n"]));
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    const pieces = await collect(provider.streamAnalysis!({ caseText, legalSources: [source] }));
    expect(pieces.join("")).toBe("1、案件定性：涉嫌殴打他人。");
    expect(pieces.length).toBeGreaterThanOrEqual(2);

    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(init?.headers).toEqual({ authorization: "Bearer private-llm-key", "content-type": "application/json" });
    const sent = JSON.parse(String(init?.body));
    expect(sent.stream).toBe(true);
    expect(sent.response_format).toBeUndefined();
    for (const heading of ["案件定性", "是否应当受案", "核心证据清单", "询问提纲", "执法风险提示", "法律条文原文节选"]) {
      expect(sent.messages[0].content).toContain(heading);
    }
    expect(sent.messages[0].content).toContain("待核实");
    const user = String(sent.messages[1].content);
    expect(user).toContain(caseText);
    expect(user).toContain("殴打他人的，处五日以上十日以下拘留。");
  });

  it("llm：一个 SSE 事件被网络拆成两段、或两个事件合在一段时都能正确还原", async () => {
    const whole = delta("甲") + delta("乙") + delta("丙");
    const cut = Math.floor(whole.length / 2);
    const provider = createLlmProvider(config(), {
      fetchImpl: async () => sseResponse([whole.slice(0, cut), whole.slice(cut), "data: [DONE]\n\n"]),
    });
    expect((await collect(provider.streamAnalysis!({ caseText, legalSources: [] }))).join("")).toBe("甲乙丙");
  });

  it("llm：上游 HTTP 错误、因长度被截断、流中没有任何内容时都抛错", async () => {
    const make = (response: () => Response) => createLlmProvider(config(), { fetchImpl: async () => response() });
    await expect(collect(make(() => new Response("no", { status: 500 })).streamAnalysis!({ caseText, legalSources: [] }))).rejects.toThrow(/HTTP 500/);
    await expect(collect(make(() => sseResponse([delta("半", "length")])).streamAnalysis!({ caseText, legalSources: [] }))).rejects.toThrow(/截断/);
    await expect(collect(make(() => sseResponse(["data: [DONE]\n\n"])).streamAnalysis!({ caseText, legalSources: [] }))).rejects.toThrow(/未返回内容/);
  });

  it("llm：调用方中止时把信号传给上游请求", async () => {
    const transport = vi.fn<typeof fetch>(async () => sseResponse([delta("x"), "data: [DONE]\n\n"]));
    const controller = new AbortController();
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    await collect(provider.streamAnalysis!({ caseText, legalSources: [] }, controller.signal));
    expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("fixture：产出固定的多段文本，覆盖六个小节", async () => {
    const fixtures = createFixtureControls();
    const pieces = await collect(fixtures.analysis.streamAnalysis!({ caseText, legalSources: [] }));
    expect(pieces.length).toBeGreaterThan(1);
    const text = pieces.join("");
    for (const heading of ["案件定性", "是否应当受案", "核心证据清单", "询问提纲", "执法风险提示", "法律条文原文节选"]) {
      expect(text).toContain(heading);
    }
  });

  it("fixture：fail_midway 在产出前两段后抛错；slow 的每段间隔明显更长", async () => {
    const failing = createFixtureControls({ streamMode: "fail_midway" });
    const got: string[] = [];
    await expect((async () => { for await (const piece of failing.analysis.streamAnalysis!({ caseText, legalSources: [] })) got.push(piece); })()).rejects.toThrow();
    expect(got).toHaveLength(2);

    const slow = createFixtureControls({ streamMode: "slow" });
    const started = Date.now();
    const iterator = slow.analysis.streamAnalysis!({ caseText, legalSources: [] })[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.(undefined);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(slow.describe().streamMode).toBe("slow");
  });
});
