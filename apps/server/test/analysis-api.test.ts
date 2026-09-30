import { describe, expect, it } from "vitest";
import type {
  AnalysisIntakeResponse,
  AnalysisReport,
  AnalysisSubmissionResponse,
  CandidateFact,
  CreateAnalysisRequest,
  GenerateReportRequest,
  UrgentRiskCategory,
} from "@policymate/contracts";
import { reportHasUnconfirmedBasis, URGENT_RISK_LABELS } from "@policymate/contracts";
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
  const body = response.json() as AnalysisIntakeResponse;
  const first = body.analyses[0];
  if (first === undefined) throw new Error("提交案情未返回分析。");
  return { contractVersion: body.contractVersion, state: first.state, report: first.report };
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
          matters: [
            {
              matterId: "matter-1",
              label: "事项一",
              facts: [{ factId: "" } as unknown as CandidateFact],
            },
          ],
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
    const [state] = await engine.createSessions({ caseText: SAMPLE_TEXT }, t0);

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

describe("报告依据标注确认状态", () => {
  it("每条依据都带确认状态字段；初次报告的全部依据均标为未经确认", async () => {
    const { app } = await makeApp();
    const { report } = await submitCase(app, SAMPLE_TEXT);

    const traces = report.modules.flatMap((module) => module.traceLinks);
    const references = traces.flatMap((trace) => trace.factReferences);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.factId).not.toBe("");
      expect(reference.category).not.toBe("");
      expect(reference.categoryLabel).not.toBe("");
      expect(reference.statement).not.toBe("");
      expect(reference.originalWording).not.toBe("");
      expect(reference.confirmation).toBe("system_extracted_unconfirmed");
      expect(reference.confirmationLabel).toBe("系统提取，未经确认");
    }
    // 依据明细与事实 ID 一一对应。
    for (const trace of traces) {
      expect(trace.factReferences.map((reference) => reference.factId)).toEqual(trace.factIds);
    }
    expect(reportHasUnconfirmedBasis(report)).toBe(true);
    await app.close();
  });

  it("初步定性意见的依据同样带标签，且不出现官方定性或处罚表述", async () => {
    const { app } = await makeApp();
    const { report } = await submitCase(app, SAMPLE_TEXT);

    const qualification = report.modules.find(
      (module) => module.id === "preliminary_qualification",
    );
    const references = qualification?.traceLinks.flatMap((trace) => trace.factReferences) ?? [];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.confirmationLabel).toMatch(/民警已确认|系统提取，未经确认/);
    }
    const text = [
      report.headline,
      qualification?.summary ?? "",
      ...(qualification?.items ?? []),
      ...(qualification?.traceLinks.flatMap((trace) => [trace.condition, trace.judgment]) ?? []),
    ].join("\n");
    expect(text).not.toMatch(/已构成|应当(?:处以|给予|作出)?处罚|追究(?:刑事|行政)责任|定罪/);
    await app.close();
  });

  it("民警在后续补充中确认过的事实在新报告里标为已确认", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, SAMPLE_TEXT);

    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);

    for (const fact of first.state.facts.filter((item) => !item.excluded)) {
      const changed = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${fact.factId}/status`,
        headers: contractHeaders,
        payload: { status: "confirmed" },
      });
      expect(changed.statusCode).toBe(200);
    }

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);
    const next = confirmed.json() as AnalysisSubmissionResponse;
    expect(next.state.snapshot?.snapshotVersion).toBe(2);

    const references = next.report.modules
      .flatMap((module) => module.traceLinks)
      .flatMap((trace) => trace.factReferences);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.status).toBe("confirmed");
      expect(reference.confirmation).toBe("officer_confirmed");
      expect(reference.confirmationLabel).toBe("民警已确认");
    }
    expect(reportHasUnconfirmedBasis(next.report)).toBe(false);
    await app.close();
  });
});

/**
 * 风险标记直接触发置顶紧急核验提示（ADR-0008 第 4 点）。
 *
 * 人身安全、医疗救助、未成年人保护、家庭暴力、证据灭失五类风险由系统提取出的
 * 风险标记直接触发提示，无需民警确认；措辞保持“请核验”，不下定性或处罚结论。
 * 每类风险使用确定性固定样例，保证可复现。
 */
const RISK_SAMPLES: ReadonlyArray<[UrgentRiskCategory, string]> = [
  ["personal_safety", "3月2日晚上，张某在城南市场门口持刀威胁李某。"],
  ["medical", "3月2日晚上，张某在城南市场门口殴打李某，李某已送医急救。"],
  ["minor_protection", "3月2日晚上，张某在城南市场门口殴打一名未成年学生。"],
  ["domestic_violence", "3月2日晚上，张某在家中家暴其妻子李某。"],
  ["evidence_loss", "3月2日晚上，张某在城南市场门口威胁删除监控记录。"],
];

const RISK_FREE_TEXT = "3月2日晚上，张某在城南市场门口盗窃李某手机一部。";

/** 提示文案不得出现定性、处罚或“已查明”类表述。 */
const CONCLUSION_PATTERN = /已查明|已构成|定罪|应当(?:处以|给予)?处罚|追究(?:刑事|行政)责任/;

describe("风险标记直接触发置顶紧急提示", () => {
  it.each(RISK_SAMPLES)("%s 的风险标记直接触发置顶紧急提示，无需民警确认", async (category, caseText) => {
    const { app } = await makeApp();
    const { state, report } = await submitCase(app, caseText);

    // 事实在首份分析里全部未经民警确认，提示仍然必须出现。
    expect(state.facts.length).toBeGreaterThan(0);
    expect(state.facts.every((fact) => fact.status === "candidate")).toBe(true);

    const prompt = state.urgentPrompts.find((item) => item.category === category);
    expect(prompt, `缺少 ${category} 风险提示`).toBeDefined();
    expect(prompt?.categoryLabel).toBe(URGENT_RISK_LABELS[category]);
    expect(prompt?.promptId).not.toBe("");
    expect(prompt?.triggeringFactIds.length).toBeGreaterThan(0);
    expect(prompt?.triggeringStatements).toEqual(
      state.facts
        .filter((fact) => prompt?.triggeringFactIds.includes(fact.factId))
        .map((fact) => fact.originalWording),
    );
    for (const statement of prompt?.triggeringStatements ?? []) {
      expect(statement).not.toBe("");
    }
    expect(prompt?.humanChecks.length).toBeGreaterThan(0);
    for (const check of prompt?.humanChecks ?? []) {
      expect(check).toContain("请核验");
    }
    expect(prompt?.boundaryStatement).toContain("请核验");
    expect(prompt?.boundaryStatement).toContain("不构成自动处置决定");

    const text = [
      prompt?.categoryLabel ?? "",
      ...(prompt?.humanChecks ?? []),
      ...(prompt?.triggeringStatements ?? []),
      prompt?.boundaryStatement ?? "",
    ].join("\n");
    expect(text).not.toMatch(CONCLUSION_PATTERN);

    // 提示与报告绑定同一会话与事实快照。
    expect(report.sessionId).toBe(state.sessionId);
    expect(report.snapshotHash).toBe(state.snapshot?.snapshotHash);
    await app.close();
  });

  it("无风险标记的案情不出现紧急提示", async () => {
    const { app } = await makeApp();
    const { state } = await submitCase(app, RISK_FREE_TEXT);

    expect(state.facts.some((fact) => fact.riskCategory !== null)).toBe(false);
    expect(state.urgentPrompts).toEqual([]);
    await app.close();
  });

  it("民警明确否认的风险事实不再触发提示", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, RISK_SAMPLES[0][1]);
    expect(first.state.urgentPrompts.map((prompt) => prompt.category)).toContain("personal_safety");

    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);
    for (const fact of first.state.facts.filter((item) => item.riskCategory !== null)) {
      const denied = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts/${fact.factId}/status`,
        headers: contractHeaders,
        payload: { status: "denied" },
      });
      expect(denied.statusCode).toBe(200);
    }

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);
    const next = confirmed.json() as AnalysisSubmissionResponse;
    expect(next.state.snapshot?.snapshotVersion).toBe(2);
    expect(next.state.urgentPrompts).toEqual([]);
    await app.close();
  });
});

