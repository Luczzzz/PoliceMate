import { describe, expect, it } from "vitest";
import { FACT_STATUS_LABELS, type CandidateFact } from "@policymate/contracts";
import { extractCaseFactsFixture } from "../src/analysis/fixture-extract";
import {
  evaluateCaseFocusEligibility,
  resolveCaseFocus,
  selectEligibleCaseFocuses,
  unresolvedCaseFocusGaps,
} from "../src/content/case-focus";
import { createFixtureContent } from "../src/content/fixture-content";
import type { EligibilityContext } from "../src/content/model";
import {
  ASSAULT_FOCUS_ID,
  DRUG_FOCUS_ID,
  GAMBLING_FOCUS_ID,
  PROSTITUTION_FOCUS_ID,
  PUBLIC_ORDER_DRUG_CASE_FOCUSES,
  REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS,
} from "../src/content/public-order-drug-content";
import { validateRelease } from "../src/content/release";
import { createGovernedContentStore } from "../src/content/store";

/** 固定“当前时间”，使核验期限门控可重复。 */
const NOW = new Date("2026-10-01T00:00:00.000Z");

function contextOf(store: ReturnType<typeof createGovernedContentStore>): EligibilityContext {
  return store.eligibilityContext(NOW);
}

function confirmedFactsOf(caseText: string): CandidateFact[] {
  return extractCaseFactsFixture(caseText).facts.map((fact) => ({
    ...fact,
    status: "confirmed" as const,
    statusLabel: FACT_STATUS_LABELS.confirmed,
  }));
}

