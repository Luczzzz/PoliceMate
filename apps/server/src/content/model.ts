import type {
  CaseFocusDiversion,
  ContentStatus,
  DocumentExampleAnnotatedPart,
  DocumentExampleNeighbor,
  DocumentExampleStructureSection,
  FactCategory,
  HandlingStageId,
  LegalSourceArticle,
  LegalSourceStatus,
  ProcedureCategory,
  ReportStatus,
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
  /** 白名单：只有清单内的重点案情与版本可以参与案情分析。 */
  caseFocuses: { caseFocusId: string; version: string }[];
  legalSources: { sourceId: string; version: string }[];
  testSummary: string;
}

/* ---------- 派出所重点案情内容模型 ---------- */

/** 重点案情的分流方向。 */
export type { CaseFocusDiversion };

/**
 * 重点案情的匹配规则。
 *
 * 只允许依据未排除的候选或已确认行为标签与原始表述线索，
 * 不得依据未知、否认或争议事实，也不得解析模型生成的自然语言结论。
 */
export interface CaseFocusMatchRuleRecord {
  /** 必须命中的行为标签（候选事实中 `category=behavior` 的规范值）。 */
  behaviorLabels: string[];
  /** 原始表述中必须出现其中之一的线索；为空表示不要求。 */
  requireAnyHints?: string[];
  /** 原始表述中出现任一线索即不匹配（用于与相邻重点案情互斥）。 */
  excludeHints?: string[];
}

/** 核心分流条件及其受治理法源依据。 */
export interface CaseFocusDiversionRuleRecord {
  diversion: CaseFocusDiversion;
  conditions: string[];
  /** 支撑该分流条件的受治理法源条款。 */
  basis: { sourceId: string; article: string }[];
}

/** 相邻案情或相邻分流方向的区别。 */
export interface CaseFocusNeighborRecord {
  /** 相邻的重点案情 ID；相邻方向为清单外案情（如民事纠纷、侵占）时为 `null`。 */
  neighborFocusId: string | null;
  name: string;
  distinction: string;
  /** 用于区分所必需的事实。 */
  decisiveFacts: string[];
}

/**
 * 决定性事实缺口的一个条件分支。
 *
 * 只声明“若…”的条件文本与对应分流方向；程序路径与依据在报告生成时从
 * 该重点案情的 `diversionRules` 读取，避免分支与分流规则两处漂移。
 */
export interface CaseFocusGapBranchRecord {
  /** 批次内稳定分支 ID。 */
  branchId: string;
  /** 分支条件（“若…”）。 */
  condition: string;
  /** 该条件对应的分流方向，必须属于所属缺口的 `affectsDiversions`。 */
  diversion: CaseFocusDiversion;
}

/**
 * 决定性事实缺口。
 *
 * `factCategory` 是唯一可机械判定的挂钩：本次分析中不存在任何“已确认且未排除”
 * 该类事实时，缺口即未解决，相关内容不得支撑确定性单一主结论。
 */
export interface CaseFocusGapRecord {
  gapId: string;
  description: string;
  factCategory: FactCategory;
  /** 该缺口未解决时不能单一判断的分流方向。 */
  affectsDiversions: CaseFocusDiversion[];
  /** 该缺口未解决时的“若…则…”条件分支；至少一条。 */
  branches: CaseFocusGapBranchRecord[];
}

export type CaseFocusScenarioKind =
  | "typical"
  | "adjacent_boundary"
  | "decisive_gap"
  | "high_risk_boundary"
  | "source_invalidation";

/** 重点案情的确定性场景。`caseText` 必须是脱敏虚构文本。 */
export interface CaseFocusScenarioRecord {
  scenarioId: string;
  kind: CaseFocusScenarioKind;
  title: string;
  caseText: string;
  /** 期望解析出的重点案情 ID 集合；不应命中任何重点案情时为空数组。 */
  expectedCaseFocusIds: string[];
  /** 期望报告总体状态；`null` 表示只要求保守降级为不单一结论。 */
  expectedReportStatus: ReportStatus | null;
  /** 期望仍未解决的决定性事实缺口 ID。 */
  expectedUnresolvedGapIds: string[];
}

/** 派出所重点案情内容项。 */
export interface CaseFocusRecord {
  caseFocusId: string;
  version: string;
  contentStatus: ContentStatus;
  title: string;
  region: string;
  summary: string;
  match: CaseFocusMatchRuleRecord;
  /** 财产关系、占有状态、欺骗或隐瞒行为、主观状态、履约过程、资金流转、帮助行为、损失等要素的处理说明。 */
  elements: string[];
  diversionRules: CaseFocusDiversionRuleRecord[];
  neighbors: CaseFocusNeighborRecord[];
  gaps: CaseFocusGapRecord[];
  /** 高风险边界条件；仅提醒人工核验，不构成自动处置决定。 */
  highRiskBoundary: string[];
  sourceIds: string[];
  scenarios: CaseFocusScenarioRecord[];
  draftedAt: string;
  verifiedAt: string;
  publishedAt: string;
  lastVerifiedAt: string;
  nextReviewDueAt: string;
  maintainer: string;
  changeNote: string;
  sourceVerificationNote: string;
  testResults: ContentTestResult[];
  /** 撤回说明；无撤回时为 `null`，不得留含义不明的空值。 */
  withdrawalNote: string | null;
}

/** 内容源初始装载结果。 */
export interface GovernedContentSeed {
  sources: LegalSourceRecord[];
  examples: DocumentExampleRecord[];
  caseFocuses: CaseFocusRecord[];
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
