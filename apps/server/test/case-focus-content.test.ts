import { describe, expect, it } from "vitest";
import { FACT_STATUS_LABELS, type CandidateFact } from "@policymate/contracts";
import {
  adjacentMatchedFocuses,
  effectiveCaseFocusReviewDueAt,
  evaluateCaseFocusEligibility,
  matchedCaseFocuses,
  resolveCaseFocus,
  selectEligibleCaseFocuses,
  unresolvedCaseFocusGaps,
} from "../src/content/case-focus";
import { createFixtureContent } from "../src/content/fixture-content";
import type { CaseFocusRecord, EligibilityContext } from "../src/content/model";
import {
  DESTRUCTION_FOCUS_ID,
  GENERAL_FRAUD_FOCUS_ID,
  PROPERTY_ECONOMIC_CASE_FOCUSES,
  REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS,
  TELECOM_FRAUD_FOCUS_ID,
  THEFT_FOCUS_ID,
} from "../src/content/property-economic-content";
import { validateRelease } from "../src/content/release";
import { createGovernedContentStore } from "../src/content/store";
import { extractCaseFactsFixture } from "../src/analysis/fixture-extract";

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

function focusOf(store: ReturnType<typeof createGovernedContentStore>, caseFocusId: string): CaseFocusRecord {
  const focus = store.findCaseFocus(caseFocusId);
  if (focus === undefined) throw new Error(`缺少重点案情 ${caseFocusId}`);
  return focus;
}

