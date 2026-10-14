import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, type ProductShellResponse } from "@policymate/contracts";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { createGovernedContentProvider } from "../src/providers/content";
import type { Providers } from "../src/providers/types";
import { anonymousTokens } from "../src/security";

const headers = () => ({ "x-pm-contract-version": CONTRACT_VERSION, "x-pm-anonymous-token": anonymousTokens.issue().token });

describe("PM_REPORT_FORMAT 配置（ADR-0015）", () => {
  it("未设置时：llm 默认 stream，fixture 与 dify 默认 structured", () => {
    expect(loadConfig({ PM_PROVIDER_MODE: "llm" }).reportFormat).toBe("stream");
    expect(loadConfig({ PM_PROVIDER_MODE: "fixture" }).reportFormat).toBe("structured");
    expect(loadConfig({ PM_PROVIDER_MODE: "dify" }).reportFormat).toBe("structured");
  });

  it("显式设置优先于默认值；非法值直接报错", () => {
    expect(loadConfig({ PM_PROVIDER_MODE: "llm", PM_REPORT_FORMAT: "structured" }).reportFormat).toBe("structured");
    expect(loadConfig({ PM_PROVIDER_MODE: "fixture", PM_REPORT_FORMAT: "stream" }).reportFormat).toBe("stream");
    expect(() => loadConfig({ PM_REPORT_FORMAT: "markdown" })).toThrow(/PM_REPORT_FORMAT/);
  });

  it("流式空闲超时与字符上限有默认值，可由环境变量覆盖", () => {
    const defaults = loadConfig({});
    expect(defaults.streamIdleTimeoutMs).toBe(30_000);
    expect(defaults.streamMaxChars).toBeGreaterThan(0);
    const custom = loadConfig({ PM_STREAM_IDLE_TIMEOUT_MS: "5000", PM_STREAM_MAX_CHARS: "2000" });
    expect(custom.streamIdleTimeoutMs).toBe(5000);
    expect(custom.streamMaxChars).toBe(2000);
  });
});

describe("首页入口与流式能力", () => {
  const baseConfig = (over: Partial<AppConfig> = {}): AppConfig => ({ ...loadConfig({}), staticDir: null, enableTestControls: false, ...over });
  const shell = async (config: AppConfig, providers?: Providers) => {
    const app = await buildApp(providers ? { config, providers } : { config, fixtures: createFixtureControls() });
    const response = await app.inject({ method: "GET", url: "/api/v1/shell", headers: headers() });
    return response.json() as ProductShellResponse & { reportFormat?: string };
  };

  it("shell 响应告诉前端当前的报告形态", async () => {
    expect((await shell(baseConfig({ reportFormat: "stream" }))).reportFormat).toBe("stream");
    expect((await shell(baseConfig({ reportFormat: "structured" }))).reportFormat).toBe("structured");
  });

  it("选了 stream 但提供者不支持流式（如 dify）时，案情分析入口失败关闭，不静默回退", async () => {
    const fixtures = createFixtureControls();
    const { streamAnalysis: _unused, ...analysisWithoutStream } = fixtures.analysis;
    const providers: Providers = { dify: fixtures.dify, analysis: analysisWithoutStream, content: createGovernedContentProvider() };
    const body = await shell(baseConfig({ reportFormat: "stream", providerMode: "dify" }), providers);
    expect(body.entries.caseAnalysis.available).toBe(false);
    expect(body.entries.caseAnalysis.reason).toContain("流式");
    const structured = await shell(baseConfig({ reportFormat: "structured", providerMode: "dify" }), providers);
    expect(structured.entries.caseAnalysis.available).toBe(true);
  });
});
