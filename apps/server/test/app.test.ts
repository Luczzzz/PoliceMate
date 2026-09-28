import { describe, expect, it } from "vitest";
import {
  CONTRACT_VERSION,
  type ApiErrorBody,
  type DataUseResponse,
  type DocumentExampleDetailResponse,
  type DocumentExampleListResponse,
  type FixtureControlResponse,
  type ProductShellResponse,
} from "@policymate/contracts";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";

import { anonymousTokens } from "../src/security";

const contractHeaders = {
  "x-pm-contract-version": CONTRACT_VERSION,
  "x-pm-anonymous-token": anonymousTokens.issue().token,
};

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

function getExampleList(app: FastifyInstance, url = "/api/v1/document-examples") {
  return app.inject({ method: "GET", url, headers: contractHeaders });
}

function getExampleDetail(app: FastifyInstance, exampleId: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/document-examples/${exampleId}`,
    headers: contractHeaders,
  });
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
      payload: { exampleStatusAll: "withdrawn" },
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
      payload: { difyAvailable: false, exampleStatusAll: "withdrawn" },
    });
    const reset = await app.inject({ method: "POST", url: "/api/test/fixtures/reset" });
    const body = reset.json<FixtureControlResponse>();

    expect(body.difyAvailable).toBe(true);
    expect(body.eligibleExampleCount).toBeGreaterThanOrEqual(1);
    expect(body.examples.every((item) => item.contentStatus === "trial" && item.eligible)).toBe(
      true,
    );
    await app.close();
  });

  it("拒绝无效的替身参数", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { exampleStatusAll: "approved" },
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

describe("GET /api/v1/document-examples", () => {
  it("只返回通过状态门控的 trial 范例，并携带阶段目录与筛选计数", async () => {
    const { app } = await makeApp();
    const response = await getExampleList(app);
    const body = response.json<DocumentExampleListResponse>();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body.contractVersion).toBe(CONTRACT_VERSION);
    expect(body.releaseId).toBeTruthy();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((item) => item.contentStatus === "trial")).toBe(true);
    expect(body.stages).toHaveLength(6);
    expect(body.facets.stages).toHaveLength(6);
    expect(body.notice.notFormalTemplate).toBeTruthy();
    await app.close();
  });

  it("忽略检索词参数，检索词不进入后端处理", async () => {
    const { app } = await makeApp();
    const plain = (await getExampleList(app)).json<DocumentExampleListResponse>();
    const withQuery = (
      await getExampleList(app, "/api/v1/document-examples?q=受案+登记")
    ).json<DocumentExampleListResponse>();

    expect(withQuery.items.map((item) => item.exampleId)).toEqual(
      plain.items.map((item) => item.exampleId),
    );
    expect(JSON.stringify(withQuery)).not.toContain("受案 登记");
    await app.close();
  });

  it("列表不包含 draft、pending_verification 或 withdrawn 内容", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { exampleStatusAll: "pending_verification" },
    });

    const body = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(body.items).toEqual([]);
    await app.close();
  });

  it("依赖非 current 法源时内容退出列表", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { legalSourceStatusAll: "superseded" },
    });

    const body = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(body.items).toEqual([]);
    await app.close();
  });

  it("内容到期后退出列表", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { examplesExpired: true },
    });

    const body = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(body.items).toEqual([]);
    await app.close();
  });
});

describe("GET /api/v1/document-examples/:exampleId", () => {
  async function firstExampleId(app: FastifyInstance): Promise<string> {
    const body = (await getExampleList(app)).json<DocumentExampleListResponse>();
    const id = body.items[0]?.exampleId;
    expect(id).toBeTruthy();
    return id as string;
  }

  it("返回完整详情、法源依据与治理信息", async () => {
    const { app } = await makeApp();
    const exampleId = await firstExampleId(app);
    const response = await getExampleDetail(app, exampleId);
    const body = response.json<DocumentExampleDetailResponse>();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body.example.exampleId).toBe(exampleId);
    expect(body.example.applicableScenarios.length).toBeGreaterThan(0);
    expect(body.example.exclusions.length).toBeGreaterThan(0);
    expect(body.example.prerequisites.length).toBeGreaterThan(0);
    expect(body.example.structure.length).toBeGreaterThan(0);
    expect(body.example.annotatedExample.length).toBeGreaterThan(0);
    expect(body.example.productionPoints.length).toBeGreaterThan(0);
    expect(body.example.commonErrors.length).toBeGreaterThan(0);
    expect(body.example.legalSources[0]?.statusLabel).toBe("现行有效");
    expect(body.example.governance.releaseId).toBe(body.releaseId);
    expect(body.notice.fictionalData).toBeTruthy();
    await app.close();
  });

  it("未知标识返回 not_found", async () => {
    const { app } = await makeApp();
    const response = await getExampleDetail(app, "doc-does-not-exist");

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().error.code).toBe("not_found");
    await app.close();
  });

  it("单项下架后旧链接不能访问正文", async () => {
    const { app } = await makeApp();
    const exampleId = await firstExampleId(app);

    expect((await getExampleDetail(app, exampleId)).statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { exampleStatus: { exampleId, status: "withdrawn" } },
    });

    const blocked = await getExampleDetail(app, exampleId);
    expect(blocked.statusCode).toBe(410);
    expect(blocked.json<ApiErrorBody>().error.code).toBe("content_unavailable");

    const list = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(list.items.some((item) => item.exampleId === exampleId)).toBe(false);
    await app.close();
  });

  it("法源失效后已打开的标识同样被阻断", async () => {
    const { app } = await makeApp();
    const exampleId = await firstExampleId(app);

    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { legalSourceStatusAll: "repealed" },
    });

    const blocked = await getExampleDetail(app, exampleId);
    expect(blocked.statusCode).toBe(410);
    expect(blocked.json<ApiErrorBody>().error.code).toBe("content_unavailable");
    await app.close();
  });

  it("仍要求契约版本请求头", async () => {
    const { app } = await makeApp();
    const exampleId = await firstExampleId(app);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/document-examples/${exampleId}`,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("受治理内容替身状态", () => {
  it("报告每个测试范例的治理状态与可用性", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      payload: { exampleStatusAll: "draft", examplesExpired: true },
    });
    const body = response.json<FixtureControlResponse>();

    expect(body.eligibleExampleCount).toBe(0);
    expect(body.examples.every((item) => item.contentStatus === "draft")).toBe(true);
    expect(body.examples.every((item) => item.eligible === false)).toBe(true);
    await app.close();
  });
});

describe("文书范例入口停用与总开关", () => {
  it("文书入口停用时列表与旧链接都不返回正文", async () => {
    const { app } = await makeApp({ documentsEnabled: false });
    const list = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(list.items).toEqual([]);
    expect(list.releaseId).toBe("");

    const exampleId = "doc-test-reception-register";
    const detail = await getExampleDetail(app, exampleId);
    expect(detail.statusCode).toBe(410);
    expect(detail.json<ApiErrorBody>().error.code).toBe("content_unavailable");
    await app.close();
  });

  it("总开关关闭时同样阻断正文", async () => {
    const { app } = await makeApp({ masterSwitch: false });
    const list = (await getExampleList(app)).json<DocumentExampleListResponse>();
    expect(list.items).toEqual([]);

    const detail = await getExampleDetail(app, "doc-test-reception-register");
    expect(detail.statusCode).toBe(410);
    await app.close();
  });
});
