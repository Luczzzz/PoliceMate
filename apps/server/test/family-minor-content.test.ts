import { describe, expect, it } from "vitest";
import { FACT_STATUS_LABELS, type CandidateFact } from "@policymate/contracts";
import { extractCaseFactsFixture } from "../src/analysis/fixture-extract";
import { proposeDecisiveQuestionsFixture } from "../src/analysis/fixture-questions";
import { buildUrgentPrompts } from "../src/analysis/engine";
import {
  evaluateCaseFocusEligibility,
  matchedCaseFocuses,
  resolveCaseFocus,
  selectEligibleCaseFocuses,
  unresolvedCaseFocusGaps,
} from "../src/content/case-focus";
import { createFixtureContent } from "../src/content/fixture-content";
import {
  DOMESTIC_VIOLENCE_FOCUS_ID,
  FAMILY_MINOR_CASE_FOCUSES,
  MINOR_HARM_FOCUS_ID,
  REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS,
} from "../src/content/family-minor-content";
import type { EligibilityContext } from "../src/content/model";
import { THEFT_FOCUS_ID } from "../src/content/property-economic-content";
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

const DOMESTIC_TYPICAL = "4月1日晚上，王某在某某小区家中多次殴打其妻子李某，致李某轻微伤。";
const MINOR_TYPICAL = "5月2日，李某在某某小区家中多次殴打其13岁的未成年女儿，致其轻微伤。";

