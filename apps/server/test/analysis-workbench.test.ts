import { describe, expect, it } from "vitest";
import type {
  AnalysisIntakeResponse,
  AnalysisReport,
  AnalysisSubmissionResponse,
  CandidateFact,
  CreateAnalysisRequest,
  GenerateReportRequest,
} from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { AnalysisEngine } from "../src/analysis/engine";
import { createFixtureControls } from "../src/providers/fixture";

import { anonymousTokens } from "../src/security";

const contractHeaders = {
  "x-pm-contract-version": "1.0",
  "x-pm-anonymous-token": anonymousTokens.issue().token,
};
const SAMPLE_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

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

interface Submission {
  sessionId: string;
  snapshotVersion: number;
  snapshotHash: string;
  facts: CandidateFact[];
  report: AnalysisReport;
}

/** 提交案情：一次请求即取得事实快照与报告。 */
async function submitCase(app: App, caseText = SAMPLE_TEXT): Promise<Submission> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers: contractHeaders,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as AnalysisIntakeResponse;
  const first = body.analyses[0];
  if (first === undefined) throw new Error("提交案情未返回分析。");
  const snapshot = first.state.snapshot;
  if (snapshot === null) throw new Error("缺少事实快照。");
  return {
    sessionId: first.state.sessionId,
    snapshotVersion: snapshot.snapshotVersion,
    snapshotHash: snapshot.snapshotHash,
    facts: first.state.facts,
    report: first.report,
  };
}

async function regenerateReport(app: App, session: Submission): Promise<AnalysisReport> {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${session.sessionId}/report`,
    headers: contractHeaders,
    payload: {
      contractVersion: "1.0",
      requestId,
      snapshotVersion: session.snapshotVersion,
      snapshotHash: session.snapshotHash,
    } satisfies GenerateReportRequest,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as AnalysisReport;
}

describe("六模块报告：临时工作台结构化内容", () => {
  it("证据清单与询问要点返回结构化项目，其他模块不携带工作台项目", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    const report = await regenerateReport(app, session);

    const evidence = report.modules.find((module) => module.id === "evidence_checklist");
    const interview = report.modules.find((module) => module.id === "interview_points");
    expect(evidence?.evidenceItems.length).toBeGreaterThan(0);
    expect(interview?.interviewItems.length).toBeGreaterThan(0);
    for (const item of evidence?.evidenceItems ?? []) {
      expect(item.itemId).not.toBe("");
      expect(item.priorityLabel).not.toBe("");
      expect(item.holdingStatusLabel).not.toBe("");
    }
    for (const item of interview?.interviewItems ?? []) {
      expect(item.role).not.toBe("");
      expect(item.roleLabel).not.toBe("");
    }
    const other = report.modules.filter(
      (module) => module.id !== "evidence_checklist" && module.id !== "interview_points",
    );
    for (const module of other) {
      expect(module.evidenceItems).toHaveLength(0);
      expect(module.interviewItems).toHaveLength(0);
    }
    await app.close();
  });

  it("报告文书任务只携带结构化办案条件与非结论性说明", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    const report = await regenerateReport(app, session);

    expect(report.documentTasks.length).toBeGreaterThan(0);
    for (const task of report.documentTasks) {
      expect(task.procedureCategoryLabel).toMatch(/程序/);
      expect(task.stageLabel).not.toBe("");
      expect(task.boundaryStatement).toContain("不代表必须制作");
      expect(task.boundaryStatement).toContain("自行判断");
    }
    await app.close();
  });

  it("不一致或有结论性表达的工作台结构被拒绝（失败关闭）", async () => {
    const fixtures = createFixtureControls();
    const base = fixtures.analysis;
    const broken = {
      extractCaseFacts: base.extractCaseFacts.bind(base),
      async generateReport(request: Parameters<NonNullable<typeof base.generateReport>>[0]) {
        const result = await (base.generateReport as NonNullable<typeof base.generateReport>)(request);
        const [first, ...rest] = result.modules;
        return {
          ...result,
          modules: [
            {
              ...first,
              id: "evidence_checklist" as const,
              label: "核心证据核查清单",
              status: "present" as const,
              evidenceItems: [
                {
                  itemId: "ev-bad",
                  text: "示例证据",
                  purpose: null,
                  sourceHint: null,
                  preservationRisk: null,
                  priority: "urgent" as never,
                  priorityLabel: "高优先级",
                  holdingStatus: "held" as const,
                  holdingStatusLabel: "已掌握",
                },
              ],
              interviewItems: [],
            },
            ...rest,
          ],
        };
      },
    };
    const app = await buildApp({
      config: testConfig(),
      fixtures,
      analysisEngine: new AnalysisEngine(broken),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("service_unavailable");
    await app.close();
  });
});

describe("补充或修改事实", () => {
  it("从报告进入修改：旧快照保持不变，旧报告仍可查看", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    await regenerateReport(app, session);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stage).toBe("modifying_facts");
    expect(body.modification.baseSnapshotVersion).toBe(session.snapshotVersion);
    expect(body.modification.baseSnapshotHash).toBe(session.snapshotHash);
    expect(body.snapshot.snapshotHash).toBe(session.snapshotHash);
    await app.close();
  });

  it("替代旧版本：旧事实退出本次分析并记录替代关系", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });

    const target = session.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/facts/${target.factId}/revision`,
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
    const session = await submitCase(app);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });

    const target = session.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/facts/${target.factId}/revision`,
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
    expect(newFact.excluded).toBe(false);
    await app.close();
  });

  it("放弃修改恢复进入修改前的事实与快照", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    const target = session.facts.find((fact) => !fact.excluded) as CandidateFact;
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.stage).toBe("snapshot_confirmed");
    expect(body.snapshot.snapshotHash).toBe(session.snapshotHash);
    expect(body.modification).toBeNull();
    const restored = body.facts.find((fact: CandidateFact) => fact.factId === target.factId) as CandidateFact;
    expect(restored.excluded).toBe(false);
    expect(body.facts.some((fact: CandidateFact) => fact.replacesFactId === target.factId)).toBe(false);
    await app.close();
  });

  it("确认新快照后旧报告失效并生成绑定新快照的报告", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    const target = session.facts.find((fact) => !fact.excluded) as CandidateFact;
    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/facts/${target.factId}/revision`,
      headers: contractHeaders,
      payload: { statement: "修正后的表述。", resolution: "replace" },
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);
    const body = confirm.json() as AnalysisSubmissionResponse;
    expect(body.state.modification).toBeNull();
    expect(body.state.snapshot?.snapshotVersion).toBe(session.snapshotVersion + 1);
    expect(body.state.snapshot?.snapshotHash).not.toBe(session.snapshotHash);
    // 新报告绑定新快照，而不是旧快照。
    expect(body.report.snapshotHash).toBe(body.state.snapshot?.snapshotHash);
    expect(body.report.snapshotVersion).toBe(body.state.snapshot?.snapshotVersion);

    // 旧快照/旧报告的生成请求被拒绝：迟到或错版本响应不得覆盖当前状态。
    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/report`,
      headers: contractHeaders,
      payload: {
        contractVersion: "1.0",
        requestId: "33333333-3333-4333-8333-333333333333",
        snapshotVersion: session.snapshotVersion,
        snapshotHash: session.snapshotHash,
      },
    });
    expect(stale.statusCode).toBe(409);
    await app.close();
  });

  it("未进入修改阶段时不能创建替代事实项", async () => {
    const { app } = await makeApp();
    const session = await submitCase(app);
    const target = session.facts.find((fact) => !fact.excluded) as CandidateFact;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${session.sessionId}/facts/${target.factId}/revision`,
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

