import { describe, expect, it } from "vitest";
import {
  matchesDocumentExampleKeyword,
  type DocumentExampleVariantSummary,
} from "@policymate/contracts";
import {
  DOCUMENT_EXAMPLE_COVERAGE_MATRIX,
  DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM,
  DOCUMENT_EXAMPLE_SOURCES,
  DOCUMENT_EXAMPLE_TEST_SCENARIOS,
  DOCUMENT_EXAMPLE_VARIANTS,
  HIGH_RISK_CASE_TAG,
  RECEPTION_RECEIPT_ID,
  RECEPTION_REGISTER_ID,
  REQUIRED_DOCUMENT_EXAMPLE_COUNT,
  REQUIRED_DOCUMENT_EXAMPLE_STAGES,
} from "../src/content/document-example-content";
import { REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS } from "../src/content/family-minor-content";
import { REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS } from "../src/content/property-economic-content";
import { REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS } from "../src/content/public-order-drug-content";
import { createFixtureContent } from "../src/content/fixture-content";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../src/content/responses";
import { selectEligibleExamples, selectTaskCandidates } from "../src/content/gating";
import { validateRelease } from "../src/content/release";
import { createGovernedContentStore, type GovernedContentStore } from "../src/content/store";
import type { DocumentExampleRecord } from "../src/content/model";

/** 固定“当前时间”，使核验期限门控可重复。 */
const NOW = new Date("2026-10-01T00:00:00.000Z");

const REQUIRED_STAGES = new Set<string>(REQUIRED_DOCUMENT_EXAMPLE_STAGES);
const DAY_MS = 24 * 60 * 60 * 1000;
const SENSITIVE_PATTERNS = [
  /\d{17}[\dXx]/,
  /1[3-9]\d{9}/,
  /身份证|手机号|真实姓名|真实住址|门牌号/,
];

type ScenarioId = (typeof DOCUMENT_EXAMPLE_TEST_SCENARIOS)[number];

function fictionalTextsOf(item: DocumentExampleRecord): string[] {
  return item.annotatedExample.map((part) => part.fictionalText);
}

function allFictionalTexts(): string {
  return DOCUMENT_EXAMPLE_VARIANTS.flatMap(fictionalTextsOf).join("\n");
}

function search(
  items: readonly DocumentExampleVariantSummary[],
  keyword: string,
): DocumentExampleVariantSummary[] {
  return items.filter((item) => matchesDocumentExampleKeyword(item, keyword));
}

/**
 * 发布门槛场景 → 实际执行的检查。
 *
 * 内容记录中的 `testResults` 是发布门槛的结果声明；下面是每个场景对每个变体
 * 真正执行的检查。检查失败即测试失败，从而使结果声明可被验证而不是自证。
 */
const SCENARIO_CHECKS: Record<
  ScenarioId,
  (store: GovernedContentStore, item: DocumentExampleRecord) => void
