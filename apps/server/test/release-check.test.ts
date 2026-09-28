import { describe, expect, it } from "vitest";
import { loadConfig, resolveRuntimeConfig, type AppConfig } from "../src/config";
import {
  checkDataUseReadiness,
  checkReleaseReadiness,
  isPlaceholderValue,
  MIN_ELIGIBLE_DOCUMENT_EXAMPLES,
} from "../src/release-check";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    providerMode: "fixture",
    enableTestControls: false,
    masterSwitch: true,
    analysisEnabled: true,
    documentsEnabled: true,
    staticDir: null,
    service: {
      provider: "松阳县公安局",
      contact: "试行联系人 0578-0000000",
      dataProcessingStatement: "仅用于本次受控试行的功能验证，不用于训练。",
      technicalLoggingBoundary: ["云主机负载均衡可能记录不含请求体的访问元数据。"],
    },
    allowedOrigins: ["https://trial.example"],
    ...overrides,
  };
}

function run(
  config: AppConfig,
  eligibleExampleCount = MIN_ELIGIBLE_DOCUMENT_EXAMPLES,
  caseFocusCoverage?: { required: readonly string[]; eligible: readonly string[] },
) {
  return checkReleaseReadiness({
    config,
    runtime: resolveRuntimeConfig(config),
    eligibleExampleCount,
    ...(caseFocusCoverage === undefined ? {} : { caseFocusCoverage }),
  });
}

describe("使用与数据说明发布门槛", () => {
  it("缺少实际服务信息时失败", () => {
    const result = checkDataUseReadiness({
      provider: null,
      contact: null,
      dataProcessingStatement: null,
      technicalLoggingBoundary: [],
    });
    expect(result.failures.length).toBeGreaterThanOrEqual(4);
  });

  it("占位值被识别并失败", () => {
    expect(isPlaceholderValue("待填写")).toBe(true);
    expect(isPlaceholderValue("TODO")).toBe(true);
    expect(isPlaceholderValue("example.com")).toBe(true);
    expect(isPlaceholderValue("松阳县公安局")).toBe(false);

    const result = checkDataUseReadiness({
      provider: "示例公司",
      contact: "待定",
      dataProcessingStatement: "TODO",
      technicalLoggingBoundary: ["占位"],
    });
    expect(result.failures.length).toBeGreaterThanOrEqual(4);
  });

  it("完整配置通过", () => {
    const result = checkDataUseReadiness(testConfig().service);
    expect(result.failures).toEqual([]);
  });
});

describe("受控试行发布检查", () => {
  it("文书范例覆盖不足时失败", () => {
    const result = run(testConfig(), MIN_ELIGIBLE_DOCUMENT_EXAMPLES - 1);
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("合格文书范例");
  });

  it("全部满足时通过", () => {
    const result = run(testConfig());
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("重点案情未达到发布门槛时失败", () => {
    const result = run(testConfig(), MIN_ELIGIBLE_DOCUMENT_EXAMPLES, {
      required: ["focus-a", "focus-b"],
      eligible: ["focus-a"],
    });
    expect(result.ok).toBe(false);
    const joined = result.failures.join("\n");
    expect(joined).toContain("重点案情");
    expect(joined).toContain("focus-b");
    expect(joined).not.toContain("focus-a");
  });

  it("重点案情全部合格时通过", () => {
    const result = run(testConfig(), MIN_ELIGIBLE_DOCUMENT_EXAMPLES, {
      required: ["focus-a", "focus-b"],
      eligible: ["focus-a", "focus-b", "focus-c"],
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("生产环境禁用测试控制并要求 HTTPS", () => {
    const result = run(
      testConfig({
        environment: "production",
        enableTestControls: true,
        difyBaseUrl: "http://dify.internal/v1",
        allowedOrigins: ["http://trial.example"],
      }),
    );
    expect(result.ok).toBe(false);
    const joined = result.failures.join("\n");
    expect(joined).toContain("测试用替身");
    expect(joined).toContain("HTTPS");
    expect(joined).toContain("明文 HTTP");
  });

  it("默认加载的配置在缺少服务信息时会失败", () => {
    const config = loadConfig({});
    const result = run(config, MIN_ELIGIBLE_DOCUMENT_EXAMPLES);
    expect(result.ok).toBe(false);
  });
});
