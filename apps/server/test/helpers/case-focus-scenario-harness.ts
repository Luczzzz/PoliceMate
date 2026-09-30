import {
  type AnalysisReport,
  type CandidateFact,
  type FactCategory,
  type GenerateReportRequest,
  type UrgentRiskPrompt,
} from "@policymate/contracts";
import { AnalysisEngine } from "../../src/analysis/engine";
import type {
  CaseFocusRecord,
  CaseFocusScenarioKind,
  CaseFocusScenarioRecord,
} from "../../src/content/model";
import { createFixtureControls, type FixtureControls } from "../../src/providers/fixture";
import type { CaseFocusResolution } from "../../src/providers/types";

/**
 * 重点案情场景化验收的共享测试装置。
 *
 * 通过统一的分析引擎驱动“自由案情 → 已确认事实 → 事实快照 → 六模块报告”，
 * 只使用确定性替身，不连接真实 Dify 或真实模型；各内容包的场景测试复用同一
 * 装置，只提供自己的重点案情内容与断言。
 */

/** 固定“当前时间”，使受治理内容的核验期限门控可重复。 */
const SCENARIO_NOW = new Date("2026-10-01T00:00:00.000Z");
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export interface Harness {
  fixtures: FixtureControls;
  engine: AnalysisEngine;
}

export function makeHarness(): Harness {
  const fixtures = createFixtureControls();
  const base = fixtures.analysis;
  const generateReport = base.generateReport;
  if (generateReport === undefined) throw new Error("替身边界缺少报告生成能力。");
  const engine = new AnalysisEngine(
    {
      extractCaseFacts: base.extractCaseFacts.bind(base),
      generateReport: generateReport.bind(base),
    },
    { analysisTimeoutMs: 5000, reportTimeoutMs: 5000 },
  );
  return { fixtures, engine };
}

export interface ScenarioOutcome {
  report: AnalysisReport;
  resolution: CaseFocusResolution;
  facts: CandidateFact[];
  urgentPrompts: UrgentRiskPrompt[];
}

export interface ScenarioOptions {
  /** 需要标记为“存在争议”的事实类别；其余事实一律确认。 */
  disputedCategories?: FactCategory[];
}

export async function runScenario(
  harness: Harness,
  caseText: string,
  options: ScenarioOptions = {},
): Promise<ScenarioOutcome> {
  const { fixtures, engine } = harness;
  const created = await engine.createSession({ caseText }, SCENARIO_NOW);

  // 场景需要已确认事实参与内容匹配：从报告进入补充或修改事实，逐项标记后
  // 确认新快照，等价于民警在报告后主动核对事实。
  await engine.beginModification(created.sessionId, SCENARIO_NOW);
  const mutable = engine.getSession(created.sessionId, SCENARIO_NOW);
  const disputed = new Set(options.disputedCategories ?? []);
  for (const fact of mutable.facts) {
    engine.setFactStatus(
      created.sessionId,
      fact.factId,
      disputed.has(fact.category) ? "disputed" : "confirmed",
      SCENARIO_NOW,
    );
  }

  const confirmed = engine.confirmSnapshot(created.sessionId, SCENARIO_NOW);
  const snapshot = confirmed.snapshot;
  if (snapshot === null) throw new Error("事实快照确认失败。");

  const listLegalSources = fixtures.content.listLegalSources;
  const resolveCaseFocus = fixtures.content.resolveCaseFocus;
  if (listLegalSources === undefined || resolveCaseFocus === undefined) {
    throw new Error("替身内容边界缺少重点案情解析能力。");
  }

  const report = await engine.generateReport(
    created.sessionId,
    {
      contractVersion: "1.0",
      requestId: REQUEST_ID,
      snapshotVersion: snapshot.snapshotVersion,
      snapshotHash: snapshot.snapshotHash,
    } satisfies GenerateReportRequest,
    await listLegalSources(),
    SCENARIO_NOW,
    "release-trial-0001",
    (facts, now) => resolveCaseFocus(facts, now),
  );

  const resolution = await resolveCaseFocus(
    confirmed.facts.map((fact) => ({ ...fact })),
    SCENARIO_NOW,
  );

  return { report, resolution, facts: confirmed.facts, urgentPrompts: confirmed.urgentPrompts };
}

export interface ScenarioHelpers {
  scenarioOf(caseFocusId: string, kind: CaseFocusScenarioKind): CaseFocusScenarioRecord;
  expectedFocusSourceIds(caseFocusId: string): string[];
}

/** 把场景查询绑定到一个内容包的重点案情集合。 */
export function createScenarioHelpers(focuses: readonly CaseFocusRecord[]): ScenarioHelpers {
  const focusOf = (caseFocusId: string): CaseFocusRecord => {
    const focus = focuses.find((item) => item.caseFocusId === caseFocusId);
    if (focus === undefined) throw new Error(`缺少重点案情 ${caseFocusId}`);
    return focus;
  };

  return {
    scenarioOf(caseFocusId, kind) {
      const scenario = focusOf(caseFocusId).scenarios.find((item) => item.kind === kind);
      if (scenario === undefined) throw new Error(`${caseFocusId} 缺少 ${kind} 场景`);
      return scenario;
    },
    expectedFocusSourceIds(caseFocusId) {
      return focusOf(caseFocusId).sourceIds;
    },
  };
}
