import { describe, expect, it } from "vitest";
import type {
  AnalysisReport,
  AnalysisSubmissionResponse,
  CandidateFact,
  CreateAnalysisRequest,
  GenerateReportRequest,
} from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { AnalysisEngine, SESSION_IDLE_TTL_MS } from "../src/analysis/engine";
import { createFixtureControls } from "../src/providers/fixture";

import { anonymousTokens } from "../src/security";

const contractHeaders = {
  "x-pm-contract-version": "1.0",
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
    service: { provider: null, contact: null, dataProcessingStatement: null, technicalLoggingBoundary: [] },
    ...overrides,
  };
}

async function makeApp(overrides: Partial<AppConfig> = {}) {
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(overrides), fixtures });
  return { app, fixtures };
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function submitCase(app: App, caseText: string): Promise<AnalysisSubmissionResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers: contractHeaders,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AnalysisSubmissionResponse;
}

const SAMPLE_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

describe("POST /api/v1/analysis/sessions", () => {
  it("提交案情一次请求即返回事实快照与分析报告，无需确认或回答步骤", async () => {
    const { app } = await makeApp();
    const { state, report } = await submitCase(app, SAMPLE_TEXT);

    expect(state.contractVersion).toBe("1.0");
    expect(state.sessionId).not.toBe("");
    expect(state.stage).toBe("snapshot_confirmed");
    expect(state.snapshot?.snapshotVersion).toBe(1);
    expect(state.snapshot?.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.caseCharacterCount).toBe(Array.from(SAMPLE_TEXT).length);

    // 快照与分析报告在同一次响应中取得，报告绑定同一快照。
    expect(report.sessionId).toBe(state.sessionId);
    expect(report.snapshotVersion).toBe(state.snapshot?.snapshotVersion);
    expect(report.snapshotHash).toBe(state.snapshot?.snapshotHash);
    expect(report.modules).toHaveLength(6);
    await app.close();
  });

  it("候选事实保持未经民警确认，不默认确认任何事实", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, SAMPLE_TEXT);

    expect(state.facts.length).toBeGreaterThan(0);
    for (const fact of state.facts) {
      expect(fact.status).toBe("candidate");
      expect(fact.confirmationMethod).toBeNull();
      expect(fact.factId).toMatch(/^fact-/);
      expect(fact.originalWording).not.toBe("");
    }
    await app.close();
  });

  it("拒绝超过 10,000 字符的案情，且不静默截断", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "打".repeat(10_001) },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("10,000");
    await app.close();
  });

  it("拒绝包含控制字符等非纯文本内容", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "案情\u0000内容" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_input");
    expect(response.json().error.message).toContain("纯文本");
    await app.close();
  });

  it("拒绝空案情并要求契约版本请求头", async () => {
    const { app } = await makeApp();
    const empty = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const noHeader = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(noHeader.statusCode).toBe(400);
    await app.close();
  });

  it("分析服务不可用时失败关闭", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      headers: contractHeaders,
      payload: { difyAvailable: false },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("service_unavailable");
    await app.close();
  });

  it("案情分析能力停用时失败关闭", async () => {
    const { app } = await makeApp({ analysisEnabled: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("feature_disabled");
    await app.close();
  });

  it("报告生成边界不可用时整体失败关闭且不返回半成品", async () => {
    const { app, fixtures } = await makeApp({ reportTimeoutMs: 20 });
    fixtures.updateState({ reportMode: "malformed" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(JSON.stringify(body)).not.toContain(SAMPLE_TEXT);
    await app.close();
  });

  it("提取结果不符合结构契约时拒绝创建会话", async () => {
    const fixtures = createFixtureControls();
    const brokenAnalysis = {
      async extractCaseFacts() {
        return {
          facts: [{ factId: "" } as unknown as CandidateFact],
          independentMatters: { detected: false, note: null },
        };
      },
    };
    const app = await buildApp({
      config: testConfig(),
      fixtures,
      analysisEngine: new AnalysisEngine(brokenAnalysis),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(SAMPLE_TEXT);
    await app.close();
  });
});

describe("前置阶段已移除", () => {
  it("事实确认与追问的遗留接口不再存在", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, SAMPLE_TEXT);

    for (const url of [
      `/api/v1/analysis/sessions/${state.sessionId}/rounds`,
      `/api/v1/analysis/sessions/${state.sessionId}/questions`,
      `/api/v1/analysis/sessions/${state.sessionId}/facts/${state.facts[0].factId}/confirmation`,
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: contractHeaders,
        payload: {},
      });
      expect(response.statusCode, url).toBe(404);
    }
    await app.close();
  });

  it("快照确认后的事实修改接口失败关闭", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, SAMPLE_TEXT);

    const statusChange = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${state.facts[0].factId}/status`,
      headers: contractHeaders,
      payload: { status: "confirmed" },
    });
    expect(statusChange.statusCode).toBe(409);

    const addFact = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts`,
      headers: contractHeaders,
      payload: { statement: "补充事实" },
    });
    expect(addFact.statusCode).toBe(409);
    await app.close();
  });
});