/**
 * 决定性事实缺口以“若…则…”分支呈现（ADR-0008 第 3 点）。
 *
 * 缺口未解决不阻断报告生成；报告列出各分支的程序路径与补充建议。
 * 民警可以回答“未知”或“待核实”，报告保持分支呈现；补齐对应缺口并
 * 确认新快照后，缺口解决，旧快照报告立即失效。
 */
const GAP_TEXT = "4月1日晚上，张某殴打李某。";

describe("决定性事实缺口以分支呈现", () => {
  it("存在缺口时报告列出各缺口的条件分支与程序路径，不阻断报告生成", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, GAP_TEXT);

    // 首份报告直接呈现缺口；不要求先确认候选事实或回答追问。
    expect(first.report.status).toBe("insufficient_facts");
    expect(first.report.statusLabel).toContain("条件不足");

    const gaps = first.report.gapBranches;
    expect(gaps.map((gap) => gap.gapId).sort()).toEqual(["gap-injury", "gap-location"]);
    for (const gap of gaps) {
      expect(gap.description).not.toBe("");
      expect(gap.factCategoryLabel).not.toBe("");
      expect(gap.supplementSuggestion).toContain("缩小结论范围");
      expect(gap.officerAnswer).toBeNull();
      expect(gap.officerAnswerLabel).toBeNull();
      expect(gap.branches.length).toBeGreaterThan(0);
      for (const branch of gap.branches) {
        expect(branch.condition).not.toBe("");
        expect(branch.diversionLabel).not.toBe("");
        expect(branch.proceduralPath.length).toBeGreaterThan(0);
        // 分支依据必须来自当前有效法源，可追溯到具体条款。
        expect(branch.basis).not.toBeNull();
        expect(branch.basis?.status).toBe("current");
        expect(branch.basis?.article).not.toBe("");
        expect(branch.basis?.minimalText).not.toBe("");
      }
    }

    // 缺口不得产生单一主结论；受治理殴打伤害内容仍可保留条件性依据与受理调查建议。
    const qualification = first.report.modules.find((item) => item.id === "preliminary_qualification");
    expect(qualification?.status).toBe("insufficient_facts");
    expect(qualification?.traceLinks.length).toBeGreaterThan(0);
    expect(first.report.modules.find((item) => item.id === "filing_conditions")?.status).toBe("present");
    expect(first.report.modules.find((item) => item.id === "legal_basis_trace")?.status).toBe("present");
    await app.close();
  });

  it("对缺口回答“未知”或“待核实”后报告保持分支呈现且不改变事实快照", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, GAP_TEXT);
    const snapshotHash = first.state.snapshot?.snapshotHash;

    const unknown = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/gaps/gap-injury/answer`,
      headers: contractHeaders,
      payload: { answer: "unknown" },
    });
    expect(unknown.statusCode).toBe(200);
    const unknownBody = unknown.json() as AnalysisSubmissionResponse;
    expect(unknownBody.report.snapshotHash).toBe(snapshotHash);
    const injury = unknownBody.report.gapBranches.find((gap) => gap.gapId === "gap-injury");
    expect(injury?.officerAnswer).toBe("unknown");
    expect(injury?.officerAnswerLabel).toBe("未知");
    expect(injury?.branches.length).toBeGreaterThan(0);

    const pending = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/gaps/gap-location/answer`,
      headers: contractHeaders,
      payload: { answer: "pending_verification" },
    });
    expect(pending.statusCode).toBe(200);
    const pendingBody = pending.json() as AnalysisSubmissionResponse;
    const location = pendingBody.report.gapBranches.find((gap) => gap.gapId === "gap-location");
    expect(location?.officerAnswer).toBe("pending_verification");
    expect(location?.officerAnswerLabel).toBe("待核实");
    expect(pendingBody.report.gapBranches.length).toBe(2);

    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/gaps/gap-injury/answer`,
      headers: contractHeaders,
      payload: { answer: "confirmed" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.message).toContain("未知");
    await app.close();
  });

  it("存在未确认修改时不能对当前报告的缺口作答", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, GAP_TEXT);

    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/gaps/gap-injury/answer`,
      headers: contractHeaders,
      payload: { answer: "unknown" },
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("只有明确回答缺口的补充事实才能解决缺口，新快照清除旧回答并使旧报告失效", async () => {
    const { app } = await makeApp();
    const first = await submitCase(app, GAP_TEXT);
    expect(first.report.gapBranches.some((gap) => gap.gapId === "gap-injury")).toBe(true);

    // 先记录旧报告回答；形成新快照后不能把它迁移到新报告。
    const answered = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/gaps/gap-location/answer`,
      headers: contractHeaders,
      payload: { answer: "pending_verification" },
    });
    expect(answered.statusCode).toBe(200);

    const begin = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(begin.statusCode).toBe(200);

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts`,
      headers: contractHeaders,
      // 同类别但未明确回答具体缺口，不得静默关闭该缺口。
      payload: { statement: "另有一项一般后果材料待整理。", category: "result" },
    });
    expect(added.statusCode).toBe(200);

    const unboundConfirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(unboundConfirmed.statusCode).toBe(200);
    const unbound = unboundConfirmed.json() as AnalysisSubmissionResponse;
    expect(unbound.report.gapBranches.some((gap) => gap.gapId === "gap-injury")).toBe(true);
    expect(
      unbound.report.gapBranches.find((gap) => gap.gapId === "gap-location")?.officerAnswer,
    ).toBeNull();

    const oldSnapshot = unbound.state.snapshot as NonNullable<typeof unbound.state.snapshot>;
    const beginBound = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/modifications`,
      headers: contractHeaders,
      payload: {},
    });
    expect(beginBound.statusCode).toBe(200);
    const addedBound = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/facts`,
      headers: contractHeaders,
      payload: {
        statement: "经鉴定，李某损伤程度为轻伤二级。",
        category: "result",
        resolvesGapId: "gap-injury",
      },
    });
    expect(addedBound.statusCode).toBe(200);

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);
    const newer = confirmed.json() as AnalysisSubmissionResponse;
    expect(newer.state.snapshot?.snapshotHash).not.toBe(oldSnapshot.snapshotHash);
    expect(newer.report.snapshotHash).toBe(newer.state.snapshot?.snapshotHash);
    expect(newer.report.gapBranches.some((gap) => gap.gapId === "gap-injury")).toBe(false);
    expect(newer.report.gapBranches.length).toBeGreaterThan(0);

    // 旧快照对应的报告不再可作为当前结论展示：旧版本请求失败关闭。
    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${first.state.sessionId}/report`,
      headers: contractHeaders,
      payload: {
        contractVersion: "1.0",
        requestId: "44444444-4444-4444-8444-444444444444",
        snapshotVersion: oldSnapshot.snapshotVersion,
        snapshotHash: oldSnapshot.snapshotHash,
      } satisfies GenerateReportRequest,
    });
    expect(stale.statusCode).toBe(409);
    await app.close();
  });
});
