import type {
  AnalysisReport,
  CandidateFact,
  DocumentExampleFacets,
  DocumentExampleNotice,
  DocumentExampleVariantDetail,
  DocumentExampleVariantSummary,
  DocumentTaskCandidateRequest,
  DocumentTaskCandidate,
  GapBranch,
  HandlingStageCatalogEntry,
  ReportDocumentTask,
  ReportEvidenceChecklistItem,
  ReportInterviewPointItem,
  ReportModuleId,
  ReportModuleStatus,
  ReportTraceLink,
  UrgentRiskCategory,
  FactSnapshot,
  LegalSourceReference,
  ReportModule,
  ReportStatus,
} from "@policymate/contracts";

/**
 * 外部边界提供者接口。
 *
 * 浏览器黑盒测试只在 Dify 与受治理内容两个外部边界使用确定性替身，
 * 其余产品状态机、校验、隐私和失败处理保持在同一个可观测缝内。
 */

/** 后端对一个外部服务可用性的判断。 */
export interface ServiceAvailability {
  available: boolean;
  /** 面向民警的不可用原因；可用时为 `null`。 */
  reason: string | null;
}

/**
 * Dify 集成适配层的可用性边界。后续切片在此之上增加结构化结果契约。
 */
export interface DifyProvider {
  getAvailability(): Promise<ServiceAvailability>;
}

/* ---------- 案情分析外部边界 ---------- */

/** 自由案情提取请求。 */
export interface CaseExtractionRequest {
  caseText: string;
}

/**
 * 一份连续案情的提取结果。输入含互不相关事项时边界返回多个分组，
 * 每个分组形成一份独立分析（独立会话标识与独立事实快照）。
 * 同一事实的不同说法共享 `disputeGroupId`，读取方必须并列展示、不得择一。
 */
export interface CaseExtractionMatter {
  matterId: string;
  label: string;
  facts: CandidateFact[];
}

/**
 * 提取结果：按连续案情拆出的一个或多个事项分组。
 * 替身实现必须稳定；后端会在结构校验失败时整体失败关闭。
 */
export interface CaseExtractionResult {
  matters: CaseExtractionMatter[];
}

/** 报告生成请求。 */
export interface ReportGenerationRequest {
  facts: CandidateFact[];
  snapshot: FactSnapshot;
  legalSources: LegalSourceReference[];
  /** 后端从受治理内容解析出的重点案情与缺口，不由模型自行选择。 */
  caseFocusId?: string | null;
  /** 本次报告请求编号；用于把上游输出绑定回具体请求。 */
  requestId?: string;
  unresolvedGapIds?: string[];
  gapBranches?: GapBranch[];
  alternativeDirections?: string[];
  contentReleaseId?: string;
  mode?: string;
}

export interface ReportGenerationResult {
  status: ReportStatus;
  headline: string;
  /** @maxItems 6 */
  participantBehaviorSummary: AnalysisReport["participantBehaviorSummary"];
  /** @maxItems 5 */
  factLimitations: string[];
  modules: ReportModule[];
  /** @maxItems 5 */
  documentTasks: ReportDocumentTask[];
  contentReleaseId: string;
  workflowVersion: string;
  /** 研判速览（ADR-0011）；缺省表示上游未提供，不补造。 */
  quickBrief?: AnalysisReport["quickBrief"];
}

/** 草稿中的法条引用：只给法源与条号，其余字段由后端从受治理法源补全（ADR-0013）。 */
export interface ReportDraftBasis {
  sourceId: string;
  article: string;
}

export interface ReportDraftTraceLink extends Pick<ReportTraceLink, "factIds" | "condition" | "conditionStatus" | "judgment" | "basisKind"> {
  basis: ReportDraftBasis | null;
}

export interface ReportDraftModule {
  id: ReportModuleId;
  status: ReportModuleStatus;
  summary: string | null;
  /** @maxItems 6 */
  items: string[];
  /** @maxItems 4 */
  traceLinks: ReportDraftTraceLink[];
  failureReason: string | null;
  /** @maxItems 8 */
  evidenceItems: Array<Omit<ReportEvidenceChecklistItem, "priorityLabel" | "holdingStatusLabel">>;
  /** @maxItems 12 */
  interviewItems: ReportInterviewPointItem[];
}

/**
 * 模型实际输出的报告草稿（ADR-0013）：只含判断性文字与标识。
 * 展示标签、法条原文与元数据、文书固定字段、封装元数据由后端补全为 `ReportGenerationResult`。
 */
