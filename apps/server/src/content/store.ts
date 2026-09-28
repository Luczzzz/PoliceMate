import type {
  ContentStatus,
  FixtureCaseFocusState,
  FixtureExampleState,
  FixtureLegalSourceState,
  LegalSourceStatus,
} from "@policymate/contracts";
import { selectEligibleExamples } from "./gating";
import { selectEligibleCaseFocuses } from "./case-focus";
import type {
  CaseFocusRecord,
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
  eligibleCaseFocusCount: number;
  examples: FixtureExampleState[];
  caseFocuses: FixtureCaseFocusState[];
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
  caseFocuses(): readonly CaseFocusRecord[];
  findExample(exampleId: string): DocumentExampleRecord | undefined;
  findCaseFocus(caseFocusId: string): CaseFocusRecord | undefined;
  eligibilityContext(now?: Date): EligibilityContext;
  eligibleExamples(now?: Date): DocumentExampleRecord[];
  eligibleCaseFocuses(now?: Date): CaseFocusRecord[];
  snapshot(now?: Date): GovernedContentSnapshot;
  setAllExampleStatus(status: ContentStatus): void;
  setExampleStatus(exampleId: string, status: ContentStatus): boolean;
  setAllCaseFocusStatus(status: ContentStatus): void;
  setCaseFocusStatus(caseFocusId: string, status: ContentStatus): boolean;
  setAllLegalSourceStatus(status: LegalSourceStatus): void;
  setExamplesExpired(expired: boolean): void;
  setCaseFocusesExpired(expired: boolean): void;
  setLegalSourcesExpired(expired: boolean): void;
  reset(): void;
}

export function createGovernedContentStore(seed: GovernedContentSeed): GovernedContentStore {
  const baselineReviewDueAt = new Map(
    seed.examples.map((item) => [item.exampleId, item.nextReviewDueAt]),
  );
  const baselineCaseFocusReviewDueAt = new Map(
    seed.caseFocuses.map((item) => [item.caseFocusId, item.nextReviewDueAt]),
  );
  const baselineSourceReviewDueAt = new Map(
    seed.sources.map((source) => [source.sourceId, source.nextReviewDueAt]),
  );

  let sources: LegalSourceRecord[];
  let examples: DocumentExampleRecord[];
  let caseFocuses: CaseFocusRecord[];
  let release: ContentReleaseManifest;

  const loadSeed = () => {
    sources = seed.sources.map((source) => ({
      ...source,
      articles: source.articles.map((article) => ({ ...article })),
    }));
    examples = seed.examples.map((item) => cloneExample(item));
    caseFocuses = seed.caseFocuses.map((item) => cloneCaseFocus(item));
    release = {
      ...seed.release,
      items: seed.release.items.map((entry) => ({ ...entry })),
      caseFocuses: seed.release.caseFocuses.map((entry) => ({ ...entry })),
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
    caseFocuses() {
      return caseFocuses;
    },
    findExample(exampleId) {
      return examples.find((item) => item.exampleId === exampleId);
    },
    findCaseFocus(caseFocusId) {
      return caseFocuses.find((item) => item.caseFocusId === caseFocusId);
    },
    eligibilityContext(now = new Date()) {
      return { release, sources: sourceMap(), now };
    },
    eligibleExamples(now = new Date()) {
      const context = this.eligibilityContext(now);
      return selectEligibleExamples(examples, context);
    },
    eligibleCaseFocuses(now = new Date()) {
      const context = this.eligibilityContext(now);
      return selectEligibleCaseFocuses(caseFocuses, context);
    },
    snapshot(now = new Date()) {
      const context = this.eligibilityContext(now);
      const eligibleIds = new Set(
        selectEligibleExamples(examples, context).map((item) => item.exampleId),
      );
      const eligibleFocusIds = new Set(
        selectEligibleCaseFocuses(caseFocuses, context).map((item) => item.caseFocusId),
      );
      return {
        activeReleaseId: release.releaseId,
        eligibleExampleCount: eligibleIds.size,
        eligibleCaseFocusCount: eligibleFocusIds.size,
        examples: examples.map((item) => ({
          exampleId: item.exampleId,
          contentStatus: item.contentStatus,
          eligible: eligibleIds.has(item.exampleId),
        })),
        caseFocuses: caseFocuses.map((item) => ({
          caseFocusId: item.caseFocusId,
          contentStatus: item.contentStatus,
          eligible: eligibleFocusIds.has(item.caseFocusId),
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
    setAllCaseFocusStatus(status) {
      caseFocuses = caseFocuses.map((item) => ({ ...item, contentStatus: status }));
    },
    setCaseFocusStatus(caseFocusId, status) {
      if (!caseFocuses.some((item) => item.caseFocusId === caseFocusId)) return false;
      caseFocuses = caseFocuses.map((item) =>
        item.caseFocusId === caseFocusId ? { ...item, contentStatus: status } : item,
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
    setCaseFocusesExpired(expired) {
      caseFocuses = caseFocuses.map((item) => ({
        ...item,
        nextReviewDueAt: expired
          ? EXPIRED_REVIEW_DUE_AT
          : (baselineCaseFocusReviewDueAt.get(item.caseFocusId) ?? item.nextReviewDueAt),
      }));
    },
    setLegalSourcesExpired(expired) {
      sources = sources.map((source) => ({
        ...source,
        nextReviewDueAt: expired
          ? EXPIRED_REVIEW_DUE_AT
          : (baselineSourceReviewDueAt.get(source.sourceId) ?? source.nextReviewDueAt),
      }));
    },
    reset() {
      loadSeed();
    },
  };
}

/** 深拷贝一条内容记录，避免种子与存储共享可变引用。 */
export function cloneExample(item: DocumentExampleRecord): DocumentExampleRecord {  return {
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

/** 深拷贝一条重点案情记录。 */
export function cloneCaseFocus(item: CaseFocusRecord): CaseFocusRecord {
  return {
    ...item,
    match: {
      behaviorLabels: [...item.match.behaviorLabels],
      requireAnyHints:
        item.match.requireAnyHints === undefined ? undefined : [...item.match.requireAnyHints],
      excludeHints: item.match.excludeHints === undefined ? undefined : [...item.match.excludeHints],
    },
    elements: [...item.elements],
    diversionRules: item.diversionRules.map((rule) => ({
      ...rule,
      conditions: [...rule.conditions],
      basis: rule.basis.map((entry) => ({ ...entry })),
    })),
    neighbors: item.neighbors.map((neighbor) => ({
      ...neighbor,
      decisiveFacts: [...neighbor.decisiveFacts],
    })),
    gaps: item.gaps.map((gap) => ({ ...gap, affectsDiversions: [...gap.affectsDiversions] })),
    highRiskBoundary: [...item.highRiskBoundary],
    sourceIds: [...item.sourceIds],
    scenarios: item.scenarios.map((scenario) => ({
      ...scenario,
      expectedCaseFocusIds: [...scenario.expectedCaseFocusIds],
      expectedUnresolvedGapIds: [...scenario.expectedUnresolvedGapIds],
    })),
    testResults: item.testResults.map((result) => ({ ...result })),
  };
}
