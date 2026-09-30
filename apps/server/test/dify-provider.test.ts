import { describe, expect, it, vi } from "vitest";
import type { AnalysisIntakeResponse } from "@policymate/contracts";
import { createDifyProvider } from "../src/providers/dify";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { createGovernedContentProvider } from "../src/providers/content";
import { AnalysisEngine } from "../src/analysis/engine";
import { buildApp } from "../src/app";
import { anonymousTokens } from "../src/security";

const config = (): AppConfig => ({
  ...loadConfig({}), providerMode: "dify", enableTestControls: false,
  difyBaseUrl: "https://dify.test/v1", difyApiKey: "private-test-key",
  difyWorkflowVersion: "workflow-test-v1", staticDir: null,
});
const fixtures = createFixtureControls();
const text = "4月1日，张某在酒店殴打李某。";
const headers = () => ({ "x-pm-contract-version": "1.0", "x-pm-anonymous-token": anonymousTokens.issue().token });

function mockTransport(change?: (envelope: Record<string, unknown>) => unknown) {
  return vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/info")) return Response.json({ mode: "workflow" });
    if (String(url).endsWith("/parameters")) return Response.json({
      user_input_form: ["operation", "payload_json", "contract_version", "workflow_version"].map((variable) => ({ "text-input": { variable } })),
    });
    const request = JSON.parse(String(init?.body));
    const input = JSON.parse(request.inputs.payload_json);
    const { payload, operation, ...metadata } = input;
    const result = operation === "extract"
      ? await fixtures.analysis.extractCaseFacts(payload)
      : { ...await fixtures.analysis.generateReport!(payload), workflowVersion: metadata.workflowVersion, contentReleaseId: metadata.contentReleaseId };
    const envelope = { ...metadata, result };
    return Response.json({ data: { status: "succeeded", outputs: { result: change ? change(envelope) : envelope } } });
  });
}

async function requestForReport() {
  const [state] = await new AnalysisEngine(fixtures.analysis).createSessions({ caseText: text });
  const resolution = await fixtures.content.resolveCaseFocus!(state.facts);
  return { facts: state.facts, snapshot: state.snapshot, legalSources: resolution.legalSources, caseFocusId: resolution.caseFocusId, contentReleaseId: "release-trial-0001" };
}

