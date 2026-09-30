import { describe, expect, it } from "vitest";
import type { AnalysisIntakeResponse, AnalysisSubmissionResponse, CreateAnalysisRequest, GenerateReportRequest } from "@policymate/contracts";
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

function submitCase(app: App) {
  return app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers,
    payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
  });
}

async function submitAndGetSession(app: App): Promise<AnalysisSubmissionResponse> {
  const created = await submitCase(app);
  expect(created.statusCode).toBe(201);
  const body = created.json() as AnalysisIntakeResponse;
  const first = body.analyses[0];
  if (first === undefined) throw new Error("提交案情未返回分析。");
  return { contractVersion: body.contractVersion, state: first.state, report: first.report };
}

function generateReport(app: App, submission: AnalysisSubmissionResponse) {
  const snapshot = submission.state.snapshot;
  if (snapshot === null) throw new Error("缺少事实快照。");
  return app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${submission.state.sessionId}/report`,
    headers,
    payload: {
      contractVersion: "1.0",
      requestId: "33333333-3333-4333-8333-333333333333",
      snapshotVersion: snapshot.snapshotVersion,
      snapshotHash: snapshot.snapshotHash,
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

    const response = await submitCase(app);
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.requestId).toBeTruthy();

    expect(attemptsFor(telemetry, "analysis.extraction")).toEqual([1, 2]);
    await app.close();
  });

  it("提取空结果或结构错误：重试一次后失败关闭", async () => {
    for (const extractionMode of ["empty", "malformed"] as const) {
      const { app, fixtures } = await makeApp({ analysisTimeoutMs: 500 });
      fixtures.updateState({ extractionMode });
      const response = await submitCase(app);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("service_unavailable");
      await app.close();
    }
  });

  it("报告空结果、结构错误、来源不匹配、跨模块矛盾或超时：失败关闭", async () => {
    const modes = ["empty", "malformed", "unmatched_source", "contradiction", "timeout"] as const;
    for (const reportMode of modes) {
      const { app, fixtures, telemetry } = await makeApp({ reportTimeoutMs: 20 });
      const submission = await submitAndGetSession(app);
      fixtures.updateState({ reportMode });

      const response = await generateReport(app, submission);
      expect(response.statusCode, `reportMode=${reportMode}`).toBe(503);
      const body = response.json();
      expect(body.error.code).toBe("service_unavailable");
      expect(body.error.requestId).toBeTruthy();
      expect(JSON.stringify(body)).not.toContain(SAMPLE_TEXT);
      expect(attemptsFor(telemetry, "analysis.report").slice(-2)).toEqual([1, 2]);
      await app.close();
    }
  });

  it("报告失败后的迟到响应不得改变已确认快照：同一版本与哈希仍可重新生成", async () => {
    const { app, fixtures } = await makeApp({ reportTimeoutMs: 20 });
    const submission = await submitAndGetSession(app);
    const snapshot = submission.state.snapshot;

    fixtures.updateState({ reportMode: "timeout" });
    const timedOut = await generateReport(app, submission);
    expect(timedOut.statusCode).toBe(503);

    fixtures.updateState({ reportMode: "complete" });
    const retry = await generateReport(app, submission);
    expect(retry.statusCode).toBe(200);
    const body = retry.json();
    expect(body.snapshotVersion).toBe(snapshot?.snapshotVersion);
    expect(body.snapshotHash).toBe(snapshot?.snapshotHash);
    await app.close();
  });

  it("次要模块局部失败时保留其他模块并明确标记局部失败", async () => {
    const { app, fixtures } = await makeApp({ reportTimeoutMs: 500 });
    const submission = await submitAndGetSession(app);
    fixtures.updateState({ reportMode: "partial_failure" });

    const response = await generateReport(app, submission);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("partial_failure");

    const failed = body.modules.filter(
      (module: { status: string }) => module.status === "generation_failed",
    );
    expect(failed.length).toBeGreaterThan(0);
    for (const module of failed) {
      expect(module.failureReason).toBeTruthy();
    }
    // 关键模块仍通过校验，报告不因次要模块失败而整体失败。
    for (const moduleId of ["preliminary_qualification", "filing_conditions", "legal_basis_trace"]) {
      const module = body.modules.find((item: { id: string }) => item.id === moduleId);
      expect(module?.status).not.toBe("generation_failed");
    }
    await app.close();
  });

  it("正常路径不受重试策略影响", async () => {
    const { app } = await makeApp({ analysisTimeoutMs: 500, reportTimeoutMs: 500 });
    const response = await submitCase(app);
    expect(response.statusCode).toBe(201);
    expect(response.json().analyses[0].report.status).toBe("complete");
    await app.close();
  });

  it("替身超时模式必须长于测试注入的超时上限", () => {
    expect(FIXTURE_TIMEOUT_DELAY_MS).toBeGreaterThan(20);
  });
});