describe("POST /api/v1/document-examples/task-candidates", () => {
  const base = {
    contractVersion: "1.0",
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    applicableRoles: ["办案民警"],
    caseTags: ["接报受理"],
  };

  it("只使用程序类别、办理阶段、适用对象和案情标签筛选，并返回差异与选择前需核验条件", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/document-examples/task-candidates",
      headers: contractHeaders,
      payload: base,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.selectionBoundary).toContain("不代表必须制作");
    expect(body.candidates.length).toBeGreaterThan(1);
    for (const candidate of body.candidates) {
      expect(candidate.difference).not.toBe("");
      expect(Array.isArray(candidate.preflightChecks)).toBe(true);
      expect(candidate.procedureCategoryLabel).toBe("行政程序");
      expect(candidate.stageLabel).toBe("接报与受理");
    }

    const single = await app.inject({
      method: "POST",
      url: "/api/v1/document-examples/task-candidates",
      headers: contractHeaders,
      payload: { ...base, stageId: "investigation_evidence", caseTags: ["调查取证"] },
    });
    expect(single.json().candidates).toHaveLength(2);
    for (const candidate of single.json().candidates) {
      expect(candidate.procedureCategoryLabel).toBe("行政程序");
      expect(candidate.stageLabel).toBe("调查取证");
    }
    await app.close();
  });

  it("拒绝无效筛选参数", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/document-examples/task-candidates",
      headers: contractHeaders,
      payload: { ...base, procedureCategory: "unknown" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("文书入口停用时失败关闭", async () => {
    const { app } = await makeApp({ documentsEnabled: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/document-examples/task-candidates",
      headers: contractHeaders,
      payload: base,
    });
    expect(response.statusCode).toBe(410);
    await app.close();
  });
});