export interface ReportDraft {
  status: ReportStatus;
  headline: string;
  /** @maxItems 6 */
  participantBehaviorSummary: AnalysisReport["participantBehaviorSummary"];
  /** @maxItems 5 */
  factLimitations: string[];
  modules: ReportDraftModule[];
  /** @maxItems 5 */
  documentTasks: Array<Omit<ReportDocumentTask, "procedureCategoryLabel" | "stageLabel" | "boundaryStatement">>;
  /** 研判速览（ADR-0011）。 */
  quickBrief?: AnalysisReport["quickBrief"];
}

/**
 * 案情分析边界：候选事实提取与报告生成。
 * 真实 Dify 接入时替换实现；契约结构不变，后端仍然负责校验与状态机。
 */
export interface CaseAnalysisProvider {
  extractCaseFacts(request: CaseExtractionRequest, signal?: AbortSignal): Promise<CaseExtractionResult>;
  generateReport?(request: ReportGenerationRequest, signal?: AbortSignal): Promise<ReportGenerationResult>;
}

/** Dify 输出封装；提取不依赖快照，相关字段必须为 null。 */
export interface DifyOutputMetadata {
  contractVersion: "1.0";
  promptVersion: "actionable-analysis-v3";
  workflowVersion: string;
  requestId: string;
  snapshotVersion: number | null;
  snapshotHash: string | null;
  contentReleaseId: string | null;
}

export interface DifyExtractionOutput extends DifyOutputMetadata {
  result: CaseExtractionResult;
}

export interface DifyReportOutput extends DifyOutputMetadata {
  result: ReportDraft;
}

/** 当前激活的不可变内容发布批次摘要。 */
export interface GovernedContentRelease {
  releaseId: string;
  /** 当前批次中通过治理门槛、可用于生产的文书范例变体数量。 */
  eligibleExampleCount: number;
}

/** 当前批次中通过状态门控的文书范例索引。 */
export interface GovernedContentExampleIndex {
  releaseId: string;
  notice: DocumentExampleNotice;
  stages: HandlingStageCatalogEntry[];
  items: DocumentExampleVariantSummary[];
  facets: DocumentExampleFacets;
}

/**
 * 详情查询结果。失效标识返回 `unavailable`，未知标识返回 `not_found`；
 * 两者都必须与“可展示正文”严格区分。
 */
export type GovernedContentExampleLookup =
  | {
      outcome: "found";
      releaseId: string;
      notice: DocumentExampleNotice;
      example: DocumentExampleVariantDetail;
    }
  | { outcome: "unavailable" }
  | { outcome: "not_found" };

/**
 * 重点案情解析结果。
 *
 * 未命中任何重点案情时 `caseFocusId` 为 `null`，由调用方回退到通用法源；
 * 命中但不可用时空法源，迫使报告保守降级为“依据不可用”。
 */
export interface CaseFocusResolution {
  /** 当前已确认事实命中的全部重点案情 ID（含不可用的重点案情）。 */
  matchedCaseFocusIds: string[];
  caseFocusId: string | null;
  caseFocusVersion: string | null;
  caseFocusTitle: string | null;
  /** 主命中重点案情当前是否可用；不可用时其内容立即停止支撑主结论。 */
  caseFocusEligible: boolean;
  /** 不能排除的相邻重点案情标题。 */
  unresolvedAlternatives: string[];
  /** 不能排除的相邻重点案情 ID，用于可解释链路。 */
  unresolvedAlternativeIds: string[];
  /** 未解决、且会影响分流的决定性事实缺口说明。 */
  unresolvedGapNotes: string[];
  /** 未解决的决定性事实缺口 ID。 */
  unresolvedGapIds: string[];
  /** 未解决缺口的“若…则…”条件分支与程序路径。 */
  unresolvedGapBranches: GapBranch[];
  /** 本次可用的受治理法源；命中但不可用或未命中时为空数组。 */
  legalSources: LegalSourceReference[];
}

/** 受治理内容读取边界。所有读取都必须经过当前状态门控。 */
export interface GovernedContentProvider {
  getActiveRelease(): Promise<GovernedContentRelease>;
  listExamples(): Promise<GovernedContentExampleIndex>;
  getExample(exampleId: string): Promise<GovernedContentExampleLookup>;
  listLegalSources?(): Promise<LegalSourceReference[]>;
  /** 只依据结构化办案条件筛选候选范例；不接收案情事实。 */
  listTaskCandidates?(request: DocumentTaskCandidateRequest): Promise<DocumentTaskCandidate[]>;
  /**
   * 把已确认事实解析到受治理重点案情，并返回本次可用的法源。
   * 只依据行为标签与原始表述线索匹配，不解析模型生成的自然语言结论。
   */
  resolveCaseFocus?(facts: CandidateFact[], now?: Date): Promise<CaseFocusResolution>;
}

export interface Providers {
  dify: DifyProvider;
  analysis: CaseAnalysisProvider;
  content: GovernedContentProvider;
}