describe("家庭与未成年人高风险重点案情内容包", () => {
  it("包含两组重点案情，覆盖既定范围", () => {
    const ids = FAMILY_MINOR_CASE_FOCUSES.map((focus) => focus.caseFocusId);
    expect(ids).toEqual([...REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每组具有独立版本、现行法源、分流条件、相邻区别与决定性事实缺口", () => {
    const seed = createFixtureContent();
    const sources = new Map(seed.sources.map((source) => [source.sourceId, source]));
    for (const focus of FAMILY_MINOR_CASE_FOCUSES) {
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

  it("覆盖家庭成员与共同生活关系、年龄、持续升级、保护条件、监护人资格与证据固定", () => {
    const domestic = FAMILY_MINOR_CASE_FOCUSES.find(
      (focus) => focus.caseFocusId === DOMESTIC_VIOLENCE_FOCUS_ID,
    );
    const domesticElements = (domestic?.elements ?? []).join("\n");
    expect(domesticElements).toContain("家庭成员以外共同生活的人");
    expect(domesticElements).toContain("年龄");
    expect(domesticElements).toContain("持续升级");
    expect(domesticElements).toContain("证据固定");

    const minor = FAMILY_MINOR_CASE_FOCUSES.find((focus) => focus.caseFocusId === MINOR_HARM_FOCUS_ID);
    const minorElements = (minor?.elements ?? []).join("\n");
    expect(minorElements).toContain("不满十四周岁");
    expect(minorElements).toContain("强制报告");
    expect(minorElements).toContain("临时监护");
    expect(minorElements).toContain("撤销监护人资格");
    expect(minorElements).toContain("证据固定");
  });

  it("不错误合并法定代理人、合适成年人、女性工作人员与同步录音录像规则", () => {
    const minor = FAMILY_MINOR_CASE_FOCUSES.find((focus) => focus.caseFocusId === MINOR_HARM_FOCUS_ID);
    const elements = minor?.elements.join("\n") ?? "";
    // 四项规则必须分别出现，且同一要素中说明“分别适用，不得相互替代或者合并”。
    expect(elements).toContain("法定代理人");
    expect(elements).toContain("合适成年人");
    expect(elements).toContain("女性工作人员");
    expect(elements).toContain("同步录音录像");
    expect(elements).toContain("分别适用");
    expect(elements).toContain("不得相互替代或者合并");
  });

  it("每组通过典型、相邻、决定性事实缺失、高风险边界与失效禁用场景", () => {
    const requiredKinds = [
      "typical",
      "adjacent_boundary",
      "decisive_gap",
      "high_risk_boundary",
      "source_invalidation",
    ] as const;
    for (const focus of FAMILY_MINOR_CASE_FOCUSES) {
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
    const allText = FAMILY_MINOR_CASE_FOCUSES.flatMap((focus) =>
      focus.scenarios.map((scenario) => scenario.caseText),
    ).join("\n");
    expect(allText).not.toMatch(/\d{17}[\dXx]/);
    expect(allText).not.toMatch(/1[3-9]\d{9}/);
    expect(allText).not.toMatch(/身份证|手机号|住址|门牌/);
  });

  it("高风险边界只要求人工核验，并明确不自动作出处置决定", () => {
    const boundary = FAMILY_MINOR_CASE_FOCUSES.flatMap((focus) => focus.highRiskBoundary).join("\n");
    expect(boundary).toContain("人工核验");
    expect(boundary).toContain("不自动作出处置决定");
    expect(boundary).toContain("系统不得自动决定");
    expect(boundary).not.toMatch(/应当自动(采取|作出|决定)/);
  });
});

describe("家庭与未成年人高风险重点案情当前状态门控", () => {
  it("装入统一批次后两组重点案情均可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    for (const focusId of REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS) {
      const focus = store.findCaseFocus(focusId);
      expect(focus, focusId).toBeDefined();
      expect(evaluateCaseFocusEligibility(focus!, contextOf(store)), focusId).toBeNull();
    }
  });

  it("单项紧急禁用只影响指定重点案情，重置后恢复", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const baseline = store.snapshot(NOW).eligibleCaseFocusCount;

    expect(store.setCaseFocusStatus(MINOR_HARM_FOCUS_ID, "withdrawn")).toBe(true);
    expect(store.setCaseFocusStatus("focus-does-not-exist", "withdrawn")).toBe(false);

    const snapshot = store.snapshot(NOW);
    expect(
      snapshot.caseFocuses.find((item) => item.caseFocusId === MINOR_HARM_FOCUS_ID)?.eligible,
    ).toBe(false);
    expect(
      snapshot.caseFocuses.find((item) => item.caseFocusId === DOMESTIC_VIOLENCE_FOCUS_ID)?.eligible,
    ).toBe(true);

    store.reset();
    expect(store.snapshot(NOW).eligibleCaseFocusCount).toBe(baseline);
  });

  it("到期后两组重点案情全部退出生产", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setCaseFocusesExpired(true);
    expect(selectEligibleCaseFocuses(store.caseFocuses(), contextOf(store))).toEqual([]);
  });

  it("激活批次记录全部重点案情版本，并通过发布校验", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const release = store.activeRelease();
    for (const focusId of REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS) {
      const entry = release.caseFocuses.find((item) => item.caseFocusId === focusId);
      expect(entry, focusId).toBeDefined();
      expect(store.findCaseFocus(focusId)?.version).toBe(entry?.version);
    }
    expect(
      validateRelease(release, store.sources(), store.examples(), store.caseFocuses()),
    ).toEqual([]);
  });
});

describe("家庭与未成年人高风险重点案情匹配与法源限定", () => {
  it("典型场景命中各自的重点案情并限定到该案情的法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const context = contextOf(store);
    for (const focus of FAMILY_MINOR_CASE_FOCUSES) {
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
    for (const focus of FAMILY_MINOR_CASE_FOCUSES) {
      const scenario = focus.scenarios.find((item) => item.kind === "adjacent_boundary");
      expect(scenario, focus.caseFocusId).toBeDefined();
      const facts = confirmedFactsOf(scenario!.caseText);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
      expect(resolution.matched, scenario!.caseText).toEqual([]);
    }
  });

  it("未确认、已排除或已替代的事实不参与匹配", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const candidates = extractCaseFactsFixture(DOMESTIC_TYPICAL).facts;
    expect(matchedCaseFocuses(store.caseFocuses(), candidates)).toEqual([]);

    const confirmedButExcluded = candidates.map((fact) => ({
      ...fact,
      status: "confirmed" as const,
      excluded: true,
    }));
    expect(matchedCaseFocuses(store.caseFocuses(), confirmedButExcluded)).toEqual([]);
  });

  it("家庭暴力的相邻重点案情不会因家庭关系自动升级为侵害未成年人", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf(DOMESTIC_TYPICAL);
    const matched = matchedCaseFocuses(store.caseFocuses(), facts).map((focus) => focus.caseFocusId);
    expect(matched).toEqual([DOMESTIC_VIOLENCE_FOCUS_ID]);
    expect(matched).not.toContain(MINOR_HARM_FOCUS_ID);
  });

  it("涉及未成年人的家庭侵害优先命中侵害未成年人重点案情", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf(MINOR_TYPICAL);
    const matched = matchedCaseFocuses(store.caseFocuses(), facts).map((focus) => focus.caseFocusId);
    expect(matched).toEqual([MINOR_HARM_FOCUS_ID]);
    expect(matched).not.toContain(DOMESTIC_VIOLENCE_FOCUS_ID);
  });

  it("决定性事实缺口按事实类别判定，未确认即为未解决", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const domestic = store.findCaseFocus(DOMESTIC_VIOLENCE_FOCUS_ID);
    const minor = store.findCaseFocus(MINOR_HARM_FOCUS_ID);
    expect(domestic).toBeDefined();
    expect(minor).toBeDefined();
    expect(
      unresolvedCaseFocusGaps(domestic!, confirmedFactsOf("4月1日晚上，王某殴打其妻子李某。")).map(
        (gap) => gap.gapId,
      ),
    ).toEqual(["gap-harm-result", "gap-frequency", "gap-dwelling"]);
    expect(
      unresolvedCaseFocusGaps(minor!, confirmedFactsOf("5月2日，李某殴打其未成年女儿。")).map(
        (gap) => gap.gapId,
      ),
    ).toEqual(["gap-harm-result", "gap-age", "gap-repeat"]);
  });

  it("重点案情被禁用时命中仍成立但不再限定到其法源", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setCaseFocusStatus(DOMESTIC_VIOLENCE_FOCUS_ID, "withdrawn");
    const facts = confirmedFactsOf(DOMESTIC_TYPICAL);
    const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(resolution.primary?.caseFocusId).toBe(DOMESTIC_VIOLENCE_FOCUS_ID);
    expect(resolution.primaryEligible).toBe(false);
    expect(resolution.legalSources).toEqual([]);
  });

  it("财产类案情不会命中家庭与未成年人高风险重点案情", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const facts = confirmedFactsOf(
      "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。",
    );
    const resolution = resolveCaseFocus(store.caseFocuses(), facts, contextOf(store));
    expect(resolution.primary?.caseFocusId).toBe(THEFT_FOCUS_ID);
  });
});

