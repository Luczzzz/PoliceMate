import { describe, expect, it } from "vitest";
import { CONTENT_STATUS_LABELS } from "../src/content/catalog";
import {
  buildFacets,
  effectiveReviewDueAt,
  evaluateEligibility,
  selectEligibleExamples,
  toDetail,
  toSummary,
} from "../src/content/gating";
import type {
  ContentReleaseManifest,
  DocumentExampleRecord,
  EligibilityContext,
  LegalSourceRecord,
} from "../src/content/model";
import { activateRelease, ReleaseActivationError, rollbackRelease } from "../src/content/release";
import { createFixtureContent } from "../src/content/fixture-content";
import { createGovernedContentStore } from "../src/content/store";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../src/content/responses";

const NOW = new Date("2026-03-01T00:00:00.000Z");

function source(overrides: Partial<LegalSourceRecord> = {}): LegalSourceRecord {
  return {
    sourceId: "src-1",
    version: "1.0.0",
    title: "测试法源",
    issuingAuthority: "测试机关",
    documentNumber: "测试文号〔2026〕1号",
    authorityLevel: "部门规章",
    region: "国家",
    status: "current",
    publishedAt: "2025-01-01T00:00:00.000Z",
    effectiveAt: "2025-06-01T00:00:00.000Z",
    officialUrl: null,
    retrievedAt: "2026-02-01T00:00:00.000Z",
    contentHash: "hash-1",
    articles: [{ location: "第一条", minimalText: "测试最小必要原文。" }],
    lastVerifiedAt: "2026-02-01T00:00:00.000Z",
    nextReviewDueAt: "2026-05-01T00:00:00.000Z",
    maintainer: "测试内容维护者",
    ...overrides,
  };
}

function example(overrides: Partial<DocumentExampleRecord> = {}): DocumentExampleRecord {
  return {
    exampleId: "doc-1",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "测试文书",
    aliases: ["测试别名"],
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    documentTypeId: "type-1",
    documentTypeName: "测试文书类型",
    caseTags: ["测试案情"],
    applicableRoles: ["办案民警"],
    applicableScenarios: ["适用场景"],
    exclusions: ["不适用情形"],
    prerequisites: ["前置条件"],
    preflightChecks: ["必须核验事实"],
    neighbors: [],
    structure: [{ heading: "首部", purpose: "说明身份与程序信息。" }],
    annotatedExample: [{ heading: "首部", fictionalText: "虚构文本", annotations: ["注释"] }],
    productionPoints: ["制作要点"],
    commonErrors: ["常见错误"],
    riskNotes: ["高风险提醒"],
    formatSource: null,
    sourceIds: ["src-1"],
    draftedAt: "2026-01-01T00:00:00.000Z",
    verifiedAt: "2026-02-01T00:00:00.000Z",
    publishedAt: "2026-02-02T00:00:00.000Z",
    lastVerifiedAt: "2026-02-01T00:00:00.000Z",
    nextReviewDueAt: "2026-05-01T00:00:00.000Z",
    maintainer: "测试内容维护者",
    changeNote: "初次发布。",
    sourceVerificationNote: "法源核验通过。",
    testResults: [{ scenarioId: "typical-search", outcome: "pass" }],
    withdrawalNote: null,
    supersededBy: null,
    ...overrides,
  };
}

function release(items: { exampleId: string; version: string }[]): ContentReleaseManifest {
  return {
    releaseId: "release-1",
    version: "1.0.0",
    activatedAt: "2026-02-03T00:00:00.000Z",
    maintainer: "测试内容维护者",
    changeNote: "首次激活。",
    items,
    caseFocuses: [],
    legalSources: [{ sourceId: "src-1", version: "1.0.0" }],
    testSummary: "全部测试通过。",
  };
}

function context(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  const sources = new Map<string, LegalSourceRecord>([["src-1", source()]]);
  return {
    release: release([{ exampleId: "doc-1", version: "1.0.0" }]),
    sources,
    now: NOW,
    ...overrides,
  };
}

