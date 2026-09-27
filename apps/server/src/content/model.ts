import type {
  ContentStatus,
  DocumentExampleAnnotatedPart,
  DocumentExampleNeighbor,
  DocumentExampleStructureSection,
  HandlingStageId,
  LegalSourceArticle,
  LegalSourceStatus,
  ProcedureCategory,
} from "@policymate/contracts";

/**
 * 受治理内容的内部记录模型。
 *
 * 这些记录是内容源的事实表示：写入后视为不可变，任何实质变化都必须产生新版本，
 * 不得原地覆盖。运行时的“当前状态门控”只读取记录并叠加当前的治理状态。
 */

/** 内容项的测试场景与结果。只有全部通过的内容项才允许进入激活批次。 */
export interface ContentTestResult {
  scenarioId: string;
  outcome: "pass" | "fail";
}

/** 法源记录。 */
export interface LegalSourceRecord {
  sourceId: string;
  version: string;
  title: string;
  issuingAuthority: string;
  documentNumber: string;
  authorityLevel: string;
  region: string;
  status: LegalSourceStatus;
  publishedAt: string;
  effectiveAt: string | null;
  officialUrl: string | null;
  retrievedAt: string;
  contentHash: string;
  articles: LegalSourceArticle[];
  lastVerifiedAt: string;
  nextReviewDueAt: string;
  maintainer: string;
}

/** 文书范例变体记录。 */
export interface DocumentExampleRecord {
  exampleId: string;
  version: string;
  contentStatus: ContentStatus;
  formalName: string;
  aliases: string[];
  procedureCategory: ProcedureCategory;
  stageId: HandlingStageId;
  documentTypeId: string;
  documentTypeName: string;
  caseTags: string[];
  applicableRoles: string[];
  applicableScenarios: string[];
  exclusions: string[];
  prerequisites: string[];
  preflightChecks: string[];
  neighbors: DocumentExampleNeighbor[];
  structure: DocumentExampleStructureSection[];
  annotatedExample: DocumentExampleAnnotatedPart[];
  productionPoints: string[];
  commonErrors: string[];
  riskNotes: string[];
  formatSource: string | null;
  sourceIds: string[];
  draftedAt: string;
  verifiedAt: string;
  publishedAt: string;
  lastVerifiedAt: string;
  nextReviewDueAt: string;
  maintainer: string;
  changeNote: string;
  sourceVerificationNote: string;
  testResults: ContentTestResult[];
  /** 撤回或替代关系；无关联时为 `null`，不得留含义不明的空值。 */
  withdrawalNote: string | null;
  supersededBy: string | null;
}

/** 不可变的内容发布批次清单。 */
export interface ContentReleaseManifest {
  releaseId: string;
  version: string;
  activatedAt: string;
  maintainer: string;
  changeNote: string;
  /** 白名单：只有清单内的内容项与版本可以进行生产检索。 */
  items: { exampleId: string; version: string }[];
  legalSources: { sourceId: string; version: string }[];
  testSummary: string;
}

/** 内容源初始装载结果。 */
export interface GovernedContentSeed {
  sources: LegalSourceRecord[];
  examples: DocumentExampleRecord[];
  release: ContentReleaseManifest;
}

/** 一个内容项相对当前激活批次的不可用原因。 */
export type IneligibilityReason =
  | "content_status"
  | "source_status"
  | "expired"
  | "not_in_release";

export interface EligibilityContext {
  release: ContentReleaseManifest | null;
  sources: ReadonlyMap<string, LegalSourceRecord>;
  now: Date;
}
