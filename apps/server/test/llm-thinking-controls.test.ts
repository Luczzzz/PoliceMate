import { describe, expect, it, vi } from "vitest";
import { createLlmProvider } from "../src/providers/llm";
import { loadConfig, type AppConfig } from "../src/config";

const base = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...loadConfig({}),
  providerMode: "llm",
  enableTestControls: false,
  llmBaseUrl: "https://llm.test/v1",
  llmApiKey: "private-llm-key",
  llmModel: "thinking-model",
  staticDir: null,
  ...over,
});

/** 抓取流式请求体（只关心请求字段，不关心响应内容）。 */
async function streamBody(config: AppConfig): Promise<Record<string, unknown>> {
  const transport = vi.fn<typeof fetch>(async () =>
    new Response('data: {"choices":[{"delta":{"content":"好。"}}]}\ndata: [DONE]\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  );
  const provider = createLlmProvider(config, { fetchImpl: transport });
  for await (const _piece of provider.streamAnalysis!({ caseText: "虚构案情", legalSources: [] }, undefined)) {
    // 消费流即可
  }
  return JSON.parse(String(transport.mock.calls[0][1]?.body));
}

describe("思考强度开关（ADR-0020）", () => {
  it("默认不发任何思考字段：请求体与引入该能力前一致", async () => {
    const body = await streamBody(base());
    expect("reasoning_effort" in body).toBe(false);
    expect("thinking" in body).toBe(false);
    expect("enable_thinking" in body).toBe(false);
  });

  it("PM_LLM_REASONING_EFFORT 只发 reasoning_effort，不同时发别的方言", async () => {
    const body = await streamBody(base({ llmReasoningEffort: "minimal" }));
    expect(body.reasoning_effort).toBe("minimal");
    expect("thinking" in body).toBe(false);
  });

  it("PM_LLM_THINKING=off 发 thinking:{type:disabled}", async () => {
    const body = await streamBody(base({ llmThinkingDisabled: true }));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect("reasoning_effort" in body).toBe(false);
  });

  it("配置只接受白名单取值，且两种开关不得同时设置", () => {
    expect(loadConfig({ PM_LLM_REASONING_EFFORT: "low" }).llmReasoningEffort).toBe("low");
    expect(loadConfig({ PM_LLM_THINKING: "off" }).llmThinkingDisabled).toBe(true);
    expect(loadConfig({ PM_LLM_THINKING: "on" }).llmThinkingDisabled).toBe(false);
    expect(loadConfig({}).llmReasoningEffort).toBeNull();
    expect(() => loadConfig({ PM_LLM_REASONING_EFFORT: "max" })).toThrow(/PM_LLM_REASONING_EFFORT/);
    expect(() => loadConfig({ PM_LLM_THINKING: "disabled" })).toThrow(/PM_LLM_THINKING/);
    expect(() => loadConfig({ PM_LLM_THINKING: "off", PM_LLM_REASONING_EFFORT: "low" })).toThrow(/不能同时设置/);
  });
});