describe("会话读取、清除与空闲失效", () => {
  it("读取当前状态并清除本次分析", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, SAMPLE_TEXT);

    const read = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().sessionId).toBe(state.sessionId);

    const cleared = await app.inject({
      method: "DELETE",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    expect(cleared.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    expect(after.statusCode).toBe(404);
    await app.close();
  });

  it("未知会话返回 404 且不泄露内容", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/analysis/sessions/does-not-exist",
      headers: contractHeaders,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).not.toContain("案情");
    await app.close();
  });

  it("空闲超过 30 分钟后服务端会话不可恢复", async () => {
    const fixtures = createFixtureControls();
    const engine = new AnalysisEngine(fixtures.analysis);
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const state = await engine.createSession({ caseText: SAMPLE_TEXT }, t0);

    expect(engine.getSession(state.sessionId, t0).sessionId).toBe(state.sessionId);

    const t1 = new Date(t0.getTime() + SESSION_IDLE_TTL_MS + 1);
    expect(() => engine.getSession(state.sessionId, t1)).toThrow(/会话不存在或已结束/);
    engine.resetForTests();
  });
});

describe("补充或修改事实与事实快照", () => {
  it("补充事实生成新快照与新报告，旧快照请求失败关闭", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);
    const oldSnapshot = first.state.snapshot as NonNullable<typeof first.state.snapshot>;
    const oldHash = oldSnapshot.snapshotHash;

    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);
    expect(begin.json().stage).toBe("modifying_facts");
    expect(begin.json().modification.baseSnapshotHash).toBe(oldHash);

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts`,
      headers: contractHeaders,
      payload: { statement: "嫌疑人在逃，暂未到案。" },
    });
    expect(added.statusCode).toBe(200);
    const addedFact = (added.json().facts as CandidateFact[]).find((fact) =>
      fact.factId.startsWith("fact-user-"),
    );
    expect(addedFact?.statement).toBe("嫌疑人在逃，暂未到案。");
    expect(addedFact?.status).toBe("confirmed");

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);
    const next = confirmed.json() as AnalysisSubmissionResponse;
    expect(next.state.stage).toBe("snapshot_confirmed");
    expect(next.state.snapshot?.snapshotVersion).toBe(2);
    expect(next.state.snapshot?.snapshotHash).not.toBe(oldHash);
    expect(next.report.snapshotHash).toBe(next.state.snapshot?.snapshotHash);

    // 旧快照请求必须失败关闭：迟到或错版本响应不得覆盖当前报告。
    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/report`,
      headers: contractHeaders,
      payload: {
        contractVersion: "1.0",
        requestId: "33333333-3333-4333-8333-333333333333",
        snapshotVersion: oldSnapshot.snapshotVersion,
        snapshotHash: oldHash,
      } satisfies GenerateReportRequest,
    });
    expect(stale.statusCode).toBe(409);
    await app.close();
  });

  it("替代旧版本：旧事实退出本次分析并记录替代关系", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });

    const target = first.state.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });
    expect(response.statusCode).toBe(200);
    const facts: CandidateFact[] = response.json().facts;
    const oldFact = facts.find((fact) => fact.factId === target.factId) as CandidateFact;
    const newFact = facts.find((fact) => fact.replacesFactId === target.factId) as CandidateFact;
    expect(oldFact.excluded).toBe(true);
    expect(oldFact.supersededByFactId).toBe(newFact.factId);
    expect(newFact.status).toBe("confirmed");
    await app.close();
  });

  it("两个版本都不能排除时记录为争议事实，不静默选择", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });

    const target = first.state.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "另一种说法。", resolution: "dispute" },
    });
    expect(response.statusCode).toBe(200);
    const facts: CandidateFact[] = response.json().facts;
    const oldFact = facts.find((fact) => fact.factId === target.factId) as CandidateFact;
    const newFact = facts.find((fact) => fact.replacesFactId === target.factId) as CandidateFact;
    expect(oldFact.status).toBe("disputed");
    expect(oldFact.excluded).toBe(false);
    expect(newFact.status).toBe("disputed");
    await app.close();
  });

  it("放弃修改恢复进入修改前的事实与快照", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);
    const originalHash = first.state.snapshot?.snapshotHash as string;
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    const target = first.state.facts.find((fact) => !fact.excluded) as CandidateFact;
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stage).toBe("snapshot_confirmed");
    expect(body.snapshot.snapshotHash).toBe(originalHash);
    expect(body.modification).toBeNull();
    const restored = body.facts.find((fact: CandidateFact) => fact.factId === target.factId) as CandidateFact;
    expect(restored.excluded).toBe(false);
    expect(body.facts.some((fact: CandidateFact) => fact.replacesFactId === target.factId)).toBe(false);
    await app.close();
  });

  it("未进入修改阶段时不能创建替代事实项", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);
    const target = first.state.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("分析能力停用时修改入口与替代事实接口失败关闭", async () => {
    const { app } = await makeApp({ analysisEnabled: false });
    const begin = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions/any-session/modifications",
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(503);

    const revision = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions/any-session/facts/any-fact/revision",
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });
    expect(revision.statusCode).toBe(503);
    await app.close();
  });
});

describe("报告生成边界", () => {
  it("同一有效快照可以重新生成报告，且绑定相同快照哈希", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, SAMPLE_TEXT);
    const snapshot = state.snapshot as NonNullable<typeof state.snapshot>;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/report`,
      headers: contractHeaders,
      payload: {
        contractVersion: "1.0",
        requestId: "22222222-2222-4222-8222-222222222222",
        snapshotVersion: snapshot.snapshotVersion,
        snapshotHash: snapshot.snapshotHash,
      } satisfies GenerateReportRequest,
    });
    expect(response.statusCode).toBe(200);
    const report = response.json() as AnalysisReport;
    expect(report.snapshotHash).toBe(snapshot.snapshotHash);
    await app.close();
  });
});