> = {
  "typical-retrieval": (store, item) => {
    const index = buildDocumentExampleIndex(store, NOW);
    expect(index.items.map((entry) => entry.exampleId)).toContain(item.exampleId);
  },
  "neighboring-non-match": (store, item) => {
    const index = buildDocumentExampleIndex(store, NOW);
    for (const neighbor of item.neighbors) {
      const hits = search(index.items, neighbor.formalName).map((entry) => entry.exampleId);
      expect(hits, `${item.exampleId} 相邻名称 ${neighbor.formalName}`).toContain(neighbor.exampleId);
      expect(hits, `${item.exampleId} 被相邻名称误命中`).not.toContain(item.exampleId);
    }
  },
  "missing-applicability-condition": (store, item) => {
    const records = selectEligibleExamples(store.examples(), store.eligibilityContext(NOW));
    const base = {
      contractVersion: "1.0" as const,
      procedureCategory: item.procedureCategory,
      stageId: item.stageId,
      applicableRoles: [],
    };
    // 决定性适用条件缺失：要求一个该变体不具备的案情标签，不得被静默选中。
    const missing = selectTaskCandidates(records, {
      ...base,
      caseTags: ["__缺失的决定性条件__"],
    });
    expect(missing.map((candidate) => candidate.exampleId)).not.toContain(item.exampleId);
    // 决定性适用条件满足：使用该变体自身的标签，应当作为候选返回。
    const present = selectTaskCandidates(records, { ...base, caseTags: [item.caseTags[0]!] });
    expect(present.map((candidate) => candidate.exampleId)).toContain(item.exampleId);
    for (const candidate of present.filter((entry) => entry.exampleId === item.exampleId)) {
      expect(candidate.preflightChecks.length, `${item.exampleId} 选择前必须核验`).toBeGreaterThan(0);
    }
  },
  "wrong-procedure-or-role": (store, item) => {
    const records = selectEligibleExamples(store.examples(), store.eligibilityContext(NOW));
    const candidates = selectTaskCandidates(records, {
      contractVersion: "1.0",
      procedureCategory: item.procedureCategory,
      stageId: item.stageId,
      applicableRoles: ["__不存在的角色__"],
      caseTags: [],
    });
    expect(candidates, `${item.exampleId} 错误角色不应筛出候选`).toEqual([]);
  },
  "alias-and-colloquial-search": (store, item) => {
    const index = buildDocumentExampleIndex(store, NOW);
    for (const alias of item.aliases) {
      expect(
        search(index.items, alias).map((entry) => entry.exampleId),
        `${item.exampleId} 别名 ${alias}`,
      ).toContain(item.exampleId);
    }
  },
  "no-generation-or-export-affordance": (store, item) => {
    const lookup = lookupDocumentExample(store, item.exampleId, NOW);
    expect(lookup.outcome).toBe("found");
    if (lookup.outcome !== "found") return;
    for (const key of Object.keys(lookup.example)) {
      expect(key, `${item.exampleId} 暴露可能生成、套用或者导出的字段`).not.toMatch(
        /generat|download|export|print|share|copy|template|autofill|apply/,
      );
    }
  },
  "fictionalization-and-sensitive-data": (_store, item) => {
    const text = fictionalTextsOf(item).join("\n");
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(text, `${item.exampleId} 命中敏感信息模式 ${pattern}`).not.toMatch(pattern);
    }
    const systemTokens = [
      DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM.unit,
      DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM.division,
      DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM.place,
      ...DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM.people,
    ];
    expect(
      fictionalTextsOf(item).some((part) => systemTokens.some((token) => part.includes(token))),
      `${item.exampleId} 未使用统一虚构体系`,
    ).toBe(true);
  },
  "source-traceability": (_store, item) => {
    expect(item.formatSource, `${item.exampleId} 格式来源`).toBeTruthy();
    for (const sourceId of item.sourceIds) {
      expect(
        DOCUMENT_EXAMPLE_SOURCES.some((source) => source.sourceId === sourceId),
        `${item.exampleId} 依赖 ${sourceId}`,
      ).toBe(true);
    }
  },
  "withdrawal-expiry-and-disable": (_store, item) => {
    const fresh = createGovernedContentStore(createFixtureContent());
    expect(fresh.setExampleStatus(item.exampleId, "withdrawn")).toBe(true);
    expect(buildDocumentExampleIndex(fresh, NOW).items.map((entry) => entry.exampleId)).not.toContain(
      item.exampleId,
    );
    fresh.setExampleStatus(item.exampleId, "trial");
    expect(buildDocumentExampleIndex(fresh, NOW).items.map((entry) => entry.exampleId)).toContain(
      item.exampleId,
    );
    fresh.setExamplesExpired(true);
    expect(buildDocumentExampleIndex(fresh, NOW).items).toEqual([]);
  },
  "old-link-blocking": (_store, item) => {
    const fresh = createGovernedContentStore(createFixtureContent());
    fresh.setExampleStatus(item.exampleId, "withdrawn");
    expect(lookupDocumentExample(fresh, item.exampleId, NOW)).toEqual({ outcome: "unavailable" });
  },
};

