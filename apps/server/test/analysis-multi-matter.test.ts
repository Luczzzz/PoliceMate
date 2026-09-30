import { describe, expect, it } from "vitest";
import type {
  AnalysisIntakeResponse,
  AnalysisSessionState,
  CreateAnalysisRequest,
} from "@policymate/contracts";
import { REPORT_CONFLICT_BOUNDARY } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";

import { anonymousTokens } from "../src/security";

/**
 * 独立事项自动拆分与争议事实并列（ADR-0008 第 5 点）。
 *
 * 全部通过后端 HTTP API 驱动，只断言返回结构与文案语义，不断言内部函数：
 * - 含两起互不相关事项的输入返回多份分析，各自有独立会话标识与独立快照；
 * - 连续案情不被误拆；
 * - 同一事实存在不同说法时并列展示各版本，并按各版本给出分支，不静默择一。
 */

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

async function submit(app: App, caseText: string): Promise<AnalysisIntakeResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers: contractHeaders,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AnalysisIntakeResponse;
}

/** 含两起互不相关事项：不同人员、不同地点、不同时间。 */
const INDEPENDENT_TEXT =
  "3月2日，张某在城南市场殴打李某。另外，3月8日王某报案称电动车在火车站门口被盗。";

/** 连续案情：两起事件共享人员，不得误拆。 */
const CONTINUOUS_TEXT = "3月2日，张某在城南市场殴打李某。当天张某又辱骂李某。";

/** 同一事实存在不同说法：一方称轻伤、一方称轻微伤。 */
const CONFLICT_TEXT =
  "3月2日晚上，张某在城南市场门口殴打李某。李某称自己被打成轻伤，张某称李某只是轻微伤，双方说法不一。";