describe("治安秩序与毒品类重点案情内容包", () => {
  it("包含四组重点案情，覆盖治安秩序与毒品类的既定范围", () => {
    const ids = PUBLIC_ORDER_DRUG_CASE_FOCUSES.map((focus) => focus.caseFocusId);
    expect(ids).toEqual([...REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每组具有独立版本、现行法源、分流条件、相邻区别与决定性事实缺口", () => {
    const seed = createFixtureContent();
    const sources = new Map(seed.sources.map((source) => [source.sourceId, source]));
    for (const focus of PUBLIC_ORDER_DRUG_CASE_FOCUSES) {
      expect(focus.version).not.toBe("");
      expect(focus.contentStatus).toBe("trial");
      expect(focus.sourceIds.length).toBeGreaterThan(0);
      expect(focus.diversionRules.some((rule) => rule.diversion === "criminal")).toBe(true);
      expect(focus.diversionRules.some((rule) => rule.diversion === "administrative")).toBe(true);
      expect(focus.neighbors.length).toBeGreaterThan(0);
      expect(focus.gaps.length).toBeGreaterThan(0);
      for (const gap of focus.gaps) {
        expect(gap.affectsDiversions.length).toBeGreaterThan(0);
      }
      for (const sourceId of focus.sourceIds) {
        const source = sources.get(sourceId);
        expect(source, `${focus.caseFocusId} 依赖 ${sourceId}`).toBeDefined();
        expect(source?.status, `${focus.caseFocusId} 依赖 ${sourceId}`).toBe("current");
      }
      const gapIds = new Set<string>();
      for (const gap of focus.gaps) {
        expect(gapIds.has(gap.gapId), `${focus.caseFocusId} 缺口 ID 重复：${gap.gapId}`).toBe(false);
        gapIds.add(gap.gapId);
      }
      for (const rule of focus.diversionRules) {
        expect(rule.basis.length).toBeGreaterThan(0);
        for (const basis of rule.basis) {
          const source = sources.get(basis.sourceId);
          expect(source, `${focus.caseFocusId} 引用 ${basis.sourceId}`).toBeDefined();
          expect(
            source?.articles.some((article) => article.location === basis.article),
            `${focus.caseFocusId} 无法定位 ${basis.sourceId} ${basis.article}`,
          ).toBe(true);
        }
      }
    }
  });

  it("覆盖伤情、起因、共同参与、正当防卫、组织获利、场所资金、物品性质、数量、主观认识与证据固定", () => {
    const expectedElements = [
      "多人多行为",
      "伤情",
      "冲突起因",
      "共同参与",
      "正当防卫",
      "组织",
      "获利",
      "场所",
      "资金",
      "物品性质",
      "数量",
      "主观认识",
      "证据固定",
    ];
    const allElements = PUBLIC_ORDER_DRUG_CASE_FOCUSES.flatMap((focus) => focus.elements).join("\n");
    for (const element of expectedElements) {
      expect(allElements, `缺少要素：${element}`).toContain(element);
    }
    for (const focus of PUBLIC_ORDER_DRUG_CASE_FOCUSES) {
      expect(focus.summary).not.toBe("");
      expect(focus.highRiskBoundary.length).toBeGreaterThan(0);
    }
  });

  it("每组通过典型、相邻、决定性事实缺失、高风险边界与失效禁用场景", () => {
    const requiredKinds = [
      "typical",
      "adjacent_boundary",
      "decisive_gap",
      "high_risk_boundary",
      "source_invalidation",
    ] as const;
    for (const focus of PUBLIC_ORDER_DRUG_CASE_FOCUSES) {
      const kinds = new Set(focus.scenarios.map((scenario) => scenario.kind));
      for (const kind of requiredKinds) {
        expect(kinds.has(kind), `${focus.caseFocusId} 缺少 ${kind} 场景`).toBe(true);
      }
      expect(focus.testResults.map((result) => result.scenarioId).sort()).toEqual(
        focus.scenarios.map((scenario) => scenario.scenarioId).sort(),
      );
      expect(focus.testResults.every((result) => result.outcome === "pass")).toBe(true);
    }
  });

  it("场景案情为脱敏虚构文本，不含真实身份信息或联系方式", () => {
    const allText = PUBLIC_ORDER_DRUG_CASE_FOCUSES.flatMap((focus) =>
      focus.scenarios.map((scenario) => scenario.caseText),
    ).join("\n");
    expect(allText).not.toMatch(/\d{17}[\dXx]/);
    expect(allText).not.toMatch(/1[3-9]\d{9}/);
    expect(allText).not.toMatch(/身份证|手机号|住址|门牌/);
  });

  it("高风险边界只要求人工核验，并明确不自动作出处置决定", () => {
    const boundary = PUBLIC_ORDER_DRUG_CASE_FOCUSES.flatMap((focus) => focus.highRiskBoundary).join("\n");
    expect(boundary).toContain("人工核验");
    expect(boundary).toContain("不自动作出处置决定");
    expect(boundary).not.toMatch(/应当自动(采取|作出|决定)/);
  });
});

describe("治安秩序与毒品类重点案情当前状态门控", () => {
  it("装入统一批次后四组重点案情均可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    for (const focusId of REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS) {
      const focus = store.findCaseFocus(focusId);
      expect(focus, focusId).toBeDefined();
      expect(evaluateCaseFocusEligibility(focus!, contextOf(store)), focusId).toBeNull();
    }
  });

  it("单项紧急禁用只影响指定重点案情，重置后恢复", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const baseline = store.snapshot(NOW).eligibleCaseFocusCount;

    expect(store.setCaseFocusStatus(GAMBLING_FOCUS_ID, "withdrawn")).toBe(true);
    expect(store.setCaseFocusStatus("focus-does-not-exist", "withdrawn")).toBe(false);

    const snapshot = store.snapshot(NOW);
    expect(
      snapshot.caseFocuses.find((item) => item.caseFocusId === GAMBLING_FOCUS_ID)?.eligible,
    ).toBe(false);
    expect(
      snapshot.caseFocuses.find((item) => item.caseFocusId === DRUG_FOCUS_ID)?.eligible,
    ).toBe(true);

    store.reset();
    expect(store.snapshot(NOW).eligibleCaseFocusCount).toBe(baseline);
  });

  it("到期后四组重点案情全部退出生产", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setCaseFocusesExpired(true);
    expect(selectEligibleCaseFocuses(store.caseFocuses(), contextOf(store))).toEqual([]);
  });

  it("激活批次记录全部重点案情版本，并通过发布校验", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const release = store.activeRelease();
    for (const focusId of REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS) {
      const entry = release.caseFocuses.find((item) => item.caseFocusId === focusId);
      expect(entry, focusId).toBeDefined();
      expect(store.findCaseFocus(focusId)?.version).toBe(entry?.version);
    }
    expect(
      validateRelease(release, store.sources(), store.examples(), store.caseFocuses()),
    ).toEqual([]);
  });
});