describe("首批文书范例内容包", () => {
  it("发布至少六个覆盖既定阶段的独立版本化变体", () => {
    const ids = DOCUMENT_EXAMPLE_VARIANTS.map((item) => item.exampleId);
    expect(ids.length).toBeGreaterThanOrEqual(REQUIRED_DOCUMENT_EXAMPLE_COUNT);
    expect(new Set(ids).size).toBe(ids.length);

    const stages = new Set<string>(DOCUMENT_EXAMPLE_VARIANTS.map((item) => item.stageId));
    for (const stage of REQUIRED_STAGES) {
      expect(stages.has(stage), `缺少阶段 ${stage}`).toBe(true);
    }
  });

  it("覆盖至少一个高风险程序环节，且高风险提醒只要求人工核验", () => {
    const highRisk = DOCUMENT_EXAMPLE_VARIANTS.filter((item) =>
      item.caseTags.includes(HIGH_RISK_CASE_TAG),
    );
    expect(highRisk.length).toBeGreaterThanOrEqual(1);
    for (const item of highRisk) {
      expect(item.riskNotes.join("\n")).toMatch(/高风险|核验|复核/);
    }
  });

  it("每个变体具有独立版本、状态、身份、分类与全部适用条件字段", () => {
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(item.version, item.exampleId).not.toBe("");
      expect(item.contentStatus, item.exampleId).toBe("trial");
      expect(item.formalName, item.exampleId).not.toBe("");
      expect(item.aliases.length, `${item.exampleId} 别名`).toBeGreaterThan(0);
      expect(item.procedureCategory, item.exampleId).toMatch(/^(administrative|criminal)$/);
      expect(REQUIRED_STAGES.has(item.stageId), `${item.exampleId} 阶段`).toBe(true);
      expect(item.documentTypeId, item.exampleId).not.toBe("");
      expect(item.documentTypeName, item.exampleId).not.toBe("");
      expect(item.caseTags.length, `${item.exampleId} 案情标签`).toBeGreaterThan(0);
      expect(item.applicableRoles.length, `${item.exampleId} 适用对象`).toBeGreaterThan(0);
      expect(item.maintainer, item.exampleId).not.toBe("");
      expect(item.changeNote, item.exampleId).not.toBe("");
      expect(item.sourceVerificationNote, item.exampleId).not.toBe("");
      expect(item.withdrawalNote, item.exampleId).toBeNull();
      expect(item.supersededBy, item.exampleId).toBeNull();
    }
  });

  it("适用场景记录触发条件，前置条件与必须核验事实分别存放", () => {
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(item.applicableScenarios.length, `${item.exampleId} 触发条件`).toBeGreaterThan(0);
      for (const scenario of item.applicableScenarios) {
        expect(scenario.trim().endsWith("时。"), `${item.exampleId} 触发条件：${scenario}`).toBe(true);
      }
      expect(item.prerequisites.length, `${item.exampleId} 前置条件`).toBeGreaterThan(0);
      expect(item.preflightChecks.length, `${item.exampleId} 必须核验事实`).toBeGreaterThan(0);
    }
  });

  it("每个变体具有结构分段、注释式虚构示例、制作要点、常见错误与高风险提醒", () => {
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(item.structure.length, `${item.exampleId} 结构分段`).toBeGreaterThan(0);
      for (const section of item.structure) {
        expect(section.heading, item.exampleId).not.toBe("");
        expect(section.purpose, item.exampleId).not.toBe("");
      }
      expect(item.annotatedExample.length, `${item.exampleId} 注释式示例`).toBeGreaterThan(0);
      const structureHeadings = new Set(item.structure.map((section) => section.heading));
      for (const part of item.annotatedExample) {
        expect(structureHeadings.has(part.heading), `${item.exampleId} 示例分段 ${part.heading}`).toBe(
          true,
        );
        expect(part.fictionalText, item.exampleId).not.toBe("");
        expect(part.annotations.length, `${item.exampleId} 示例注释`).toBeGreaterThan(0);
      }
      expect(item.productionPoints.length, `${item.exampleId} 制作要点`).toBeGreaterThan(0);
      expect(item.commonErrors.length, `${item.exampleId} 常见错误`).toBeGreaterThan(0);
      expect(item.riskNotes.length, `${item.exampleId} 高风险提醒`).toBeGreaterThan(0);
    }
  });

  it("每个变体具有正式格式或制作规范来源，并可追溯到现行公开法源", () => {
    const sources = new Map(DOCUMENT_EXAMPLE_SOURCES.map((source) => [source.sourceId, source]));
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(item.formatSource, `${item.exampleId} 格式来源`).toBeTruthy();
      expect(item.sourceIds.length, `${item.exampleId} 法源`).toBeGreaterThan(0);
      const titles = item.sourceIds.map((sourceId) => {
        const source = sources.get(sourceId);
        expect(source, `${item.exampleId} 依赖 ${sourceId}`).toBeDefined();
        expect(source?.status, `${item.exampleId} 依赖 ${sourceId}`).toBe("current");
        return source!.title.replace(/（[^）]*）/g, "").replace(/《|》/g, "");
      });
      const formatSource = item.formatSource!.replace(/《|》/g, "");
      expect(
        titles.some((title) => formatSource.includes(title)),
        `${item.exampleId} 的格式来源无法追溯到其法源`,
      ).toBe(true);
    }
  });

  it("法源限定为国家公开正式规范并带有官方链接", () => {
    for (const source of DOCUMENT_EXAMPLE_SOURCES) {
      expect(source.status, source.sourceId).toBe("current");
      expect(source.region, source.sourceId).toBe("国家");
      expect(source.authorityLevel, source.sourceId).toBe("部门规章");
      expect(source.documentNumber, source.sourceId).toContain("公安部令");
      expect(source.officialUrl ?? "", source.sourceId).toMatch(/^https:\/\/www\.gov\.cn\//);
      expect(Number.isFinite(Date.parse(source.nextReviewDueAt)), source.sourceId).toBe(true);
    }
  });

  it("涉及受立案与刑事/行政分流的受案内容使用 30 天核验期限，其余不超过 90 天", () => {
    const diversionIds = new Set([RECEPTION_REGISTER_ID, RECEPTION_RECEIPT_ID]);
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      const span = Date.parse(item.nextReviewDueAt) - Date.parse(item.lastVerifiedAt);
      expect(Number.isFinite(span), item.exampleId).toBe(true);
      if (diversionIds.has(item.exampleId)) {
        expect(span, `${item.exampleId} 应为 30 天核验期限`).toBe(30 * DAY_MS);
      } else {
        expect(span, `${item.exampleId} 核验期限不得超过 90 天`).toBeLessThanOrEqual(90 * DAY_MS);
      }
    }
  });

  it("示例文本通过虚构化和敏感信息检查，并使用统一虚构体系", () => {
    const text = allFictionalTexts();
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
    const numbers = text.match(/[\u4e00-\u9fa5]{1,6}字〔\d{4}〕第\d+号/g) ?? [];
    expect(numbers.length, "示例应包含虚构文书编号").toBeGreaterThan(0);
    for (const number of numbers) {
      expect(number.startsWith(DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM.documentNumberPrefix), number).toBe(
        true,
      );
    }
  });

  it("每个变体的发布门槛场景都由实际检查执行，记录结果与之一致", () => {
    const store = createGovernedContentStore(createFixtureContent());
    expect(Object.keys(SCENARIO_CHECKS).sort()).toEqual(
      [...DOCUMENT_EXAMPLE_TEST_SCENARIOS].sort(),
    );
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      for (const scenarioId of DOCUMENT_EXAMPLE_TEST_SCENARIOS) {
        SCENARIO_CHECKS[scenarioId](store, item);
      }
      expect(item.testResults.map((result) => result.scenarioId)).toEqual([
        ...DOCUMENT_EXAMPLE_TEST_SCENARIOS,
      ]);
      expect(item.testResults.every((result) => result.outcome === "pass"), item.exampleId).toBe(true);
    }
  });
});