describe("财产与经济类重点案情内容包", () => {
  it("包含四组重点案情，覆盖财产与经济类的既定范围", () => {
    const ids = PROPERTY_ECONOMIC_CASE_FOCUSES.map((focus) => focus.caseFocusId);
    expect(ids).toEqual([...REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每组具有独立版本、现行法源、分流条件、相邻区别与决定性事实缺口", () => {
    for (const focus of PROPERTY_ECONOMIC_CASE_FOCUSES) {
      expect(focus.version).not.toBe("");
      expect(focus.contentStatus).toBe("trial");
      expect(focus.sourceIds.length).toBeGreaterThan(0);
      expect(focus.diversionRules.some((rule) => rule.diversion === "criminal")).toBe(true);
      expect(focus.neighbors.length).toBeGreaterThan(0);
      expect(focus.gaps.length).toBeGreaterThan(0);
      for (const gap of focus.gaps) {
        expect(gap.affectsDiversions.length).toBeGreaterThan(0);
      }
      for (const rule of focus.diversionRules) {
        expect(rule.basis.length).toBeGreaterThan(0);
      }
    }
  });

  it("覆盖财产关系、占有状态、欺骗或隐瞒、主观状态、履约、资金流转、帮助行为、损失与分流", () => {
    const expectedElements = [
      "财产关系",
      "占有状态",
      "欺骗或隐瞒",
      "主观状态",
      "履约过程",
      "资金流转",
      "帮助行为",
      "损失",
    ];
    const allElements = PROPERTY_ECONOMIC_CASE_FOCUSES.flatMap((focus) => focus.elements).join("\n");
    for (const element of expectedElements) {
      expect(allElements, `缺少要素：${element}`).toContain(element);
    }
    for (const focus of PROPERTY_ECONOMIC_CASE_FOCUSES) {
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
    for (const focus of PROPERTY_ECONOMIC_CASE_FOCUSES) {
      const kinds = new Set(focus.scenarios.map((scenario) => scenario.kind));
      for (const kind of requiredKinds) {
        expect(kinds.has(kind), `${focus.caseFocusId} 缺少 ${kind} 场景`).toBe(true);
      }
      expect(focus.testResults.length).toBeGreaterThan(0);
      expect(focus.testResults.every((result) => result.outcome === "pass")).toBe(true);
    }
  });

  it("场景案情为脱敏虚构文本，不含真实身份信息或联系方式", () => {
    const allText = PROPERTY_ECONOMIC_CASE_FOCUSES.flatMap((focus) =>
      focus.scenarios.map((scenario) => scenario.caseText),
    ).join("\n");
    expect(allText).not.toMatch(/\d{17}[\dXx]/);
    expect(allText).not.toMatch(/1[3-9]\d{9}/);
    expect(allText).not.toMatch(/身份证|手机号|住址|门牌/);
  });

  it("高风险边界只要求人工核验，并明确不自动作出处置决定", () => {
    const boundary = PROPERTY_ECONOMIC_CASE_FOCUSES.flatMap((focus) => focus.highRiskBoundary).join("\n");
    expect(boundary).toContain("人工核验");
    expect(boundary).toContain("不自动作出处置决定");
    expect(boundary).not.toMatch(/应当自动(采取|作出|决定)/);
  });

  it("测试结果逐场景绑定，与场景 ID 一一对应", () => {
    const seed = createFixtureContent();
    for (const focus of seed.caseFocuses) {
      expect(focus.testResults.map((result) => result.scenarioId).sort()).toEqual(
        focus.scenarios.map((scenario) => scenario.scenarioId).sort(),
      );
      expect(focus.testResults.every((result) => result.outcome === "pass")).toBe(true);
    }
  });

  it("分流条件与决定性缺口引用的法源条款均可在对应法源中定位", () => {
    const seed = createFixtureContent();
    const byId = new Map(seed.sources.map((source) => [source.sourceId, source]));
    for (const focus of seed.caseFocuses) {
      for (const sourceId of focus.sourceIds) {
        const source = byId.get(sourceId);
        expect(source, `${focus.caseFocusId} 依赖 ${sourceId}`).toBeDefined();
        expect(source?.status, `${focus.caseFocusId} 依赖 ${sourceId}`).toBe("current");
      }
      const gapIds = new Set<string>();
      for (const gap of focus.gaps) {
        expect(gapIds.has(gap.gapId), `${focus.caseFocusId} 缺口 ID 重复：${gap.gapId}`).toBe(false);
        gapIds.add(gap.gapId);
      }
      for (const rule of focus.diversionRules) {
        for (const basis of rule.basis) {
          const source = byId.get(basis.sourceId);
          expect(source, `${focus.caseFocusId} 引用 ${basis.sourceId}`).toBeDefined();
          expect(
            source?.articles.some((article) => article.location === basis.article),
            `${focus.caseFocusId} 无法定位 ${basis.sourceId} ${basis.article}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("重点案情当前状态门控", () => {
  it("trial 内容、current 法源、在激活批次内且未到期时可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const focus = focusOf(store, THEFT_FOCUS_ID);
    expect(evaluateCaseFocusEligibility(focus, contextOf(store))).toBeNull();
  });

  it.each(["draft", "pending_verification", "withdrawn"] as const)(
    "内容状态为 %s 时退出生产",
    (status) => {
      const store = createGovernedContentStore(createFixtureContent());
      store.setAllCaseFocusStatus(status);
      const focus = focusOf(store, THEFT_FOCUS_ID);
      expect(evaluateCaseFocusEligibility(focus, contextOf(store))).toBe("content_status");
    },
  );

  it.each(["future", "superseded", "repealed", "uncertain"] as const)(
    "依赖法源状态为 %s 时退出生产",
    (status) => {
      const store = createGovernedContentStore(createFixtureContent());
      store.setAllLegalSourceStatus(status);
      const focus = focusOf(store, THEFT_FOCUS_ID);
      expect(evaluateCaseFocusEligibility(focus, contextOf(store))).toBe("source_status");
    },
  );

  it("不在激活批次白名单内时退出生产", () => {
    const seed = createFixtureContent();
    seed.release.caseFocuses = [];
    const store = createGovernedContentStore(seed);
    const focus = focusOf(store, THEFT_FOCUS_ID);
    expect(evaluateCaseFocusEligibility(focus, contextOf(store))).toBe("not_in_release");
  });

  it("依赖法源比内容更早到期时，重点案情随法源到期", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const focus = focusOf(store, THEFT_FOCUS_ID);
    const sources = new Map(store.sources());
    const anySource = sources.get(focus.sourceIds[0] as string);
    expect(anySource).toBeDefined();
    sources.set(focus.sourceIds[0] as string, {
      ...(anySource as NonNullable<typeof anySource>),
      nextReviewDueAt: "2026-09-30T00:00:00.000Z",
    });
    expect(effectiveCaseFocusReviewDueAt(focus, sources)).toBe("2026-09-30T00:00:00.000Z");
    const context: EligibilityContext = { release: store.activeRelease(), sources, now: NOW };
    expect(evaluateCaseFocusEligibility(focus, context)).toBe("expired");
  });

  it("到期后退出生产，恢复后重新可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    expect(selectEligibleCaseFocuses(store.caseFocuses(), contextOf(store))).toHaveLength(4);

    store.setCaseFocusesExpired(true);
    expect(store.snapshot(NOW).eligibleCaseFocusCount).toBe(0);

    store.setCaseFocusesExpired(false);
    expect(store.snapshot(NOW).eligibleCaseFocusCount).toBe(4);
  });

  it("单项紧急禁用只影响指定重点案情，重置后恢复", () => {
    const store = createGovernedContentStore(createFixtureContent());
    expect(store.setCaseFocusStatus(THEFT_FOCUS_ID, "withdrawn")).toBe(true);
    expect(store.setCaseFocusStatus("focus-does-not-exist", "withdrawn")).toBe(false);

    const snapshot = store.snapshot(NOW);
    const theft = snapshot.caseFocuses.find((item) => item.caseFocusId === THEFT_FOCUS_ID);
    const destruction = snapshot.caseFocuses.find((item) => item.caseFocusId === DESTRUCTION_FOCUS_ID);
    expect(theft?.eligible).toBe(false);
    expect(destruction?.eligible).toBe(true);

    store.reset();
    expect(store.snapshot(NOW).eligibleCaseFocusCount).toBe(4);
  });
});

describe("重点案情匹配与法源限定", () => {
  it("典型场景命中各自的重点案情并限定到该案情的法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const context = contextOf(store);
    const cases: Array<[string, string]> = [
      [TELECOM_FRAUD_FOCUS_ID, "3月2日，张某冒充网络客服，通过电话联系李某，用手机操作骗取李某转账5万元。"],
      [THEFT_FOCUS_ID, "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。"],
      [GENERAL_FRAUD_FOCUS_ID, "3月5日，王某以借款为名骗取赵某现金2万元。"],
      [DESTRUCTION_FOCUS_ID, "4月1日，赵某因纠纷砸坏孙某电动车，损失2000元。"],
    ];

    for (const [focusId, caseText] of cases) {
      const facts = confirmedFactsOf(caseText);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, context);
      expect(resolution.primary?.caseFocusId, caseText).toBe(focusId);
      expect(resolution.primaryEligible).toBe(true);
      expect(resolution.unresolvedGaps).toEqual([]);
      expect(resolution.legalSources.map((source) => source.sourceId)).toEqual(
        focusOf(store, focusId).sourceIds,
      );
      for (const source of resolution.legalSources) {
        expect(source.status).toBe("current");
      }
    }
  });

  it("一般诈骗不命中需要电信网络线索的电信网络诈骗", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf("3月5日，王某以借款为名骗取赵某现金2万元，双方此前相识。");
    const matched = matchedCaseFocuses(store.caseFocuses(), facts).map((focus) => focus.caseFocusId);
    expect(matched).toEqual([GENERAL_FRAUD_FOCUS_ID]);
    expect(matched).not.toContain(TELECOM_FRAUD_FOCUS_ID);
  });

  it("未确认或已排除的事实不参与匹配", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = extractCaseFactsFixture("3月2日，张某盗窃李某电动车。").facts;
    expect(matchedCaseFocuses(store.caseFocuses(), facts)).toEqual([]);

    const confirmedButExcluded = facts.map((fact) => ({
      ...fact,
      status: "confirmed" as const,
      excluded: true,
    }));
    expect(matchedCaseFocuses(store.caseFocuses(), confirmedButExcluded)).toEqual([]);
  });

  it("盗窃与故意损毁同时命中时，保留不能排除的相邻方向", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf(
      "3月2日，张某先后两次盗窃李某停放的电动车未果。随后张某砸坏该电动车，损失3000元。",
    );
    const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(resolution.matched.map((focus) => focus.caseFocusId)).toEqual([
      THEFT_FOCUS_ID,
      DESTRUCTION_FOCUS_ID,
    ]);
    expect(resolution.primary?.caseFocusId).toBe(THEFT_FOCUS_ID);
    expect(resolution.adjacent.map((focus) => focus.caseFocusId)).toEqual([DESTRUCTION_FOCUS_ID]);
    expect(resolution.unresolvedGaps).toEqual([]);
  });

  it("决定性事实缺口按事实类别判定，未确认即为未解决", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const focus = focusOf(store, THEFT_FOCUS_ID);
    const facts = confirmedFactsOf("3月2日，张某盗窃李某停放在楼下的电动车。");
    expect(unresolvedCaseFocusGaps(focus, facts).map((gap) => gap.gapId)).toEqual([
      "gap-amount",
      "gap-count",
    ]);
  });

  it("重点案情被禁用时命中仍成立但不再限定到其法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setAllCaseFocusStatus("withdrawn");
    const facts = confirmedFactsOf(
      "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。",
    );
    const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(resolution.primary?.caseFocusId).toBe(THEFT_FOCUS_ID);
    expect(resolution.primaryEligible).toBe(false);
    expect(resolution.legalSources).toEqual([]);
  });

  it("相邻关系只保留相邻重点案情，不把无关重点案情当作备选", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const theft = focusOf(store, THEFT_FOCUS_ID);
    const destruction = focusOf(store, DESTRUCTION_FOCUS_ID);
    const telecom = focusOf(store, TELECOM_FRAUD_FOCUS_ID);
    expect(adjacentMatchedFocuses(theft, [theft, destruction, telecom])).toEqual([destruction]);
  });
});

describe("重点案情批次与发布门槛", () => {
  it("激活批次记录全部重点案情版本，并通过发布校验", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const release = store.activeRelease();
    expect(release.caseFocuses).toHaveLength(4);
    for (const entry of release.caseFocuses) {
      expect(store.findCaseFocus(entry.caseFocusId)?.version).toBe(entry.version);
    }
    expect(
      validateRelease(release, store.sources(), store.examples(), store.caseFocuses()),
    ).toEqual([]);
  });

  it("重点案情不是 trial 或依赖法源非现行有效时批次校验失败", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const release = store.activeRelease();

    const draftFocuses = store.caseFocuses().map((focus) =>
      focus.caseFocusId === THEFT_FOCUS_ID ? { ...focus, contentStatus: "draft" as const } : focus,
    );
    expect(
      validateRelease(release, store.sources(), store.examples(), draftFocuses).join("\n"),
    ).toContain("不是 trial 状态");

    const unknownSourceId = "src-not-in-release";
    const brokenFocuses = store.caseFocuses().map((focus) =>
      focus.caseFocusId === THEFT_FOCUS_ID
        ? { ...focus, sourceIds: [...focus.sourceIds, unknownSourceId] }
        : focus,
    );
    expect(
      validateRelease(release, store.sources(), store.examples(), brokenFocuses).join("\n"),
    ).toContain(unknownSourceId);
  });
});
