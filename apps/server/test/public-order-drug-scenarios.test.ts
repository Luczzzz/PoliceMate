import { describe, expect, it } from "vitest";
import { REPORT_MODULE_LABELS } from "@policymate/contracts";
import { CRITICAL_MODULE_IDS } from "../src/analysis/report";
import {
  ASSAULT_FOCUS_ID,
  DRUG_FOCUS_ID,
  GAMBLING_FOCUS_ID,
  PROSTITUTION_FOCUS_ID,
  PUBLIC_ORDER_DRUG_CASE_FOCUSES,
} from "../src/content/public-order-drug-content";
import type { FixtureControls } from "../src/providers/fixture";
import {
  createScenarioHelpers,
  makeHarness,
  runScenario,
} from "./helpers/case-focus-scenario-harness";

/**
 * 四组治安秩序与毒品类重点案情场景化验收。
 *
 * 复用共享装置驱动“自由案情 → 已确认事实 → 事实快照 → 六模块报告”，
 * 只使用确定性替身；断言外部可观察结果：命中的重点案情、报告总体状态、
 * 决定性缺口、高风险核验提示与法源链路。
 */

const { scenarioOf, expectedFocusSourceIds } = createScenarioHelpers(PUBLIC_ORDER_DRUG_CASE_FOCUSES);

const ALL_FOCUS_IDS = [
  ASSAULT_FOCUS_ID,
  GAMBLING_FOCUS_ID,
  PROSTITUTION_FOCUS_ID,
  DRUG_FOCUS_ID,
];

describe("治安秩序与毒品类重点案情：典型场景生成六模块报告", () => {
  it.each(ALL_FOCUS_IDS)("%s 生成完整且可追溯的六模块报告", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "typical");
    const { report, resolution } = await runScenario(makeHarness(), scenario.caseText);

    expect([...resolution.matchedCaseFocusIds].sort()).toEqual([...scenario.expectedCaseFocusIds].sort());
    expect(resolution.caseFocusId).toBe(caseFocusId);
    expect(resolution.caseFocusEligible).toBe(true);
    expect(resolution.unresolvedGapIds).toEqual([]);
    expect(report.status).toBe("complete");
    expect(report.caseFocusId).toBe(caseFocusId);
    expect(report.caseFocusVersion).not.toBeNull();
    expect(report.modules).toHaveLength(6);
    expect(report.modules.map((module) => module.id).sort()).toEqual(
      Object.keys(REPORT_MODULE_LABELS).sort(),
    );

    const focusSources = expectedFocusSourceIds(caseFocusId);
    for (const moduleId of CRITICAL_MODULE_IDS) {
      const module = report.modules.find((item) => item.id === moduleId);
      expect(module?.status, moduleId).toBe("present");
      expect(module?.traceLinks.length, moduleId).toBeGreaterThan(0);
      for (const trace of module?.traceLinks ?? []) {
        expect(trace.condition).not.toBe("");
        expect(trace.judgment).not.toBe("");
        expect(trace.factIds.length).toBeGreaterThan(0);
        expect(trace.basisKind).toBe("formal_basis");
        expect(focusSources).toContain(trace.basis?.sourceId);
        expect(trace.basis?.status).toBe("current");
      }
    }
  });

  it.each(ALL_FOCUS_IDS)("%s 只使用本重点案情的受治理法源", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "typical");
    const { resolution } = await runScenario(makeHarness(), scenario.caseText);
    expect(resolution.legalSources.map((source) => source.sourceId)).toEqual(
      expectedFocusSourceIds(caseFocusId),
    );
    for (const source of resolution.legalSources) {
      expect(source.status).toBe("current");
    }
  });
});

describe("治安秩序与毒品类重点案情：相邻与不应命中反例", () => {
  it.each(ALL_FOCUS_IDS)("%s 的相邻反例不命中任何重点案情", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "adjacent_boundary");
    const { report, resolution } = await runScenario(makeHarness(), scenario.caseText);

    expect([...resolution.matchedCaseFocusIds].sort()).toEqual([...scenario.expectedCaseFocusIds].sort());
    expect(resolution.caseFocusId).toBeNull();
    expect(report.caseFocusId).toBeNull();
    expect(report.status).toBe("complete");
    // 未命中重点案情时只使用通用法源，不引用任何重点案情的法源。
    const traceSourceIds = report.modules
      .flatMap((module) => module.traceLinks)
      .map((trace) => trace.basis?.sourceId);
    for (const sourceId of expectedFocusSourceIds(caseFocusId)) {
      expect(traceSourceIds).not.toContain(sourceId);
    }
  });

  it("赌博、卖淫嫖娼与毒品反例不互相命中", async () => {
    const pairs: Array<[string, string]> = [
      [GAMBLING_FOCUS_ID, PROSTITUTION_FOCUS_ID],
      [GAMBLING_FOCUS_ID, DRUG_FOCUS_ID],
      [PROSTITUTION_FOCUS_ID, DRUG_FOCUS_ID],
    ];
    for (const [adjacentId, otherId] of pairs) {
      const scenario = scenarioOf(adjacentId, "adjacent_boundary");
      const { resolution } = await runScenario(makeHarness(), scenario.caseText);
      expect(resolution.matchedCaseFocusIds).not.toContain(otherId);
    }
  });

  it("殴打相邻反例不命中打架斗殴和伤害类案情", async () => {
    const scenario = scenarioOf(ASSAULT_FOCUS_ID, "adjacent_boundary");
    const { resolution } = await runScenario(makeHarness(), scenario.caseText);
    expect(resolution.matchedCaseFocusIds).not.toContain(ASSAULT_FOCUS_ID);
  });

  it("同一连续案情同时命中赌博与毒品时保留多种可能", async () => {
    const focus = PUBLIC_ORDER_DRUG_CASE_FOCUSES.find((item) => item.caseFocusId === DRUG_FOCUS_ID);
    const scenario = focus?.scenarios.find(
      (item) => item.scenarioId === "drug-gambling-multi-behavior",
    );
    if (scenario === undefined) throw new Error("缺少 drug-gambling-multi-behavior 场景");

    const { report, resolution } = await runScenario(makeHarness(), scenario.caseText);
    expect([...resolution.matchedCaseFocusIds].sort()).toEqual([...scenario.expectedCaseFocusIds].sort());
    expect(resolution.caseFocusId).toBe(GAMBLING_FOCUS_ID);
    expect(resolution.unresolvedAlternativeIds).toContain(DRUG_FOCUS_ID);
    expect(resolution.unresolvedAlternatives).toContain("毒品类违法犯罪");
    expect(report.status).toBe("conflicting");
    expect(report.headline).toContain("多种可能");
    for (const moduleId of CRITICAL_MODULE_IDS) {
      expect(report.modules.find((item) => item.id === moduleId)?.status).toBe("conflicting");
    }
  });
});

