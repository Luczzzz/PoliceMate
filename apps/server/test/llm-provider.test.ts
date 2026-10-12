import { describe, expect, it, vi } from "vitest";
import type { AnalysisIntakeResponse } from "@policymate/contracts";
import { createLlmProvider } from "../src/providers/llm";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { createGovernedContentProvider } from "../src/providers/content";
import { AnalysisEngine } from "../src/analysis/engine";
import { toReportDraft } from "../src/analysis/report-draft";
import { buildApp } from "../src/app";
import { anonymousTokens } from "../src/security";

const config = (): AppConfig => ({
  ...loadConfig({}), providerMode: "llm", enableTestControls: false,
  llmBaseUrl: "https://llm.test/v1", llmApiKey: "private-llm-key", llmModel: "test-model",
  llmWorkflowVersion: "llm-test-v1", staticDir: null,
});
const fixtures = createFixtureControls();
const text = "4月1日，张某在酒店殴打李某。";
const headers = () => ({ "x-pm-contract-version": "1.0", "x-pm-anonymous-token": anonymousTokens.issue().token });

/** 模拟 OpenAI 兼容接口：按 system 提示词是否为提取/报告决定返回内容。 */
function mockChat(change?: (content: unknown, finish: string) => { content?: unknown; finish?: string; raw?: unknown }) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const isExtract = String(body.messages[0].content).includes("候选事实提取组件");
    const user = JSON.parse(body.messages[1].content);
    const content = isExtract
      ? await fixtures.analysis.extractCaseFacts(user)
      : toReportDraft(await fixtures.analysis.generateReport!(user));
    const out = change?.(content, "stop");
    if (out?.raw !== undefined) return new Response(String(out.raw), { status: 200 });
    const message = out?.content ?? content;
    return Response.json({ choices: [{ finish_reason: out?.finish ?? "stop", message: { content: typeof message === "string" ? message : JSON.stringify(message) } }] });
  });
}

async function requestForReport() {
  const [state] = await new AnalysisEngine(fixtures.analysis).createSessions({ caseText: text });
  const resolution = await fixtures.content.resolveCaseFocus!(state.facts);
  return { facts: state.facts, snapshot: state.snapshot, legalSources: resolution.legalSources, caseFocusId: resolution.caseFocusId, contentReleaseId: "release-trial-0001" };
}

describe("直连 LLM 提供者（ADR-0014）", () => {
  it("向 chat/completions 发送后端密钥、模型、提示词、JSON Schema，且不含密钥于正文", async () => {
    const transport = mockChat();
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    await provider.extractCaseFacts({ caseText: text });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(init?.headers).toEqual({ authorization: "Bearer private-llm-key", "content-type": "application/json" });
    expect(init?.redirect).toBe("error");
    const sent = JSON.parse(String(init?.body));
    expect(sent.model).toBe("test-model");
    expect(sent.stream).toBe(false);
    expect(sent.temperature).toBe(0.2);
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.schema.definitions.CaseExtractionResult.properties.matters).toBeDefined();
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[0].content).not.toContain("复制时从下一行开始");
    expect(JSON.parse(sent.messages[1].content)).toEqual({ caseText: text });
    expect(String(init?.body)).not.toContain("private-llm-key");
  });

  it("可配置为 json_object 模式（接口不支持 json_schema 时）", async () => {
    const transport = mockChat();
    await createLlmProvider({ ...config(), llmResponseFormat: "json_object" }, { fetchImpl: transport }).extractCaseFacts({ caseText: text });
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).response_format).toEqual({ type: "json_object" });
  });

  it("报告：补全草稿并以配置的工作流版本标注", async () => {
    const request = await requestForReport();
    const provider = createLlmProvider(config(), { fetchImpl: mockChat() });
    const report = await provider.generateReport!(request);
    expect(report.modules).toHaveLength(6);
    expect(report.workflowVersion).toBe("llm-test-v1");
    expect(report.contentReleaseId).toBe(request.contentReleaseId);
    expect(report.modules.flatMap((m) => m.traceLinks).some((t) => t.basis?.minimalText)).toBe(true);
  });

  it("接受被一层代码围栏包裹的 JSON", async () => {
    const provider = createLlmProvider(config(), { fetchImpl: mockChat((content) => ({ content: "```json\n" + JSON.stringify(content) + "\n```" })) });
    expect((await provider.extractCaseFacts({ caseText: text })).matters.length).toBeGreaterThan(0);
  });

  it.each([
    ["非 JSON 文本", { content: "好的，结果如下" }],
    ["截断（finish_reason=length）", { finish: "length" }],
    ["空内容", { content: "" }],
    ["结构不符", { content: { matters: "x" } }],
  ])("%s 失败关闭", async (_name, change) => {
    const provider = createLlmProvider(config(), { fetchImpl: mockChat(() => change) });
    await expect(provider.extractCaseFacts({ caseText: text })).rejects.toThrow();
  });

  it("拒绝带完整法条回抄的旧格式报告", async () => {
    const request = await requestForReport();
    const full = await fixtures.analysis.generateReport!(request);
    const provider = createLlmProvider(config(), { fetchImpl: mockChat((_c) => ({ content: full })) });
    await expect(provider.generateReport!(request)).rejects.toThrow();
  });

  it.each([401, 429, 500])("HTTP %s 不返回上游正文或密钥", async (status) => {
    const transport = vi.fn<typeof fetch>(async () => new Response("secret-case-content", { status }));
    await expect(createLlmProvider(config(), { fetchImpl: transport }).extractCaseFacts({ caseText: text })).rejects.toThrow(`LLM HTTP ${status}`);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("限制响应大小", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response("x".repeat(1024)));
    await expect(createLlmProvider(config(), { fetchImpl: transport, maxResponseBytes: 32 }).extractCaseFacts({ caseText: text })).rejects.toThrow("大小限制");
  });

  it("配置缺失或地址不安全时不可用且不调用 HTTP", async () => {
    for (const overrides of [{ llmApiKey: null }, { llmModel: null }, { llmBaseUrl: "http://llm.test/v1" }, { llmBaseUrl: "https://u:p@llm.test/v1" }, { llmBaseUrl: "https://llm.test" }]) {
      const transport = mockChat();
      const provider = createLlmProvider({ ...config(), ...overrides }, { fetchImpl: transport });
      expect((await provider.getAvailability()).available).toBe(false);
      await expect(provider.extractCaseFacts({ caseText: text })).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    }
    const ok = createLlmProvider(config(), { fetchImpl: mockChat() });
    expect(await ok.getAvailability()).toEqual({ available: true, reason: null });
  });

  it("通过 API 端到端：提取与报告各调用一次模型", async () => {
    const transport = mockChat();
    const provider = createLlmProvider(config(), { fetchImpl: transport });
    const app = await buildApp({ config: config(), providers: { analysis: provider, dify: provider, content: createGovernedContentProvider() } });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/analysis/sessions", headers: headers(), payload: { caseText: text } });
      expect(response.statusCode).toBe(201);
      const report = (response.json() as AnalysisIntakeResponse).analyses[0].report;
      expect(report.modules).toHaveLength(6);
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