describe("首批文书范例任务候选", () => {
  const store = createGovernedContentStore(createFixtureContent());
  const summaries = buildDocumentExampleIndex(store, NOW).items;
  const records = selectEligibleExamples(store.examples(), store.eligibilityContext(NOW));

  it("多个变体可能适用时并列展示差异，不自动选择唯一范例", () => {
    const candidates = selectTaskCandidates(records, {
      contractVersion: "1.0",
      procedureCategory: "administrative",
      stageId: "reception_acceptance",
      applicableRoles: ["办案民警"],
      caseTags: ["接报受理"],
    });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    for (const candidate of candidates) {
      expect(candidate.difference).not.toBe("");
      expect(candidate.preflightChecks.length).toBeGreaterThan(0);
    }
  });

  it("错误程序类别不会筛出刑事变体", () => {
    const criminal = DOCUMENT_EXAMPLE_VARIANTS.find(
      (item) => item.procedureCategory === "criminal",
    );
    expect(criminal).toBeDefined();
    const candidates = selectTaskCandidates(records, {
      contractVersion: "1.0",
      procedureCategory: "administrative",
      stageId: "investigation_evidence",
      applicableRoles: ["侦查人员"],
      caseTags: ["讯问"],
    });
    expect(candidates.map((candidate) => candidate.exampleId)).not.toContain(criminal!.exampleId);
  });

  it("典型与别名检索命中对应变体，摘要不携带任何案情", () => {
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(search(summaries, item.formalName).map((entry) => entry.exampleId)).toContain(
        item.exampleId,
      );
      for (const alias of item.aliases) {
        expect(search(summaries, alias).map((entry) => entry.exampleId)).toContain(item.exampleId);
      }
    }
  });
});

