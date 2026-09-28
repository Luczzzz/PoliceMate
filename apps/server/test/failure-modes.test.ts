import { describe, expect, it } from "vitest";
import type { CreateAnalysisRequest, GenerateReportRequest } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls, FIXTURE_TIMEOUT_DELAY_MS } from "../src/providers/fixture";
import { AnonymousTokenService } from "../src/security";
import { createMemoryTelemetrySink, type MemoryTelemetrySink } from "../src/telemetry";

const CONTRACT = "x-pm-contract-version";
const TOKEN = "x-pm-anonymous-token";
const SAMPLE_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

const tokenService = new AnonymousTokenService();
const headers = { [CONTRACT]: "1.0", [TOKEN]: tokenService.issue().token };

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

async function makeApp(overrides: Partial<AppConfig> = {}) {
  const telemetry = createMemoryTelemetrySink();
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(overrides), fixtures, tokenService, telemetry });
  return { app, fixtures, telemetry };
}

type App = Awaited<ReturnType<typeof buildApp>>;

function createSession(app: App) {
  return app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers,
    payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
  });
}

async function runToSnapshot(app: App): Promise<{
  sessionId: string;
  snapshotVersion: number;
  snapshotHash: string;
}> {
  const created = await createSession(app);
  expect(created.statusCode).toBe(201);
  let current = created.json();

  const started = await app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${current.sessionId}/rounds`,
    headers,
    payload: { answers: [] },
  });
  current = started.json();

  let guard = 0;
  while (current.stage === "collecting_answers" && guard < 6) {
    guard += 1;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${current.sessionId}/rounds`,
      headers,
      payload: {
        answers: current.questions.map((question: { questionId: string }) => ({
          questionId: question.questionId,
          kind: "value",
          text: "已核实的情况说明。",
        })),
      },
    });
    current = response.json();
  }
  expect(current.stage).toBe("ready_to_analyze");

  const confirm = await app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${current.sessionId}/snapshot`,
    headers,
    payload: {},
  });
  const body = confirm.json();
  expect(body.stage).toBe("snapshot_confirmed");
  return {
    sessionId: body.sessionId,
    snapshotVersion: body.snapshot.snapshotVersion,
    snapshotHash: body.snapshot.snapshotHash,
  };
}

function generateReport(app: App, session: { sessionId: string; snapshotVersion: number; snapshotHash: string }) {
  return app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${session.sessionId}/report`,
    headers,
    payload: {
      contractVersion: "1.0",
      requestId: "33333333-3333-4333-8333-333333333333",
      snapshotVersion: session.snapshotVersion,
      snapshotHash: session.snapshotHash,
    } satisfies GenerateReportRequest,
  });
}

function attemptsFor(telemetry: MemoryTelemetrySink, kind: string): number[] {
  return telemetry.events
    .filter((event) => event.kind === kind)
    .map((event) => event.attempts ?? 0)
    .filter((value) => value > 0);
}

describe("外部边界失败关闭与单次重试", () => {
  it("提取超时：重试一次后失败关闭并返回请求编号", async () => {
    const { app, fixtures, telemetry } = await makeApp({ analysisTimeoutMs: 20 });
    fixtures.updateState({ extractionMode: "timeout" });

    const response = await createSession(app);
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.requestId).toBeTruthy();

    const attempts = attemptsFor(telemetry, "analysis.extraction");
    expect(attempts).toEqual([1, 2]);
    await app.close();
  });

  it("提取空结果或结构错误：重试一次后失败关闭", async () => {
    for (const extractionMode of ["empty", "malformed"] as const) {
      const { app, fixtures } = await makeApp({ analysisTimeoutMs: 500 });
      fixtures.updateState({ extractionMode });
      const response = await createSession(app);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("service_unavailable");
      await app.close();
    }
  });

  it("追问结构错误：重试一次后失败关闭", async () => {
    const { app, fixtures } = await makeApp({ analysisTimeoutMs: 20 });
    const created = await createSession(app);
    fixtures.updateState({ questionMode: "malformed" });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${created.json().sessionId}/rounds`,
      headers,
      payload: { answers: [] },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("报告空结果、结构错误、来源不匹配、跨模块矛盾或超时：失败关闭", async () => {
    const modes = ["empty", "malformed", "unmatched_source", "contradiction", "timeout"] as const;
    for (const reportMode of modes) {
      const { app, fixtures, telemetry } = await makeApp({ reportTimeoutMs: 20 });
      const session = await runToSnapshot(app);
      fixtures.updateState({ reportMode });

      const response = await generateReport(app, session);
      expect(response.statusCode, `reportMode=${reportMode}`).toBe(503);
      const body = response.json();
      expect(body.error.code).toBe("service_unavailable");
      expect(body.error.requestId).toBeTruthy();
      expect(JSON.stringify(body)).not.toContain(SAMPLE_TEXT);
      expect(attemptsFor(telemetry, "analysis.report")).toEqual([1, 2]);
      await app.close();
    }
  });

  it("正常路径不受重试策略影响", async () => {
    const { app } = await makeApp({ analysisTimeoutMs: 500, reportTimeoutMs: 500 });
    const session = await runToSnapshot(app);
    const response = await generateReport(app, session);
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("complete");
    await app.close();
  });

  it("替身超时模式必须长于测试注入的超时上限", () => {
    expect(FIXTURE_TIMEOUT_DELAY_MS).toBeGreaterThan(20);
  });
});
