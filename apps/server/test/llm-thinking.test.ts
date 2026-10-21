import { describe, expect, it, vi } from "vitest";
import { createLlmProvider } from "../src/providers/llm";
import { loadConfig, type AppConfig } from "../src/config";

const config = (): AppConfig => ({
  ...loadConfig({}),
  providerMode: "llm",
  enableTestControls: false,
  llmBaseUrl: "https://llm.test/v1",
  llmApiKey: "private-llm-key",
  llmModel: "thinking-model",
  staticDir: null,
});

/** 构造一段 OpenAI 兼容 SSE：先思维链、再正文。 */
function sse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const delta = (extra: Record<string, unknown>) => ({ choices: [{ finish_reason: null, delta: extra }] });

describe("推理型上游的思维链只计数、不展示（ADR-0019）", () => {
  it("流式：reasoning_content 进诊断计数，正文只输出 content", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      sse([
        delta({ reasoning_content: "先看信号灯：" }),
        delta({ reasoning_content: "甲方向为红灯。" }),
        delta({ content: "1、案件定性：\n" }),
        delta({ content: "涉嫌违反交通信号。" }),
        { choices: [{ finish_reason: "stop", delta: {} }] },
      ]),
    );
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    const seen: Array<{ reasoningChars: number; firstReasoningMs?: number }> = [];
    const pieces: string[] = [];
    for await (const piece of provider.streamAnalysis!(
      { caseText: "虚构案情", legalSources: [], onThinking: (info) => seen.push(info) },
      undefined,
    )) {
      pieces.push(piece);
    }
    expect(pieces.join("")).toBe("1、案件定性：\n涉嫌违反交通信号。");
    expect(pieces.join("")).not.toContain("信号灯");
    expect(seen).toHaveLength(1);
    expect(seen[0].reasoningChars).toBe("先看信号灯：甲方向为红灯。".length);
    expect(seen[0].firstReasoningMs).toBeGreaterThanOrEqual(0);
  });

  it("流式：没有思维链时不上报诊断，行为与之前一致", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      sse([delta({ content: "正文。" }), { choices: [{ finish_reason: "stop", delta: {} }] }]),
    );
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    const seen: unknown[] = [];
    const pieces: string[] = [];
    for await (const piece of provider.streamAnalysis!(
      { caseText: "虚构案情", legalSources: [], onThinking: (info) => seen.push(info) },
      undefined,
    )) {
      pieces.push(piece);
    }
    expect(pieces.join("")).toBe("正文。");
    expect(seen).toHaveLength(0);
  });

  it("非流式：message.reasoning_content 同样只计数，且不影响正文解析", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({ kind: "question", text: "请问路口信号灯状态？" }),
              reasoning_content: "还缺信号灯与通行方向。",
            },
          },
        ],
      }),
    );
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    const seen: Array<{ reasoningChars: number }> = [];
    const output = await provider.consultAccidentLiability!({
      turns: [{ turnId: "t1", speaker: "officer", text: "虚构事故", createdAt: new Date().toISOString() }],
      forceReport: false,
      legalSources: [],
      requestId: "r1",
      onThinking: (info) => seen.push(info),
    });
    expect(output.kind).toBe("question");
    expect(seen).toEqual([{ reasoningChars: "还缺信号灯与通行方向。".length }]);
  });
});
