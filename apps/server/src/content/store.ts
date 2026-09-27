import type {
  ContentStatus,
  FixtureExampleState,
  FixtureLegalSourceState,
  LegalSourceStatus,
} from "@policymate/contracts";
import { selectEligibleExamples } from "./gating";
import type {
  ContentReleaseManifest,
  DocumentExampleRecord,
  EligibilityContext,
  GovernedContentSeed,
  LegalSourceRecord,
} from "./model";

/** 过期模拟使用一个明确的过去时间点，避免依赖运行机器时钟时区。 */
const EXPIRED_REVIEW_DUE_AT = "2000-01-01T00:00:00.000Z";

export interface GovernedContentSnapshot {
  activeReleaseId: string;
  eligibleExampleCount: number;
  examples: FixtureExampleState[];
  legalSources: FixtureLegalSourceState[];
}

/**
 * 受治理内容存储。
 *
 * 记录本身不可变；这里只维护“当前治理状态”这类运行时可变的治理开关
 * （内容状态、法源状态、复核期限），供紧急下架与测试控制使用。
 * 所有读取都经过当前状态门控，不做结果缓存。
 */
export interface GovernedContentStore {
  activeRelease(): ContentReleaseManifest;
  sources(): ReadonlyMap<string, LegalSourceRecord>;
  examples(): readonly DocumentExampleRecord[];
  findExample(exampleId: string): DocumentExampleRecord | undefined;
  eligibilityContext(now?: Date): EligibilityContext;
  eligibleExamples(now?: Date): DocumentExampleRecord[];
  snapshot(now?: Date): GovernedContentSnapshot;
  setAllExampleStatus(status: ContentStatus): void;
  setExampleStatus(exampleId: string, status: ContentStatus): boolean;
  setAllLegalSourceStatus(status: LegalSourceStatus): void;
  setExamplesExpired(expired: boolean): void;
  reset(): void;
}

export function createGovernedContentStore(seed: GovernedContentSeed): GovernedContentStore {
  const baselineReviewDueAt = new Map(
    seed.examples.map((item) => [item.exampleId, item.nextReviewDueAt]),
  );

  let sources: LegalSourceRecord[];
  let examples: DocumentExampleRecord[];
  let release: ContentReleaseManifest;

  const loadSeed = () => {
    sources = seed.sources.map((source) => ({
      ...source,
      articles: source.articles.map((article) => ({ ...article })),
    }));
    examples = seed.examples.map((item) => cloneExample(item));
    release = {
      ...seed.release,
      items: seed.release.items.map((entry) => ({ ...entry })),
      legalSources: seed.release.legalSources.map((entry) => ({ ...entry })),
    };
  };

  loadSeed();

  const sourceMap = () => new Map(sources.map((source) => [source.sourceId, source]));

  return {
    activeRelease() {
      return release;
    },
    sources() {
      return sourceMap();
    },
    examples() {
      return examples;
    },
    findExample(exampleId) {
      return examples.find((item) => item.exampleId === exampleId);
    },
    eligibilityContext(now = new Date()) {
      return { release, sources: sourceMap(), now };
    },
    eligibleExamples(now = new Date()) {
      const context = this.eligibilityContext(now);
      return selectEligibleExamples(examples, context);
    },
    snapshot(now = new Date()) {
      const context = this.eligibilityContext(now);
      const eligibleIds = new Set(
        selectEligibleExamples(examples, context).map((item) => item.exampleId),
      );
      return {
        activeReleaseId: release.releaseId,
        eligibleExampleCount: eligibleIds.size,
        examples: examples.map((item) => ({
          exampleId: item.exampleId,
          contentStatus: item.contentStatus,
          eligible: eligibleIds.has(item.exampleId),
        })),
        legalSources: sources.map((source) => ({
          sourceId: source.sourceId,
          status: source.status,
        })),
      };
    },
    setAllExampleStatus(status) {
      examples = examples.map((item) => ({ ...item, contentStatus: status }));
    },
    setExampleStatus(exampleId, status) {
      if (!examples.some((item) => item.exampleId === exampleId)) return false;
      examples = examples.map((item) =>
        item.exampleId === exampleId ? { ...item, contentStatus: status } : item,
      );
      return true;
    },
    setAllLegalSourceStatus(status) {
      sources = sources.map((source) => ({ ...source, status }));
    },
    setExamplesExpired(expired) {
      examples = examples.map((item) => ({
        ...item,
        nextReviewDueAt: expired
          ? EXPIRED_REVIEW_DUE_AT
          : (baselineReviewDueAt.get(item.exampleId) ?? item.nextReviewDueAt),
      }));
    },
    reset() {
      loadSeed();
    },
  };
}

/** 深拷贝一条内容记录，避免种子与存储共享可变引用。 */
export function cloneExample(item: DocumentExampleRecord): DocumentExampleRecord {
  return {
    ...item,
    aliases: [...item.aliases],
    caseTags: [...item.caseTags],
    applicableRoles: [...item.applicableRoles],
    applicableScenarios: [...item.applicableScenarios],
    exclusions: [...item.exclusions],
    prerequisites: [...item.prerequisites],
    preflightChecks: [...item.preflightChecks],
    neighbors: item.neighbors.map((neighbor) => ({ ...neighbor })),
    structure: item.structure.map((section) => ({ ...section })),
    annotatedExample: item.annotatedExample.map((part) => ({
      ...part,
      annotations: [...part.annotations],
    })),
    productionPoints: [...item.productionPoints],
    commonErrors: [...item.commonErrors],
    riskNotes: [...item.riskNotes],
    sourceIds: [...item.sourceIds],
    testResults: item.testResults.map((result) => ({ ...result })),
  };
}
