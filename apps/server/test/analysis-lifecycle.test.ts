import { describe, expect, it } from "vitest";
import type {
  AnalysisSubmissionResponse,
  CreateAnalysisRequest,
  GenerateReportRequest,
} from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { AnonymousTokenService } from "../src/security";

/**
 * 报告生命周期：超时、迟到响应、取消与清除后的失败关闭。
 *
 * 覆盖规格 12.2、11.6：超时或清除后的迟到响应不得改变会话状态，
 * 旧快照版本的请求必须被拒绝，同一有效快照仍可重新生成报告。
 */

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
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(overrides), fixtures, tokenService });
  return { app, fixtures };
}

type App = Awaited<ReturnType<typeof buildApp>>;

interface SnapshotSession {
  sessionId: string;
  snapshotVersion: number;
  snapshotHash: string;
}

async function submitCase(app: App): Promise<SnapshotSession> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers,
    payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
  });
  expect(created.statusCode).toBe(201);
  const body = created.json() as AnalysisSubmissionResponse;
  const snapshot = body.state.snapshot;
  if (snapshot === null) throw new Error("缺少事实快照。");
  return {
    sessionId: body.state.sessionId,
    snapshotVersion: snapshot.snapshotVersion,
    snapshotHash: snapshot.snapshotHash,
  };
}

function generateReport(app: App, session: SnapshotSession, overrides: Partial<GenerateReportRequest> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${session.sessionId}/report`,
    headers,
    payload: {
      contractVersion: "1.0",
      requestId: "55555555-5555-4555-8555-555555555555",
      snapshotVersion: session.snapshotVersion,
      snapshotHash: session.snapshotHash,
      ...overrides,
    } satisfies GenerateReportRequest,
  });
}

describe("报告生命周期与迟到响应", () => {
  it("报告超时后的迟到响应不得回写会话状态", async () => {
    const { app, fixtures } = await makeApp({ reportTimeoutMs: 20 });
    const session = await submitCase(app);

    fixtures.updateState({ reportMode: "timeout" });
    const timedOut = await generateReport(app, session);
    expect(timedOut.statusCode).toBe(503);
    expect(timedOut.json().error.requestId).toBeTruthy();

    // 超时尝试不得改变已确认快照：同一版本与哈希仍可重新生成报告。
    fixtures.updateState({ reportMode: "complete" });
    const retry = await generateReport(app, session);
    expect(retry.statusCode).toBe(200);
    const body = retry.json();
    expect(body.snapshotVersion).toBe(session.snapshotVersion);
    expect(body.snapshotHash).toBe(session.snapshotHash);
    await app.close();
  });

  it("清除分析后的迟到响应被拒绝", async () => {
    const { app } = await makeApp({ reportTimeoutMs: 500 });
    const session = await submitCase(app);

    const cleared = await app.inject({
      method: "DELETE",
      url: `/api/v1/analysis/sessions/${session.sessionId}`,
      headers,
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().cleared).toBe(true);

    const late = await generateReport(app, session);
    expect(late.statusCode).toBe(404);
    expect(late.json().error.code).toBe("not_found");
    await app.close();
  });

  it("旧快照版本的迟到响应在新快照后失败关闭", async () => {
    const { app } = await makeApp({ reportTimeoutMs: 500 });
    const session = await submitCase(app);

    // 进入补充或修改事实并确认，形成新版本快照。
    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);
    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/snapshot`,
      headers,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);
    const newVersion = (confirmed.json() as AnalysisSubmissionResponse).state.snapshot?.snapshotVersion;
    expect(newVersion).not.toBe(session.snapshotVersion);

    const late = await generateReport(app, session);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("invalid_request");
    await app.close();
  });
});