describe("文书范例当前状态门控", () => {
  it("trial 内容、current 法源且在激活批次内时可用", () => {
    expect(evaluateEligibility(example(), context())).toBeNull();
  });

  it.each(["draft", "pending_verification", "withdrawn"] as const)(
    "内容状态为 %s 时退出生产",
    (status) => {
      expect(evaluateEligibility(example({ contentStatus: status }), context())).toBe(
        "content_status",
      );
    },
  );

  it.each(["future", "superseded", "repealed", "uncertain"] as const)(
    "依赖法源状态为 %s 时退出生产",
    (status) => {
      const ctx = context({ sources: new Map([["src-1", source({ status })]]) });
      expect(evaluateEligibility(example(), ctx)).toBe("source_status");
    },
  );

  it("不在激活批次白名单内的内容退出生产", () => {
    const ctx = context({ release: release([]) });
    expect(evaluateEligibility(example(), ctx)).toBe("not_in_release");
  });

  it("版本与批次记录不一致时退出生产", () => {
    const ctx = context({ release: release([{ exampleId: "doc-1", version: "0.9.0" }]) });
    expect(evaluateEligibility(example(), ctx)).toBe("not_in_release");
  });

  it("内容超过复核期限时退出生产", () => {
    const ctx = context({ now: new Date("2026-06-01T00:00:00.000Z") });
    expect(evaluateEligibility(example(), ctx)).toBe("expired");
  });

  it("复核日期无法解析时失败关闭", () => {
    expect(evaluateEligibility(example({ nextReviewDueAt: "not-a-date" }), context())).toBe(
      "expired",
    );
  });

  it("依赖法源比内容更早到期时，内容随法源到期", () => {
    const ctx = context({
      sources: new Map([["src-1", source({ nextReviewDueAt: "2026-03-15T00:00:00.000Z" })]]),
      now: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(effectiveReviewDueAt(example(), ctx.sources)).toBe("2026-03-15T00:00:00.000Z");
    expect(evaluateEligibility(example(), ctx)).toBe("expired");
  });

  it("筛选只在合格内容上计数", () => {
    const eligible = example();
    const draft = example({ exampleId: "doc-2", contentStatus: "draft" });
    const ctx = context({
      release: release([
        { exampleId: "doc-1", version: "1.0.0" },
        { exampleId: "doc-2", version: "1.0.0" },
      ]),
    });
    const gated = selectEligibleExamples([eligible, draft], ctx);
    const facets = buildFacets(gated);

    expect(facets.stages).toHaveLength(6);
    expect(facets.stages[0]).toEqual({ id: "reception_acceptance", label: "接报与受理", count: 1 });
    expect(facets.stages.filter((stage) => stage.count === 0)).toHaveLength(5);
    expect(facets.documentTypes).toEqual([{ id: "type-1", label: "测试文书类型", count: 1 }]);
    expect(facets.procedureCategories).toEqual([
      { id: "administrative", label: "行政程序", count: 1 },
    ]);
  });

  it("selectEligibleExamples 同时按批次与状态过滤", () => {
    const ctx = context({ release: release([{ exampleId: "doc-1", version: "1.0.0" }]) });
    const items = [example(), example({ exampleId: "doc-2" })];

    expect(selectEligibleExamples(items, ctx).map((item) => item.exampleId)).toEqual(["doc-1"]);
  });

  it("详情只保留仍可展示的相邻变体", () => {
    const item = example({
      neighbors: [
        { exampleId: "doc-1", formalName: "本变体", difference: "自身" },
        { exampleId: "doc-2", formalName: "相邻变体", difference: "程序类别不同。" },
      ],
    });
    const ctx = context({
      release: release([
        { exampleId: "doc-1", version: "1.0.0" },
        { exampleId: "doc-2", version: "1.0.0" },
      ]),
      sources: new Map([
        ["src-1", source()],
        ["src-2", source({ sourceId: "src-2", status: "repealed" })],
      ]),
    });
    const neighbor = example({
      exampleId: "doc-2",
      formalName: "相邻变体",
      sourceIds: ["src-1"],
    });

    const detail = toDetail(item, ctx, [item, neighbor]);
    expect(detail.neighboringVariants).toEqual([
      { exampleId: "doc-2", formalName: "相邻变体", difference: "程序类别不同。" },
    ]);
  });

  it("详情聚合全部法源依据与治理信息", () => {
    const detail = toDetail(example(), context(), [example()]);

    expect(detail.contentStatusLabel).toBe(CONTENT_STATUS_LABELS.trial);
    expect(detail.stageLabel).toBe("接报与受理");
    expect(detail.legalSources).toHaveLength(1);
    expect(detail.legalSources[0]?.statusLabel).toBe("现行有效");
    expect(detail.governance.releaseId).toBe("release-1");
  });

  it("摘要携带批次、法源与核验日期用于追溯", () => {
    const summary = toSummary(example(), "release-1");

    expect(summary.releaseId).toBe("release-1");
    expect(summary.sourceIds).toEqual(["src-1"]);
    expect(summary.lastVerifiedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("内容发布批次的原子激活", () => {
  it("全部内容合格时激活新批次并保留旧批次", () => {
    const current = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    const next = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    next.releaseId = "release-2";

    const activated = activateRelease(
      current,
      next,
      new Map([["src-1", source()]]),
      [example()],
    );
    expect(activated.releaseId).toBe("release-2");
  });

  it("批次包含未通过测试或状态不合规的内容时激活失败，旧批次保持激活", () => {
    const current = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    const next = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    next.releaseId = "release-2";

    expect(() =>
      activateRelease(
        current,
        next,
        new Map([["src-1", source()]]),
        [example({ contentStatus: "draft" })],
      ),
    ).toThrow(ReleaseActivationError);
    expect(current.releaseId).toBe("release-1");
  });

  it("批次记录的法源版本缺失或不一致时拒绍激活", () => {
    const current = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    const sources = new Map([["src-1", source()]]);

    const missingVersion = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    missingVersion.legalSources = [];
    expect(() => activateRelease(current, missingVersion, sources, [example()])).toThrow(
      ReleaseActivationError,
    );

    const mismatched = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    mismatched.legalSources = [{ sourceId: "src-1", version: "0.9.0" }];
    expect(() => activateRelease(current, mismatched, sources, [example()])).toThrow(
      ReleaseActivationError,
    );
  });

  it("回滚切回上一完整批次，未知批次返回 null", () => {
    const first = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    const second = release([{ exampleId: "doc-1", version: "1.0.0" }]);
    second.releaseId = "release-2";

    expect(rollbackRelease([first, second], "release-1")?.releaseId).toBe("release-1");
    expect(rollbackRelease([first, second], "release-404")).toBeNull();
  });
});

describe("确定性测试内容与治理存储", () => {
  it("提供至少一个 current 测试法源、trial 范例与激活批次，且关系可追溯", () => {
    const seed = createFixtureContent();
    const store = createGovernedContentStore(seed);
    const snapshot = store.snapshot(NOW);

    const sources = [...store.sources().values()];
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources.every((item) => item.status === "current")).toBe(true);

    const trialExamples = store.examples().filter((item) => item.contentStatus === "trial");
    expect(trialExamples.length).toBeGreaterThanOrEqual(1);

    const release = store.activeRelease();
    expect(release.items.length).toBeGreaterThanOrEqual(1);
    for (const item of trialExamples) {
      for (const sourceId of item.sourceIds) {
        expect(store.sources().has(sourceId)).toBe(true);
      }
    }
    for (const entry of release.items) {
      const item = store.findExample(entry.exampleId);
      expect(item?.version).toBe(entry.version);
    }
    for (const entry of release.legalSources) {
      expect(store.sources().get(entry.sourceId)?.version).toBe(entry.version);
    }
    expect(snapshot.eligibleExampleCount).toBe(trialExamples.length);
  });

  it("默认索引按办理阶段排序，并给出完整阶段筛选目录", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const index = buildDocumentExampleIndex(store, NOW);

    expect(index.releaseId).toBe(store.activeRelease().releaseId);
    expect(index.stages.map((stage) => stage.id)).toEqual([
      "reception_acceptance",
      "investigation_evidence",
      "measures_approval",
      "notification_service",
      "decision_disposition",
      "execution_closure",
    ]);
    expect(index.items.length).toBeGreaterThanOrEqual(1);
    expect(index.facets.stages).toHaveLength(6);
    expect(index.facets.procedureCategories.map((option) => option.id).sort()).toEqual([
      "administrative",
      "criminal",
    ]);
  });

  it("单个范例下架后从索引消失，旧链接返回 unavailable", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const target = store.examples()[0]!;

    store.setExampleStatus(target.exampleId, "withdrawn");

    const index = buildDocumentExampleIndex(store, NOW);
    expect(index.items.some((item) => item.exampleId === target.exampleId)).toBe(false);
    expect(lookupDocumentExample(store, target.exampleId, NOW)).toEqual({ outcome: "unavailable" });
  });

  it("全部范例撤回后合格数为零，但其余条目仍可追溯", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setAllExampleStatus("withdrawn");

    const snapshot = store.snapshot(NOW);
    expect(snapshot.eligibleExampleCount).toBe(0);
    expect(snapshot.examples.every((item) => item.eligible === false)).toBe(true);
    expect(buildDocumentExampleIndex(store, NOW).items).toEqual([]);
  });

  it("依赖法源失效时全部内容退出生产", () => {
    const store = createGovernedContentStore(createFixtureContent());
    store.setAllLegalSourceStatus("repealed");

    expect(store.snapshot(NOW).eligibleExampleCount).toBe(0);
    expect(buildDocumentExampleIndex(store, NOW).items).toEqual([]);
  });

  it("内容到期后退出生产，恢复核验期限后重新可用", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const baseline = store.snapshot(NOW).eligibleExampleCount;

    store.setExamplesExpired(true);
    expect(store.snapshot(NOW).eligibleExampleCount).toBe(0);

    store.setExamplesExpired(false);
    expect(store.snapshot(NOW).eligibleExampleCount).toBe(baseline);
  });

  it("重置恢复基线治理状态", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const baseline = store.snapshot(NOW).eligibleExampleCount;

    store.setAllExampleStatus("draft");
    store.setAllLegalSourceStatus("uncertain");
    store.setExamplesExpired(true);
    store.reset();

    const snapshot = store.snapshot(NOW);
    expect(snapshot.eligibleExampleCount).toBe(baseline);
    expect(snapshot.examples.every((item) => item.contentStatus === "trial")).toBe(true);
    expect(snapshot.legalSources.every((item) => item.status === "current")).toBe(true);
  });

  it("未知标识返回 not_found，不与失效内容混淆", () => {
    const store = createGovernedContentStore(createFixtureContent());
    expect(lookupDocumentExample(store, "doc-does-not-exist", NOW)).toEqual({
      outcome: "not_found",
    });
  });

  it("详情不会因相邻变体失效而绕过状态门控", () => {
    const store = createGovernedContentStore(createFixtureContent());
    const target = store.examples().find((item) => item.neighbors.length > 0);
    expect(target).toBeDefined();
    const neighborId = target!.neighbors[0]!.exampleId;

    const before = lookupDocumentExample(store, target!.exampleId, NOW);
    expect(before.outcome).toBe("found");
    if (before.outcome !== "found") return;
    expect(before.example.neighboringVariants.map((item) => item.exampleId)).toContain(neighborId);

    store.setExampleStatus(neighborId, "withdrawn");

    const after = lookupDocumentExample(store, target!.exampleId, NOW);
    expect(after.outcome).toBe("found");
    if (after.outcome !== "found") return;
    expect(after.example.neighboringVariants.map((item) => item.exampleId)).not.toContain(neighborId);
  });
});
