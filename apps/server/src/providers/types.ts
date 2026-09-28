import type {
  AnalysisReport,
  CandidateFact,
  DecisiveAnswerKind,
  DocumentExampleFacets,
  DocumentExampleNotice,
  DocumentExampleVariantDetail,
  DocumentExampleVariantSummary,
  FactCategory,
  HandlingStageCatalogEntry,
  IndependentMatters,
  QuestionTopic,
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
 * 提取结果：确定性候选事实列表与独立事项提示。
 * 替身实现必须稳定；后端会在结构校验失败时整体失败关闭。
 */
export interface CaseExtractionResult {
  facts: CandidateFact[];
  independentMatters: IndependentMatters;
}

/** 决定性追问选题请求：后端传入完整结构化状态，而不是对话历史。 */
export interface QuestionPoolRequest {
  facts: CandidateFact[];
  answers: AnsweredQuestionSummary[];
  askedQuestionIds: string[];
  maxQuestions: number;
}

/** 已回答问题的结构化摘要（追问边界只需要这些字段）。 */
export interface AnsweredQuestionSummary {
  questionId: string;
  topic: QuestionTopic;
  kind: DecisiveAnswerKind;
}

/** 候选问题。后端负责按优先级截断到体验上限。 */
export interface ProposedQuestion {
  questionId: string;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topic: QuestionTopic;
  text: string;
  whyItMatters: string;
  kind: "standard" | "neutral_safety";
  relatedFactIds: string[];
  /** 文本回答将形成的补充事实类别。 */
  answerCategory: FactCategory;
}

export interface QuestionPoolResult {
  questions: ProposedQuestion[];
}

export interface ReportGenerationRequest {
  facts: CandidateFact[];
  snapshot: FactSnapshot;
  legalSources: LegalSourceReference[];
  mode?: string;
}

export interface ReportGenerationResult {
  status: ReportStatus;
  headline: string;
  participantBehaviorSummary: AnalysisReport["participantBehaviorSummary"];
  factLimitations: string[];
  modules: ReportModule[];
  contentReleaseId: string;
  workflowVersion: string;
}

/**
 * 案情分析边界：候选事实提取与决定性追问选题。
 * 真实 Dify 接入时替换实现；契约结构不变，后端仍然负责校验与状态机。
 */
export interface CaseAnalysisProvider {
  extractCaseFacts(request: CaseExtractionRequest): Promise<CaseExtractionResult>;
  proposeDecisiveQuestions(request: QuestionPoolRequest): Promise<QuestionPoolResult>;
  generateReport?(request: ReportGenerationRequest): Promise<ReportGenerationResult>;
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

/** 受治理内容读取边界。所有读取都必须经过当前状态门控。 */
export interface GovernedContentProvider {
  getActiveRelease(): Promise<GovernedContentRelease>;
  listExamples(): Promise<GovernedContentExampleIndex>;
  getExample(exampleId: string): Promise<GovernedContentExampleLookup>;
  listLegalSources?(): Promise<LegalSourceReference[]>;
}

export interface Providers {
  dify: DifyProvider;
  analysis: CaseAnalysisProvider;
  content: GovernedContentProvider;
}