describe("治安秩序与毒品类重点案情匹配与法源限定", () => {
  it("典型场景命中各自的重点案情并限定到该案情的法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const context = contextOf(store);
    for (const focus of PUBLIC_ORDER_DRUG_CASE_FOCUSES) {
      const scenario = focus.scenarios.find((item) => item.kind === "typical");
      expect(scenario, focus.caseFocusId).toBeDefined();
      const facts = confirmedFactsOf(scenario!.caseText);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, context);
      expect(resolution.primary?.caseFocusId, scenario!.caseText).toBe(focus.caseFocusId);
      expect(resolution.primaryEligible, focus.caseFocusId).toBe(true);
      expect(resolution.unresolvedGaps, focus.caseFocusId).toEqual([]);
      expect(resolution.legalSources.map((source) => source.sourceId), focus.caseFocusId).toEqual(
        focus.sourceIds,
      );
    }
  });

  it("相邻反例不命中任何重点案情", () => {
    const store = createGovernedContentStore(createFixtureContent());
    for (const focus of PUBLIC_ORDER_DRUG_CASE_FOCUSES) {
      const scenario = focus.scenarios.find((item) => item.kind === "adjacent_boundary");
      expect(scenario, focus.caseFocusId).toBeDefined();
      const facts = confirmedFactsOf(scenario!.caseText);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
      expect(resolution.matched, scenario!.caseText).toEqual([]);
    }
  });

  it("候选事实参与首份分析匹配，但缺失事实仍形成决定性缺口", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const scenario = PUBLIC_ORDER_DRUG_CASE_FOCUSES[0]!.scenarios.find(
      (item) => item.kind === "decisive_gap",
    )!;
    const unconfirmed = extractCaseFactsFixture(scenario.caseText).facts;
    const resolution = resolveCaseFocus(store.caseFocuses(), unconfirmed, contextOf(store));
    expect(resolution.primary?.caseFocusId).toBe(ASSAULT_FOCUS_ID);
    expect(resolution.unresolvedGaps.map((gap) => gap.gapId)).toEqual([
      "gap-injury",
      "gap-location",
    ]);
  });

  it("决定性事实缺口按事实类别判定，未确认即为未解决", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const focus = store.findCaseFocus(DRUG_FOCUS_ID);
    expect(focus).toBeDefined();
    const facts = confirmedFactsOf(
      "6月1日晚上，黄某在某某出租屋向吴某贩卖毒品。",
    );
    expect(unresolvedCaseFocusGaps(focus!, facts).map((gap) => gap.gapId)).toEqual([
      "gap-quantity",
      "gap-property",
    ]);
  });

  it("以打架、斗殴或互殴表述的案情仍命中打架斗殴和伤害类案情", () => {
    const store = createGovernedContentStore(createFixtureContent());
    for (const text of [
      "4月1日，张某与李某打架。",
      "4月1日，张某与李某互殴。",
      "4月1日，张某聚众斗殴。",
    ]) {
      const facts = confirmedFactsOf(text);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
      expect(resolution.primary?.caseFocusId, text).toBe(ASSAULT_FOCUS_ID);
    }
  });

  it("重点案情被禁用时命中仍成立但不再限定到其法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setCaseFocusStatus(ASSAULT_FOCUS_ID, "withdrawn");
    const scenario = PUBLIC_ORDER_DRUG_CASE_FOCUSES[0]!.scenarios.find(
      (item) => item.kind === "typical",
    )!;
    const facts = confirmedFactsOf(scenario.caseText);
    const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(resolution.primary?.caseFocusId).toBe(ASSAULT_FOCUS_ID);
    expect(resolution.primaryEligible).toBe(false);
    expect(resolution.legalSources).toEqual([]);
  });

  it("财产与经济类案情不会命中治安秩序与毒品类重点案情", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf(
      "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。",
    );
    const matched = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(matched.primary?.caseFocusId).toBe("focus-property-theft");
  });
});