describe("独立事项自动拆分", () => {
  it("含两起互不相关事项的输入返回多份分析，各自有独立会话标识与独立快照", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, INDEPENDENT_TEXT);

    expect(intake.contractVersion).toBe("1.0");
    expect(intake.analyses).toHaveLength(2);

    const [first, second] = intake.analyses;
    // 每份分析有独立的会话标识与独立的事实快照。
    expect(first.state.sessionId).not.toBe(second.state.sessionId);
    expect(first.state.snapshot.snapshotHash).not.toBe(second.state.snapshot.snapshotHash);
    expect(first.state.snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/);

    // 每份分析的报告绑定自己会话的快照，不跨会话串报告。
    for (const analysis of intake.analyses) {
      expect(analysis.report.sessionId).toBe(analysis.state.sessionId);
      expect(analysis.report.snapshotHash).toBe(analysis.state.snapshot.snapshotHash);
      expect(analysis.report.snapshotVersion).toBe(analysis.state.snapshot.snapshotVersion);
      expect(analysis.state.facts.length).toBeGreaterThan(0);
    }

    // 拆分序号与名称用于前端切换；每份分析只覆盖其中一个连续案情。
    expect(first.state.analysisIndex).toBe(1);
    expect(second.state.analysisIndex).toBe(2);
    expect(first.state.analysisCount).toBe(2);
    expect(second.state.analysisCount).toBe(2);
    expect(first.state.analysisLabel).not.toBe(second.state.analysisLabel);
    expect(first.state.independentMatters.detected).toBe(true);
    expect(first.state.independentMatters.note).toContain("拆分");

    // 人物别名按各份分析独立编号：两份分析都从“人员甲”开始，不跨事项串联。
    const firstParticipants = first.state.facts.filter((fact) => fact.category === "participant");
    const secondParticipants = second.state.facts.filter((fact) => fact.category === "participant");
    expect(firstParticipants.map((fact) => fact.originalWording)).toEqual(["张某", "李某"]);
    expect(secondParticipants.map((fact) => fact.originalWording)).toEqual(["王某"]);
    // 事实只在所属分析内出现，不重复出现于另一份分析。
    const firstIds = new Set(first.state.facts.map((fact) => fact.factId));
    for (const fact of second.state.facts) {
      expect(firstIds.has(fact.factId)).toBe(false);
    }

    // 每份分析可独立读取，且互不影响。
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${second.state.sessionId}`,
      headers: contractHeaders,
    });
    expect(read.statusCode).toBe(200);
    const readState = read.json() as AnalysisSessionState;
    expect(readState.analysisIndex).toBe(2);
    expect(readState.snapshot.snapshotHash).toBe(second.state.snapshot.snapshotHash);
    await app.close();
  });

  it("连续案情不被误拆，只形成一份分析", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, CONTINUOUS_TEXT);

    expect(intake.analyses).toHaveLength(1);
    expect(intake.analyses[0].state.analysisCount).toBe(1);
    expect(intake.analyses[0].state.analysisIndex).toBe(1);
    expect(intake.analyses[0].state.independentMatters.detected).toBe(false);
    expect(intake.analyses[0].state.independentMatters.note).toBeNull();
    // 同一人员、同一地点的两起行为保留在同一份连续案情中。
    const behaviors = intake.analyses[0].state.facts.filter((fact) => fact.category === "behavior");
    expect(behaviors.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it("单一连续案情的响应结构与多份分析一致（analyses 长度为 1）", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, "3月2日，张某盗窃李某电动车。");

    expect(intake.analyses).toHaveLength(1);
    expect(intake.analyses[0].state.analysisLabel).toBe("事项一");
    await app.close();
  });
});

describe("争议事实并列展示", () => {
  it("存在冲突说法时并列展示全部版本，不出现被系统择一的单一版本", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, CONFLICT_TEXT);
    expect(intake.analyses).toHaveLength(1);
    const { state, report } = intake.analyses[0];

    // 两个互相冲突的结果事实都保留在快照中，都被标为争议。
    const resultFacts = state.facts.filter((fact) => fact.category === "result");
    expect(resultFacts).toHaveLength(2);
    for (const fact of resultFacts) {
      expect(fact.status).toBe("disputed");
      expect(fact.disputeGroupId).not.toBeNull();
    }
    expect(new Set(resultFacts.map((fact) => fact.value?.raw))).toEqual(
      new Set(["轻伤", "轻微伤"]),
    );

    // 报告并列展示同一冲突的全部版本，并带固定边界说明。
    expect(report.status).toBe("conflicting");
    expect(report.conflicts).toHaveLength(1);
    const conflict = report.conflicts[0];
    expect(conflict.factCategory).toBe("result");
    expect(conflict.description).not.toBe("");
    expect(conflict.boundaryStatement).toBe(REPORT_CONFLICT_BOUNDARY);
    expect(conflict.versions).toHaveLength(2);
    expect(conflict.versions.map((version) => version.statement).join("\n")).toContain("轻伤");
    expect(conflict.versions.map((version) => version.statement).join("\n")).toContain("轻微伤");
    for (const version of conflict.versions) {
      expect(version.status).toBe("disputed");
      expect(version.confirmation).toBe("system_extracted_unconfirmed");
      expect(version.originalWording).not.toBe("");
      // 各版本分别给出分支，且两个版本走不同分流方向。
      expect(version.branch).not.toBeNull();
      expect(version.branch?.condition).not.toBe("");
      expect(version.branch?.proceduralPath.length).toBeGreaterThan(0);
      expect(version.branch?.diversionLabel).not.toBe("");
    }
    const diversions = conflict.versions.map((version) => version.branch?.diversion);
    expect(new Set(diversions).size).toBe(2);
    await app.close();
  });

  it("冲突事实的分支来自未解决的决定性缺口，且不阻止报告生成", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, CONFLICT_TEXT);
    const { report } = intake.analyses[0];

    // 冲突对应的缺口仍以“若…则…”分支呈现。
    const injuryGap = report.gapBranches.find((gap) => gap.gapId === "gap-injury");
    expect(injuryGap).toBeDefined();
    expect(injuryGap?.branches.length).toBeGreaterThan(0);

    // 每个争议版本的 branchId 必须来自该缺口的分支，不能凭空构造。
    const branchIds = new Set(injuryGap?.branches.map((branch) => branch.branchId));
    for (const version of report.conflicts[0].versions) {
      expect(version.branch).not.toBeNull();
      expect(branchIds.has(version.branch?.branchId ?? "")).toBe(true);
    }
    await app.close();
  });

  it("无冲突说法的正常案情不产生争议事实条目", async () => {
    const { app } = await makeApp();
    const intake = await submit(app, "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。");
    expect(intake.analyses[0].report.conflicts).toEqual([]);
    await app.close();
  });
});
