import { describe, expect, it } from "vitest";
import type { CreateAnalysisRequest } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { AnonymousTokenService } from "../src/security";
import { createMemoryTelemetrySink } from "../src/telemetry";

const CONTRACT = "x-pm-contract-version";
const TOKEN = "x-pm-anonymous-token";
const CANARY = "CANARY-7f3a9b-不得进入遥测";
const SAMPLE_TEXT = `3月2日晚上，张某在城南市场门口殴打李某。${CANARY}`;

const ALLOWED_KEYS = new Set([
  "requestId",
  "timestamp",
  "kind",
  "outcome",
  "status",
  "durationMs",
  "contractVersion",
  "workflowVersion",
  "contentReleaseId",
  "inputCharacters",
  "outputItems",
  "attempts",
  "matchedSourceIds",
  "featureCount",
  "featureState",
]);

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
      provider: null,
      contact: null,
      dataProcessingStatement: null,
      technicalLoggingBoundary: [],
    },
    ...overrides,
  };
}

const tokenService = new AnonymousTokenService();
const headers = { [CONTRACT]: "1.0", [TOKEN]: tokenService.issue().token };

async function makeApp() {
  const telemetry = createMemoryTelemetrySink();
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(), fixtures, tokenService, telemetry });
  return { app, telemetry };
}

describe("运行元数据不包含禁止内容", () => {
  it("案情、事实与回答不进入遥测记录", async () => {
    const { app, telemetry } = await makeApp();

    const session = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers,
      payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
    });
    expect(session.statusCode).toBe(201);

    const state = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${session.json().state.sessionId}`,
      headers,
    });
    expect(state.statusCode).toBe(200);

    const serialized = JSON.stringify(telemetry.events);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain("张某");
    expect(serialized).not.toContain("殴打");
    await app.close();
  });

  it("检索词不进入遥测，即使出现在请求查询字符串中", async () => {
    const { app, telemetry } = await makeApp();

    await app.inject({
      method: "GET",
      url: `/api/v1/document-examples?q=${encodeURIComponent(CANARY)}`,
      headers,
    });

    const serialized = JSON.stringify(telemetry.events);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain(encodeURIComponent(CANARY));
    await app.close();
  });

  it("遥测事件只包含白名单字段", async () => {
    const { app, telemetry } = await makeApp();
    await app.inject({ method: "GET", url: "/api/v1/shell", headers });
    await app.inject({ method: "GET", url: "/api/v1/document-examples", headers });

    expect(telemetry.events.length).toBeGreaterThan(0);
    for (const event of telemetry.events) {
      for (const key of Object.keys(event)) {
        expect(ALLOWED_KEYS.has(key), `非白名单字段：${key}`).toBe(true);
      }
    }
    await app.close();
  });

  it("写入端会丢弃未在白名单内的字段", () => {
    const sink = createMemoryTelemetrySink();
    sink.record({
      requestId: "req-1",
      timestamp: new Date().toISOString(),
      kind: "test",
      outcome: "ok",
      // 故意夹带内容字段，必须被丢弃。
      smuggled: CANARY,
    } as unknown as Parameters<typeof sink.record>[0]);
    expect(JSON.stringify(sink.events)).not.toContain(CANARY);
  });
});

describe("结构化反馈", () => {
  it("接受预定义类型与非内容元数据", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers,
      payload: {
        contractVersion: "1.0",
        category: "basis_unopenable",
        metadata: { pageId: "analysis_report", featureState: "case_analysis" },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accepted).toBe(true);
    expect(body.categoryLabel).toBe("依据无法打开");
    expect(body.requestId).toBeTruthy();
    await app.close();
  });

  it("拒绝自由文本和未知字段，避免夹带页面内容", async () => {
    const { app, telemetry } = await makeApp();
    const attempts = [
      { contractVersion: "1.0", category: "basis_unopenable", note: CANARY },
      { contractVersion: "1.0", category: "unknown_category" },
      { contractVersion: "1.0", category: "basis_unopenable", metadata: { freeText: CANARY } },
      { contractVersion: "1.0", category: "basis_unopenable", metadata: { pageId: CANARY } },
    ];
    for (const payload of attempts) {
      const response = await app.inject({ method: "POST", url: "/api/v1/feedback", headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("invalid_request");
    }
    expect(JSON.stringify(telemetry.events)).not.toContain(CANARY);
    await app.close();
  });

  it("反馈接口同样要求匿名令牌", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { [CONTRACT]: "1.0" },
      payload: { contractVersion: "1.0", category: "status_unclear" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