describe("治安秩序与毒品类重点案情：决定性事实缺失保守降级", () => {
  it.each(ALL_FOCUS_IDS)("%s 缺失决定性事实时降级为条件不足", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "decisive_gap");
    const { report, resolution } = await runScenario(makeHarness(), scenario.caseText);

    expect(resolution.caseFocusId).toBe(caseFocusId);
    expect([...resolution.unresolvedGapIds].sort()).toEqual(
      [...scenario.expectedUnresolvedGapIds].sort(),
    );
    expect(report.status).toBe("insufficient_facts");
    expect(report.headline).toContain("决定性事实");
    for (const moduleId of CRITICAL_MODULE_IDS) {
      const module = report.modules.find((item) => item.id === moduleId);
      expect(module?.status, moduleId).toBe("insufficient_facts");
      expect(module?.traceLinks).toEqual([]);
    }
    expect(report.factLimitations.length).toBeGreaterThanOrEqual(
      scenario.expectedUnresolvedGapIds.length,
    );
  });
});

describe("治安秩序与毒品类重点案情：高风险边界保留人工核验", () => {
  it.each(ALL_FOCUS_IDS)("%s 的高风险边界产生可解释核验提示，不自动作出处置", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "high_risk_boundary");
    const { report, resolution, urgentPrompts } = await runScenario(makeHarness(), scenario.caseText);

    expect(resolution.caseFocusId).toBe(caseFocusId);
    expect(report.status).toBe(scenario.expectedReportStatus);
    expect(urgentPrompts.length).toBeGreaterThan(0);
    for (const prompt of urgentPrompts) {
      expect(prompt.triggeringFactIds.length).toBeGreaterThan(0);
      expect(prompt.humanChecks.length).toBeGreaterThan(0);
      expect(prompt.boundaryStatement).toContain("不构成自动处置决定");
    }
  });
});

describe("治安秩序与毒品类重点案情：法源失效与紧急禁用立即停止支撑主结论", () => {
  const invalidations: Array<[string, Parameters<FixtureControls["updateState"]>[0]]> = [
    ["重点案情已撤回", { caseFocusStatusAll: "withdrawn" }],
    ["重点案情已到期", { caseFocusesExpired: true }],
    ["依赖法源已到期", { legalSourcesExpired: true }],
    ["依赖法源已废止", { legalSourceStatusAll: "repealed" }],
    ["依赖法源效力不明", { legalSourceStatusAll: "uncertain" }],
  ];

  it.each(ALL_FOCUS_IDS)("%s 在法源失效或禁用后只展示依据不可用", async (caseFocusId) => {
    const scenario = scenarioOf(caseFocusId, "source_invalidation");
    for (const [label, patch] of invalidations) {
      const harness = makeHarness();
      harness.fixtures.updateState(patch);
      const { report, resolution } = await runScenario(harness, scenario.caseText);

      expect(resolution.matchedCaseFocusIds, label).toContain(caseFocusId);
      expect(resolution.caseFocusEligible, label).toBe(false);
      expect(resolution.legalSources, label).toEqual([]);
      expect(report.status, label).toBe("basis_unavailable");
      expect(report.statusLabel, label).toContain("依据不可用");
      for (const moduleId of CRITICAL_MODULE_IDS) {
        const module = report.modules.find((item) => item.id === moduleId);
        expect(module?.status, `${label}:${moduleId}`).toBe("basis_unavailable");
        expect(module?.traceLinks, `${label}:${moduleId}`).toEqual([]);
      }
      // 受影响内容立即停止支撑主结论：任何模块都不得保留法源链路。
      expect(report.modules.every((module) => module.traceLinks.length === 0), label).toBe(true);
    }
  });
});