describe("首批文书范例当前状态门控", () => {
  it("装入统一批次后全部变体可用且进入索引", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const index = buildDocumentExampleIndex(store, NOW);
    expect(index.items.map((item) => item.exampleId).sort()).toEqual(
      DOCUMENT_EXAMPLE_VARIANTS.map((item) => item.exampleId).sort(),
    );
  });

  it("依赖法源失效或内容到期时全部变体退出生产，恢复后重新可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const baseline = buildDocumentExampleIndex(store, NOW).items.length;
    expect(baseline).toBeGreaterThanOrEqual(REQUIRED_DOCUMENT_EXAMPLE_COUNT);

    store.setAllLegalSourceStatus("repealed");
    expect(buildDocumentExampleIndex(store, NOW).items).toEqual([]);

    store.setAllLegalSourceStatus("current");
    store.setExamplesExpired(true);
    expect(buildDocumentExampleIndex(store, NOW).items).toEqual([]);

    store.setExamplesExpired(false);
    expect(buildDocumentExampleIndex(store, NOW).items.length).toBe(baseline);
  });

  it("激活批次记录全部变体版本，并通过发布校验", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const release = store.activeRelease();
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      const entry = release.items.find((candidate) => candidate.exampleId === item.exampleId);
      expect(entry, item.exampleId).toBeDefined();
      expect(entry?.version).toBe(item.version);
    }
    expect(validateRelease(release, store.sources(), store.examples(), store.caseFocuses())).toEqual(
      [],
    );
  });
});

describe("派出所重点案情 × 文书范例内部覆盖矩阵", () => {
  const caseFocusIds = [
    ...REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS,
    ...REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS,
    ...REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS,
  ];

  it("覆盖全部十组重点案情，且只引用已发布变体", () => {
    expect(Object.keys(DOCUMENT_EXAMPLE_COVERAGE_MATRIX).sort()).toEqual([...caseFocusIds].sort());
    const published = new Map(DOCUMENT_EXAMPLE_VARIANTS.map((item) => [item.exampleId, item]));
    for (const [caseFocusId, exampleIds] of Object.entries(DOCUMENT_EXAMPLE_COVERAGE_MATRIX)) {
      expect(exampleIds.length, caseFocusId).toBeGreaterThan(0);
      const stages = new Set<string>();
      for (const exampleId of exampleIds) {
        const item = published.get(exampleId);
        expect(item, `${caseFocusId} 引用未发布变体 ${exampleId}`).toBeDefined();
        stages.add(item!.stageId);
      }
      for (const stage of REQUIRED_STAGES) {
        expect(stages.has(stage), `${caseFocusId} 缺少阶段 ${stage}`).toBe(true);
      }
    }
  });

  it("每个已发布变体至少被一组重点案情引用，矩阵不进入用户可见投影", () => {
    const referenced = new Set(Object.values(DOCUMENT_EXAMPLE_COVERAGE_MATRIX).flat());
    for (const item of DOCUMENT_EXAMPLE_VARIANTS) {
      expect(referenced.has(item.exampleId), `变体 ${item.exampleId} 未被任何重点案情引用`).toBe(
        true,
      );
    }
    const store = createGovernedContentStore(createFixtureContent());
    const index = buildDocumentExampleIndex(store, NOW);
    expect(Object.keys(index).sort()).toEqual(["facets", "items", "releaseId", "stages"]);
    // 矩阵以重点案情 ID 为键；若泄漏到索引，重点案情 ID 会出现。
    expect(JSON.stringify(index)).not.toContain("focus-");
  });
});