describe("家庭与未成年人高风险重点案情的风险提示边界", () => {
  it("只有候选关键词时，不显示已触发的紧急风险结论，只提出中性安全核实问题", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const candidates = extractCaseFactsFixture(
      "有人反映某户可能存在家暴，孩子可能被打。",
    ).facts;

    // 候选事实不参与重点案情匹配，也不触发紧急核验提示。
    expect(matchedCaseFocuses(store.caseFocuses(), candidates)).toEqual([]);
    expect(buildUrgentPrompts(candidates, NOW)).toEqual([]);

    const pool = proposeDecisiveQuestionsFixture({
      facts: candidates,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 12,
    });
    const safety = pool.questions.find((question) => question.kind === "neutral_safety");
    expect(safety).toBeDefined();
    expect(safety?.priority).toBe(1);
  });

  it("已确认事实触发家庭暴力、人身安全、医疗需要、未成年人保护与证据灭失提示，且只要求人工核验", () => {
    const domestic = extractCaseFactsFixture(
      "4月1日晚上，王某在某某小区家中多次家暴其妻子李某，致李某轻微伤。李某受伤后已送医治疗。王某持刀扬言报复李某。李某称王某曾威胁删除监控记录。",
    ).facts.map((fact) => ({ ...fact, status: "confirmed" as const, statusLabel: FACT_STATUS_LABELS.confirmed }));
    const domesticPrompts = buildUrgentPrompts(domestic, NOW);
    expect(domesticPrompts.map((prompt) => prompt.category).sort()).toEqual(
      ["domestic_violence", "evidence_loss", "medical", "personal_safety"].sort(),
    );
    for (const prompt of domesticPrompts) {
      expect(prompt.triggeringFactIds.length).toBeGreaterThan(0);
      expect(prompt.humanChecks.length).toBeGreaterThan(0);
      expect(prompt.boundaryStatement).toContain("不构成自动处置决定");
    }

    const minor = extractCaseFactsFixture(MINOR_TYPICAL).facts.map((fact) => ({
      ...fact,
      status: "confirmed" as const,
      statusLabel: FACT_STATUS_LABELS.confirmed,
    }));
    const minorPrompts = buildUrgentPrompts(minor, NOW);
    expect(minorPrompts.map((prompt) => prompt.category)).toContain("minor_protection");
    for (const prompt of minorPrompts) {
      expect(prompt.triggeringFactIds.length).toBeGreaterThan(0);
      expect(prompt.humanChecks.length).toBeGreaterThan(0);
      expect(prompt.boundaryStatement).toContain("不构成自动处置决定");
    }
  });
});
