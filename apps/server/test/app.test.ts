import { describe, expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  type ApiErrorBody,
  type DataUseResponse,
  type ProductShellResponse,
} from "@policymate/contracts";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";

const contractHeaders = { "x-pm-contract-version": CONTRACT_VERSION };

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    providerMode: "fixture",
    enableTestControls: true,
    masterSwitch: true,
    analysisEnabled: true,
    documentsEnabled: true,
    staticDir: null,
    service: {
      provider: null,
      contact: null,
      dataProcessingStatement: null,
      technicalLoggingBoundary: [],
    },
    ...overrides,
  };
}

async function makeApp(overrides: Partial<AppConfig> = {}) {
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(overrides), fixtures });
  return { app, fixtures };
}

function getShell(app: FastifyInstance) {
  return app.inject({ method: "GET", url: "/api/v1/shell", headers: contractHeaders });
}

function getDataUse(app: FastifyInstance) {
  return app.inject({ method: "GET", url: "/api/v1/data-use", headers: contractHeaders });
}

describe("GET /api/v1/shell", () => {
  it("返回两个可用入口和契约版本", async () => {
    const { app } = await makeApp();
    const response = await getShell(app);

    expect(response.statusCode).toBe(200);
    const body = response.json<ProductShellResponse>();
    expect(body.contractVersion).toBe(CONTRACT_VERSION);
    expect(body.entries.caseAnalysis.available).toBe(true);
    expect(body.entries.documentExamples.available).toBe(true);
    expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
    await app.close();
  });

  it("在替身状态下反映分析服务不可用，但保持文书范例可用", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { difyAvailable: false },
    });

    const body = (await getShell(app)).json<ProductShellResponse>();

    expect(body.entries.caseAnalysis.available).toBe(false);
    expect(body.entries.caseAnalysis.reason).toBeTruthy();
    expect(body.entries.documentExamples.available).toBe(true);
    await app.close();
  });

  it("当前批次没有合格范例时禁用文书范例入口", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { eligibleExampleCount: 0 },
    });

    const body = (await getShell(app)).json<ProductShellResponse>();

    expect(body.entries.documentExamples.available).toBe(false);
    expect(body.entries.caseAnalysis.available).toBe(true);
    await app.close();
  });

  it("总开关关闭时两个入口都不可用", async () => {
    const { app } = await makeApp({ masterSwitch: false });
    const body = (await getShell(app)).json<ProductShellResponse>();

    expect(body.entries.caseAnalysis.available).toBe(false);
    expect(body.entries.documentExamples.available).toBe(false);
    await app.close();
  });

  it("设置降低搜索引擎收录概率的响应头", async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.headers["x-robots-tag"]).toContain("noindex");
    await app.close();
  });
});

describe("契约版本校验", () => {
  it("拒绝不兼容的契约版本", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shell",
      headers: { "x-pm-contract-version": "0.9" },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<ApiErrorBody>();
    expect(body.error.code).toBe("contract_incompatible");
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });

  it("拒绝缺少契约版本的请求", async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/shell" });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorBody>().error.code).toBe("invalid_request");
    await app.close();
  });

  it("健康检查与测试控制接口不要求契约版本", async () => {
    const { app } = await makeApp();
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    const controls = await app.inject({ method: "POST", url: "/api/test/fixtures/reset" });

    expect(health.statusCode).toBe(200);
    expect(controls.statusCode).toBe(200);
    await app.close();
  });
});

describe("替身控制接口", () => {
  it("可以重置替身状态", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { difyAvailable: false, eligibleExampleCount: 0 },
    });
    const reset = await app.inject({ method: "POST", url: "/api/test/fixtures/reset" });

    expect(reset.json()).toEqual({ difyAvailable: true, eligibleExampleCount: 1 });
    await app.close();
  });

  it("拒绝无效的替身参数", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { eligibleExampleCount: -2 },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("未启用测试控制时不挂载控制接口", async () => {
    const { app } = await makeApp({ enableTestControls: false });
    const response = await app.inject({ method: "POST", url: "/api/test/fixtures", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().error.code).toBe("not_found");
    await app.close();
  });
});

describe("GET /api/v1/data-use", () => {
  it("提供使用与数据说明的必需章节", async () => {
    const { app } = await makeApp();
    const response = await getDataUse(app);
    const body = response.json<DataUseResponse>();
    const ids = body.sections.map((section) => section.id);

    expect(response.statusCode).toBe(200);
    expect(body.contractVersion).toBe(CONTRACT_VERSION);
    for (const required of [
      "purpose",
      "desensitization",
      "dify",
      "lifetime",
      "metadata",
      "distribution",
    ]) {
      expect(ids).toContain(required);
    }
    await app.close();
  });

  it("未配置部署信息时如实返回 null，而不是编造主体", async () => {
    const { app } = await makeApp();
    const body = (await getDataUse(app)).json<DataUseResponse>();

    expect(body.service.provider).toBeNull();
    expect(body.service.contact).toBeNull();
    await app.close();
  });

  it("返回已配置的服务信息", async () => {
    const { app } = await makeApp({
      service: {
        provider: "示例运维单位",
        contact: "试行反馈：example@example.invalid",
        dataProcessingStatement: "示例数据处理说明",
        technicalLoggingBoundary: ["云主机访问日志保留 7 天"],
      },
    });
    const body = (await getDataUse(app)).json<DataUseResponse>();

    expect(body.service.provider).toBe("示例运维单位");
    expect(body.service.technicalLoggingBoundary).toEqual(["云主机访问日志保留 7 天"]);
    await app.close();
  });
});

describe("API 未匹配路由", () => {
  it("对 API 路径返回结构化 404", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/does-not-exist",
      headers: contractHeaders,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().error.code).toBe("not_found");
    await app.close();
  });
});