describe("真实 Dify 提供者", () => {
  it("发送后端 Bearer、操作和版本化 payload，独立随机 user，不发送临时工作台状态", async () => {
    const transport = mockTransport();
    const provider = createDifyProvider(config(), { fetchImpl: transport });
    await provider.extractCaseFacts({ caseText: text });
    await provider.extractCaseFacts({ caseText: text });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe("https://dify.test/v1/workflows/run");
    expect(init?.headers).toEqual({ authorization: "Bearer private-test-key", "content-type": "application/json" });
    expect(init?.redirect).toBe("error");
    const sent = JSON.parse(String(init?.body));
    expect(sent.response_mode).toBe("blocking");
    expect(sent.inputs.operation).toBe("extract");
    expect(sent.inputs.contract_version).toBe("1.0");
    expect(JSON.parse(sent.inputs.payload_json).payload).toEqual({ caseText: text });
    expect(sent.user).toMatch(/^policymate-[0-9a-f-]+$/);
    expect(sent.user).not.toBe(JSON.parse(String(transport.mock.calls[1][1]?.body)).user);
    expect(String(init?.body)).not.toContain("private-test-key");
    expect(String(init?.body)).not.toContain("reviewed");
  });

  it("接受对象或仅一次 JSON 编码的 result", async () => {
    const provider = createDifyProvider(config(), { fetchImpl: mockTransport((envelope) => JSON.stringify(envelope)) });
    expect((await provider.extractCaseFacts({ caseText: text })).matters.length).toBeGreaterThan(0);
    const report = await provider.generateReport!(await requestForReport());
    expect(report.modules).toHaveLength(6);
  });

  it.each([
    ["contractVersion", "2.0"], ["promptVersion", "old"], ["workflowVersion", "other"],
    ["requestId", "late"], ["snapshotVersion", 999], ["snapshotHash", "other"], ["contentReleaseId", "other"],
  ])("拒绝 %s 错配", async (field, value) => {
    const provider = createDifyProvider(config(), { fetchImpl: mockTransport((envelope) => ({ ...envelope, [field]: value })) });
    await expect(provider.generateReport!(await requestForReport())).rejects.toThrow();
  });

  it.each(["workflowVersion", "contentReleaseId"])("拒绝报告正文 %s 与封装不一致", async (field) => {
    const provider = createDifyProvider(config(), { fetchImpl: mockTransport((envelope) => ({ ...envelope, result: { ...(envelope.result as object), [field]: "wrong" } })) });
    await expect(provider.generateReport!(await requestForReport())).rejects.toThrow();
  });

  it.each([{}, "```json\n{}\n```", "null", { result: {} }])("拒绝空、无效或不完整结构 %j", async (output) => {
    const provider = createDifyProvider(config(), { fetchImpl: mockTransport(() => output) });
    await expect(provider.extractCaseFacts({ caseText: text })).rejects.toThrow();
  });

  it.each([401, 429, 500])("HTTP %s 不返回上游正文或密钥", async (status) => {
    const transport = vi.fn<typeof fetch>(async () => new Response("secret-case-content", { status }));
    const provider = createDifyProvider(config(), { fetchImpl: transport });
    await expect(provider.extractCaseFacts({ caseText: text })).rejects.toThrow(`Dify HTTP ${status}`);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("HTTP 200 但 workflow failed 仍失败关闭，错误不携带原始正文", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ data: { status: "failed", error: "secret-case-content" } }));
    await expect(createDifyProvider(config(), { fetchImpl: transport }).extractCaseFacts({ caseText: text })).rejects.toThrow("Dify 工作流未成功完成");
  });

  it("有或无 content-length 时均限制响应大小", async () => {
    for (const headers of [{}, { "content-length": "1024" }]) {
      const transport = vi.fn<typeof fetch>(async () => new Response("x".repeat(1024), { headers }));
      await expect(createDifyProvider(config(), { fetchImpl: transport, maxResponseBytes: 32 }).extractCaseFacts({ caseText: text })).rejects.toThrow("大小限制");
    }
  });

  it("配置缺失、明文 URL、带凭据 URL 或未设置工作流版本时不可用且不调用 HTTP", async () => {
    for (const overrides of [{ difyApiKey: null }, { difyBaseUrl: "http://dify.test/v1" }, { difyBaseUrl: "https://u:p@dify.test/v1" }, { difyBaseUrl: "https://dify.test" }, { difyWorkflowVersion: null }]) {
      const transport = mockTransport();
      const provider = createDifyProvider({ ...config(), ...overrides }, { fetchImpl: transport });
      expect((await provider.getAvailability()).available).toBe(false);
      await expect(provider.extractCaseFacts({ caseText: text })).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    }
  });

  it("可用性探测检查应用类型和输入变量，不运行模型；短期缓存探测", async () => {
    const transport = mockTransport();
    const provider = createDifyProvider(config(), { fetchImpl: transport });
    expect(await provider.getAvailability()).toEqual({ available: true, reason: null });
    await provider.getAvailability();
    expect(transport).toHaveBeenCalledTimes(2);
    const invalid = vi.fn<typeof fetch>(async () => Response.json({ mode: "chat" }));
    expect((await createDifyProvider(config(), { fetchImpl: invalid }).getAvailability()).available).toBe(false);
  });

  it("真实 API 通过 Dify 提取和报告，缺伤情仍保留方向、受理及法源；文书不依赖模型", async () => {
    const transport = mockTransport();
    const provider = createDifyProvider(config(), { fetchImpl: transport });
    const app = await buildApp({ config: config(), providers: { analysis: provider, dify: provider, content: createGovernedContentProvider() } });
    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/analysis/sessions", headers: headers(), payload: { caseText: text } });
      expect(response.statusCode).toBe(201);
      const report = (response.json() as AnalysisIntakeResponse).analyses[0].report;
      expect(report.status).toBe("insufficient_facts");
      expect(report.headline).toContain("涉嫌殴打");
      expect(report.modules.find((module) => module.id === "filing_conditions")?.status).toBe("present");
      expect(report.modules.find((module) => module.id === "legal_basis_trace")?.traceLinks.length).toBeGreaterThan(0);
      expect(transport.mock.calls.filter(([url]) => String(url).endsWith("/workflows/run"))).toHaveLength(2);
      const reportRequest = JSON.parse(String(transport.mock.calls.at(-1)?.[1]?.body));
      expect(JSON.parse(reportRequest.inputs.payload_json).payload.gapBranches.length).toBeGreaterThan(0);
      const calls = transport.mock.calls.length;
      const documents = await app.inject({ url: "/api/v1/document-examples", headers: headers() });
      expect(documents.statusCode).toBe(200);
      expect(transport).toHaveBeenCalledTimes(calls);
      expect((await app.inject({ method: "POST", url: "/api/test/fixtures/reset" })).statusCode).toBe(404);
    } finally { await app.close(); }
  });

  it("取消与超时中止 fetch，取消不重试，超时最多一次重试", async () => {
    const signals: AbortSignal[] = [];
    const transport = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      signals.push(init!.signal!);
      init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const provider = createDifyProvider(config(), { fetchImpl: transport });
    const engine = new AnalysisEngine(provider, { analysisTimeoutMs: 30 });
    await expect(engine.createSessions({ caseText: text })).rejects.toThrow("暂时不可用");
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    const controller = new AbortController();
    const request = engine.createSessions({ caseText: text }, undefined, controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow("取消");
    expect(signals).toHaveLength(3);
    expect(signals[2].aborted).toBe(true);
  });
});

describe("Dify 模式配置", () => {
  it("开发默认替身，生产默认真实模式且分析默认关闭", () => {
    expect(loadConfig({}).providerMode).toBe("fixture");
    expect(loadConfig({ NODE_ENV: "production" })).toMatchObject({ providerMode: "dify", analysisEnabled: false });
    expect(loadConfig({ PM_PROVIDER_MODE: "dify", PM_DIFY_WORKFLOW_VERSION: "v1" }).difyWorkflowVersion).toBe("v1");
  });
  it("拒绝未知模式或真实模式测试控制", () => {
    expect(() => loadConfig({ PM_PROVIDER_MODE: "typo" })).toThrow();
    expect(() => loadConfig({ PM_PROVIDER_MODE: "dify", PM_ENABLE_TEST_CONTROLS: "1" })).toThrow();
    expect(() => loadConfig({ NODE_ENV: "production", PM_PROVIDER_MODE: "fixture", PM_ENABLE_TEST_CONTROLS: "1" })).toThrow();
  });
});
