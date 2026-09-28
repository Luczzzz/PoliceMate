/**
 * PoliceMate 前后端共享契约。
 *
 * 该文件是 H5 与 PoliceMate 后端之间的显式契约边界：请求和响应都必须携带
 * `contractVersion`，版本不兼容时双方必须停止解析，不得猜测字段含义。
 */

/** 当前结构契约版本。不兼容变更必须提升该版本。 */
export const CONTRACT_VERSION = "1.0";

/** 产品外壳中的两个同级能力入口。 */
export type CapabilityId = "caseAnalysis" | "documentExamples";

/** 单个入口的可用状态。`reason` 仅在不可用时给出面向民警的说明。 */
export interface EntryAvailability {
  available: boolean;
  reason: string | null;
}

/** `GET /api/v1/shell` 响应：首页在外壳层读取的能力可用状态。 */
export interface ProductShellResponse {
  contractVersion: string;
  generatedAt: string;
  entries: Record<CapabilityId, EntryAvailability>;
}

/** 使用与数据说明页面的一个章节。 */
export interface DataUseSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets: string[];
}

/**
 * 部署相关的服务信息。受控试行前必须由部署方填写；未配置时以 `null` 暴露，
 * 页面必须如实显示“尚未配置”，不得编造服务主体或联系人。
 */
export interface DataUseServiceInfo {
  provider: string | null;
  contact: string | null;
  dataProcessingStatement: string | null;
  technicalLoggingBoundary: string[];
}

/** `GET /api/v1/data-use` 响应。 */
export interface DataUseResponse {
  contractVersion: string;
  title: string;
  sections: DataUseSection[];
  service: DataUseServiceInfo;
}

/** `GET /api/v1/health` 响应。 */
export interface HealthResponse {
  contractVersion: string;
  status: "ok";
  providerMode: string;
}

/** 面向用户的错误分类；不得泄露内部堆栈、服务拓扑或密钥。 */
export type ApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "service_unavailable"
  | "contract_incompatible"
  | "content_unavailable"
  | "internal_error";

export interface ApiErrorBody {
  contractVersion: string;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
}

/* ---------- 案情分析：候选事实与决定性追问 ---------- */

/** 案情分析后端状态机。H5 只依据这些显式状态推进，不解析自然语言。 */
export type AnalysisStage =
  | "confirming_facts"
  | "collecting_answers"
  | "ready_to_analyze"
  | "snapshot_confirmed"
  | "modifying_facts";

/** 事实状态。只有 `confirmed` 可以直接支撑主结论。 */
export type FactStatus = "candidate" | "confirmed" | "denied" | "unknown" | "disputed";

export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  candidate: "候选事实",
  confirmed: "已确认",
  denied: "已否认",
  unknown: "未知",
  disputed: "存在争议",
};

/** 事实类别目录。展示名称由后端/契约统一提供，页面不得自行拼写。 */
export type FactCategory =
  | "event"
  | "participant"
  | "behavior"
  | "object"
  | "time"
  | "place"
  | "amount"
  | "count"
  | "age"
  | "result"
  | "relationship"
  | "background"
  | "other";

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  event: "事件",
  participant: "人员",
  behavior: "行为",
  object: "财物物品",
  time: "时间",
  place: "地点",
  amount: "金额",
  count: "次数数量",
  age: "年龄",
  result: "结果后果",
  relationship: "人员关系",
  background: "背景信息",
  other: "其他事实",
};

/** 精确程度。模糊值必须同时保留原始表述、规范化范围与精确程度。 */
export type PrecisionLevel = "exact" | "approximate" | "bounded" | "open" | "unknown";

export const PRECISION_LABELS: Record<PrecisionLevel, string> = {
  exact: "精确值",
  approximate: "约值",
  bounded: "范围值",
  open: "不完整范围",
  unknown: "无法规范化",
};

/** 紧急风险类别。只有对应事实被民警确认后才可能触发报告前核验提示。 */
export type UrgentRiskCategory =
  | "personal_safety"
  | "medical"
  | "minor_protection"
  | "domestic_violence"
  | "evidence_loss";

export const URGENT_RISK_LABELS: Record<UrgentRiskCategory, string> = {
  personal_safety: "人身安全",
  medical: "医疗救助",
  minor_protection: "未成年人保护",
  domestic_violence: "家庭暴力",
  evidence_loss: "证据灭失",
};

/** 模糊值的结构化表达：原值 + 规范化范围 + 精确程度。 */
export interface FactValue {
  /** 原始表述（用户原文片段）。 */
  raw: string;
  /** 规范化范围下界；开放范围时为 `null`。展示用字符串，不是日期对象。 */
  normalizedMin: string | null;
  /** 规范化范围上界；开放范围时为 `null`。 */
  normalizedMax: string | null;
  precision: PrecisionLevel;
  precisionLabel: string;
  unit: string | null;
}

/**
 * 候选事实。系统不默认确认任何事实；删除（排除）只表示不纳入本次分析，
 * 不代表确认其没有发生。
 */
export interface CandidateFact {
  factId: string;
  category: FactCategory;
  categoryLabel: string;
  /** 面向民警的中性结构化陈述。 */
  statement: string;
  /** 原始表述或对应原文片段，便于发现提取偏差。 */
  originalWording: string;
  value: FactValue | null;
  /** 关联事件 ID（如“事件一”）。 */
  eventRefs: string[];
  /** 关联参与者（中性代号：人员甲、报案人等）。 */
  participantRefs: string[];
  /** 关联行为 ID（如“行为一”）。 */
  behaviorRefs: string[];
  status: FactStatus;
  statusLabel: string;
  /** 来源轮次：0 = 初始提取；>0 = 第 n 轮追问补充；民警新增为 null。 */
  sourceRound: number | null;
  /** 确认方式；未确认时为 `null`。 */
  confirmationMethod: "officer" | "officer_added" | null;
  confirmedAt: string | null;
  /** 紧急风险类别标记；仅提取/回答时打标，触发提示仍以确认状态为准。 */
  riskCategory: UrgentRiskCategory | null;
  /** 是否已被排除（不纳入本次分析）。 */
  excluded: boolean;
  /** 被本事实替代的旧事实项 ID；本事实不是替代项时为 `null`。 */
  replacesFactId: string | null;
  /** 替代本事实的较新事实项 ID；本事实未被替代时为 `null`。 */
  supersededByFactId: string | null;
}

/** 决定性追问主题，对应锁定的选择优先级。 */
export type QuestionTopic =
  | "urgent_safety"
  | "path_split"
  | "core_classification"
  | "filing_conditions"
  | "evidence_preservation"
  | "detail";

export const QUESTION_TOPIC_LABELS: Record<QuestionTopic, string> = {
  urgent_safety: "紧急安全核实",
  path_split: "案件分流",
  core_classification: "核心定性",
  filing_conditions: "受立案条件",
  evidence_preservation: "证据固定",
  detail: "报告细节",
};

/**
 * 决定性追问。每题说明为什么需要确认，允许“不知道、尚未核实、存在争议”。
 * `kind: neutral_safety` 表示仅由未经确认的关键词触发的中性安全问题，
 * 不构成已认定的紧急风险。
 */
export interface DecisiveQuestion {
  questionId: string;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topic: QuestionTopic;
  topicLabel: string;
  text: string;
  whyItMatters: string;
  kind: "standard" | "neutral_safety";
  relatedFactIds: string[];
  answerMaxLength: number;
  /** 文本回答将形成的补充事实类别。 */
  answerCategory: FactCategory;
  /** 所属轮次（1 起）。 */
  round: number;
  /** 轮内展示顺序（1 起）。 */
  orderInRound: number;
}

export type DecisiveAnswerKind = "value" | "unknown" | "not_verified" | "disputed";

export const DECISIVE_ANSWER_KIND_LABELS: Record<DecisiveAnswerKind, string> = {
  value: "补充说明",
  unknown: "不知道",
  not_verified: "尚未核实",
  disputed: "存在争议",
};

export interface DecisiveAnswer {
  questionId: string;
  kind: DecisiveAnswerKind;
  /** `kind: value` 时的自由文本，≤2,000 字符；其余为 `null`。 */
  text: string | null;
}

export interface AnswerRecord {
  questionId: string;
  round: number;
  questionText: string;
  topic: QuestionTopic;
  topicLabel: string;
  kind: DecisiveAnswerKind;
  kindLabel: string;
  text: string | null;
  answeredAt: string;
}

/** 报告前紧急核验提示。只由已确认的紧急风险事实触发。 */
export interface UrgentRiskPrompt {
  promptId: string;
  category: UrgentRiskCategory;
  categoryLabel: string;
  triggeringFactIds: string[];
  /** 触发它的已确认事实（原始表述）。 */
  triggeringStatements: string[];
  /** 需要民警立即人工核验的事项。 */
  humanChecks: string[];
  /** 固定边界说明：不构成自动处置或紧急状态认定。 */
  boundaryStatement: string;
}

/** 剩余决定性事实缺口。 */
export interface AnalysisGap {
  gapId: string;
  topic: QuestionTopic;
  topicLabel: string;
  description: string;
  sourceQuestionIds: string[];
}

/** 不可变事实快照。用户在分析前确认页主动确认后形成。 */
export interface FactSnapshot {
  snapshotVersion: number;
  snapshotHash: string;
  confirmedAt: string;
}

/**
 * 待确认的事实修改。民警从报告进入补充或修改事实时创建；
 * 在确认新事实快照前，旧报告仍然可见并必须显示“修改尚未应用”。
 */
export interface PendingFactModification {
  /** 修改所基于的快照版本。 */
  baseSnapshotVersion: number;
  /** 修改所基于的快照哈希。 */
  baseSnapshotHash: string;
  startedAt: string;
}

/* ---------- 六模块分析报告 ---------- */

export type ReportStatus =
  | "complete"
  | "insufficient_facts"
  | "conflicting"
  | "basis_unavailable"
  | "generation_failed"
  | "partial_failure";

export type ReportModuleStatus =
  | "present"
  | "not_applicable"
  | "insufficient_facts"
  | "basis_unavailable"
  | "conflicting"
  | "generation_failed";

export type ReportModuleId =
  | "preliminary_qualification"
  | "filing_conditions"
  | "evidence_checklist"
  | "interview_points"
  | "enforcement_risks"
  | "legal_basis_trace";

export const REPORT_MODULE_LABELS: Record<ReportModuleId, string> = {
  preliminary_qualification: "初步定性分析",
  filing_conditions: "受立案条件分析",
  evidence_checklist: "核心证据核查清单",
  interview_points: "分角色询问要点",
  enforcement_risks: "执法风险提示",
  legal_basis_trace: "法律依据与可解释链路",
};

export interface ReportFactReference {
  factId: string;
  statement: string;
  status: FactStatus;
}

export interface ReportLegalBasis {
  sourceId: string;
  version: string;
  title: string;
  issuingAuthority: string;
  documentNumber: string;
  article: string;
  minimalText: string;
  status: LegalSourceStatus;
  region: string;
  publishedAt: string;
  lastVerifiedAt: string;
  retrievedAt: string;
  officialUrl: string | null;
}

export interface ReportTraceLink {
  factIds: string[];
  condition: string;
  conditionStatus: "satisfied" | "not_satisfied" | "unknown" | "conflicting";
  judgment: string;
  basis: ReportLegalBasis | null;
  basisKind: "formal_basis" | "practical_check";
}

/** 证据核查清单的优先级；展示名称由后端目录提供。 */
export type EvidencePriority = "high" | "medium" | "low";

export const EVIDENCE_PRIORITY_LABELS: Record<EvidencePriority, string> = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

/** 证据当前掌握状态；这是报告结构化内容，不是临时标记。 */
export type EvidenceHoldingStatus = "held" | "partial" | "not_held" | "unknown";

export const EVIDENCE_HOLDING_STATUS_LABELS: Record<EvidenceHoldingStatus, string> = {
  held: "已掌握",
  partial: "部分掌握",
  not_held: "尚未掌握",
  unknown: "情况不明",
};

/** 核心证据核查清单中的一条结构化项目。 */
export interface ReportEvidenceChecklistItem {
  /** 批次内稳定项目 ID，用于临时标记；不写入事实或 Dify 请求。 */
  itemId: string;
  text: string;
  purpose: string | null;
  sourceHint: string | null;
  preservationRisk: string | null;
  priority: EvidencePriority;
  priorityLabel: string;
  holdingStatus: EvidenceHoldingStatus;
  holdingStatusLabel: string;
}

/** 分角色询问要点中的一条结构化项目。 */
export interface ReportInterviewPointItem {
  itemId: string;
  text: string;
  /** 询问对象角色的稳定 ID；展示名称由 `roleLabel` 提供。 */
  role: string;
  roleLabel: string;
  topic: string | null;
}

export interface ReportModule {
  id: ReportModuleId;
  label: string;
  status: ReportModuleStatus;
  summary: string | null;
  items: string[];
  traceLinks: ReportTraceLink[];
  failureReason: string | null;
  /** 仅“核心证据核查清单”使用的结构化项目；其余模块为空数组。 */
  evidenceItems: ReportEvidenceChecklistItem[];
  /** 仅“分角色询问要点”使用的结构化项目；其余模块为空数组。 */
  interviewItems: ReportInterviewPointItem[];
}

export interface ReportParticipantBehaviorSummary {
  participant: string;
  behavior: string;
  factIds: string[];
  note: string;
}

/**
 * 报告中的文书任务。只携带程序类别、办理阶段、适用对象与案情标签等结构化条件，
 * 用于筛选候选文书范例；不携带任何案情事实，不使用结论性表达。
 */
export interface ReportDocumentTask {
  taskId: string;
  title: string;
  description: string;
  procedureCategory: ProcedureCategory;
  procedureCategoryLabel: string;
  stageId: HandlingStageId;
  stageLabel: string;
  applicableRoles: string[];
  caseTags: string[];
  /** 固定非结论性边界说明。 */
  boundaryStatement: string;
}

/** 文书任务候选跳转的常驻说明：不自动选择唯一范例，不代入案情事实。 */
export const REPORT_DOCUMENT_TASK_BOUNDARY =
  "以下为可能适用的候选范例，不代表必须制作；请核对差异和选择前需核验条件后自行判断。";

export interface AnalysisReport {
  contractVersion: string;
  requestId: string;
  generatedAt: string;
  sessionId: string;
  status: ReportStatus;
  statusLabel: string;
  headline: string;
  participantBehaviorSummary: ReportParticipantBehaviorSummary[];
  factLimitations: string[];
  snapshotVersion: number;
  snapshotHash: string;
  contentReleaseId: string;
  workflowVersion: string;
  modules: ReportModule[];
  documentTasks: ReportDocumentTask[];
}

export interface GenerateReportRequest {
  contractVersion: string;
  requestId: string;
  snapshotVersion: number;
  snapshotHash: string;
}

export interface ReportFailureControls {
  reportMode?: "complete" | "insufficient_facts" | "conflicting" | "basis_unavailable" | "critical_failure" | "partial_failure" | "contradiction";
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  complete: "初步意见—待核验",
  insufficient_facts: "条件不足—需补充事实",
  conflicting: "存在多种可能—不可单一判断",
  basis_unavailable: "依据不可用—停止形成主判断",
  generation_failed: "报告生成失败—未展示未经校验内容",
  partial_failure: "部分模块失败—仅展示已校验内容",
};

/** 独立事项检测结果。系统提示拆分分析，不把独立事项合并为一个连续案情。 */
export interface IndependentMatters {
  detected: boolean;
  note: string | null;
}

/** `GET /api/v1/analysis/sessions/:sessionId` 等接口返回的完整分析状态。 */
export interface AnalysisSessionState {
  contractVersion: string;
  generatedAt: string;
  sessionId: string;
  stage: AnalysisStage;
  stageLabel: string;
  /** 当前案情字符数（非内容本身）。 */
  caseCharacterCount: number;
  facts: CandidateFact[];
  /** 本轮待回答的决定性问题；无进行中轮次时为空数组。 */
  questions: DecisiveQuestion[];
  answers: AnswerRecord[];
  roundsCompleted: number;
  /** 体验上限：最多三轮、每轮五问、总计十二问。 */
  roundLimit: number;
  perRoundLimit: number;
  totalQuestionLimit: number;
  /** 追问是否已经结束（到达上限或没有剩余缺口）。 */
  followUpEnded: boolean;
  endReason: "limits_reached" | "no_gaps" | null;
  gaps: AnalysisGap[];
  urgentPrompts: UrgentRiskPrompt[];
  /** 预期限制说明（预期报告状态），由后端结构化计算。 */
  expectedStatusNote: string | null;
  independentMatters: IndependentMatters;
  snapshot: FactSnapshot | null;
  /** 当前是否有尚未应用的事实修改；有值时旧报告必须显示“修改尚未应用”。 */
  modification: PendingFactModification | null;
}

export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  confirming_facts: "候选事实确认",
  collecting_answers: "决定性追问",
  ready_to_analyze: "分析前确认",
  snapshot_confirmed: "事实快照已确认",
  modifying_facts: "补充或修改事实",
};

/** 体验上限常量：最多三轮、每轮五问、总计十二问。 */
export const ANALYSIS_ROUND_LIMIT = 3;
export const ANALYSIS_PER_ROUND_LIMIT = 5;
export const ANALYSIS_TOTAL_QUESTION_LIMIT = 12;

/** 案情输入与追问答案的锁定上限。 */
export const CASE_TEXT_MAX_CHARACTERS = 10_000;
export const ANSWER_MAX_CHARACTERS = 2_000;

/** `POST /api/v1/analysis/sessions` 请求。 */
export interface CreateAnalysisRequest {
  caseText: string;
}

/** `POST …/facts/:factId/status` 请求。 */
export interface FactStatusUpdateRequest {
  status: Exclude<FactStatus, "candidate">;
}

/** `POST …/facts` 请求：新增系统未提取出的遗漏事实。 */
export interface AddFactRequest {
  statement: string;
}

/**
 * `POST …/facts/:factId/revision` 请求：在“补充或修改事实”阶段创建替代事实项。
 *
 * - `replace`：新版本替代旧版本，旧版本退出本次分析；
 * - `dispute`：两个版本都不能排除，两个版本都被记录为争议事实，
 *   由系统保留分支而不是静默选择其中一个。
 */
export interface ReviseFactRequest {
  statement: string;
  resolution: "replace" | "dispute";
}

/** `POST …/rounds` 请求。开始追问时 `answers` 为空数组；提交本轮回答时必填。 */
export interface AdvanceRoundRequest {
  answers: DecisiveAnswer[];
}

/* ---------- 受治理文书范例 ---------- */

/** 法源效力状态；与内容状态严格分离。 */
export type LegalSourceStatus = "current" | "future" | "superseded" | "repealed" | "uncertain";

/** 受治理内容项状态。第一版不存在 `approved`，只有 `trial` 可进入生产检索。 */
export type ContentStatus = "draft" | "pending_verification" | "trial" | "withdrawn";

/** 程序类别。 */
export type ProcedureCategory = "administrative" | "criminal";

/** 第一版固定的六个办理阶段。顺序即展示顺序，不得增删或改变含义。 */
export type HandlingStageId =
  | "reception_acceptance"
  | "investigation_evidence"
  | "measures_approval"
  | "notification_service"
  | "decision_disposition"
  | "execution_closure";

/** 办理阶段展示目录项。展示名称必须来自后端，页面不得自行拼写。 */
export interface HandlingStageCatalogEntry {
  id: HandlingStageId;
  label: string;
  order: number;
}

/** 法源中的条款定位与最小必要原文。 */
export interface LegalSourceArticle {
  location: string;
  minimalText: string;
}

/** 详情页可展示的法源依据。 */
export interface LegalSourceReference {
  sourceId: string;
  version: string;
  title: string;
  issuingAuthority: string;
  documentNumber: string;
  authorityLevel: string;
  region: string;
  status: LegalSourceStatus;
  statusLabel: string;
  publishedAt: string;
  effectiveAt: string | null;
  /** 只有通过后端校验的官方链接可以点击；无链接时为 `null`。 */
  officialUrl: string | null;
  retrievedAt: string;
  lastVerifiedAt: string;
  nextReviewDueAt: string;
  maintainer: string;
  articles: LegalSourceArticle[];
}

/** 文书范例详情页必须常驻的辅助定位说明。 */
export interface DocumentExampleNotice {
  auxiliaryReference: string;
  notFormalTemplate: string;
  mustNotIssue: string;
  fictionalData: string;
}

/** 列表与检索结果中的文书范例变体。 */
export interface DocumentExampleVariantSummary {
  exampleId: string;
  version: string;
  contentStatus: ContentStatus;
  contentStatusLabel: string;
  formalName: string;
  aliases: string[];
  procedureCategory: ProcedureCategory;
  procedureCategoryLabel: string;
  stageId: HandlingStageId;
  stageLabel: string;
  documentTypeId: string;
  documentTypeName: string;
  caseTags: string[];
  applicableRoles: string[];
  releaseId: string;
  sourceIds: string[];
  lastVerifiedAt: string;
  nextReviewDueAt: string;
}

/** 与相邻变体的区别说明；只包含当前批次中仍可展示的相邻变体。 */
export interface DocumentExampleNeighbor {
  exampleId: string;
  formalName: string;
  difference: string;
}

/** 结构分段及每段目的。 */
export interface DocumentExampleStructureSection {
  heading: string;
  purpose: string;
}

/** 分段注释式虚构示例。 */
export interface DocumentExampleAnnotatedPart {
  heading: string;
  fictionalText: string;
  annotations: string[];
}

/** 治理信息：版本、核验时间、批次与变更来源。 */
export interface DocumentExampleGovernance {
  maintainer: string;
  draftedAt: string;
  verifiedAt: string;
  publishedAt: string;
  lastVerifiedAt: string;
  nextReviewDueAt: string;
  releaseId: string;
  changeNote: string;
  sourceVerificationNote: string;
}

/** 文书范例详情。 */
export interface DocumentExampleVariantDetail extends DocumentExampleVariantSummary {
  applicableScenarios: string[];
  exclusions: string[];
  prerequisites: string[];
  preflightChecks: string[];
  neighboringVariants: DocumentExampleNeighbor[];
  structure: DocumentExampleStructureSection[];
  annotatedExample: DocumentExampleAnnotatedPart[];
  productionPoints: string[];
  commonErrors: string[];
  riskNotes: string[];
  formatSource: string | null;
  legalSources: LegalSourceReference[];
  governance: DocumentExampleGovernance;
}

/** 启用筛选时显示的选项与计数。 */
export interface DocumentExampleFacetOption {
  id: string;
  label: string;
  count: number;
}

export interface DocumentExampleFacets {
  procedureCategories: DocumentExampleFacetOption[];
  stages: DocumentExampleFacetOption[];
  documentTypes: DocumentExampleFacetOption[];
}

/** `GET /api/v1/document-examples` 响应：当前激活批次中通过状态门控的索引。 */
export interface DocumentExampleListResponse {
  contractVersion: string;
  generatedAt: string;
  releaseId: string;
  notice: DocumentExampleNotice;
  stages: HandlingStageCatalogEntry[];
  items: DocumentExampleVariantSummary[];
  facets: DocumentExampleFacets;
}

/** `GET /api/v1/document-examples/:exampleId` 响应。 */
export interface DocumentExampleDetailResponse {
  contractVersion: string;
  generatedAt: string;
  releaseId: string;
  notice: DocumentExampleNotice;
  example: DocumentExampleVariantDetail;
}

/** 文书任务候选筛选请求：只使用结构化办案条件。 */
export interface DocumentTaskCandidateRequest {
  contractVersion: string;
  procedureCategory: ProcedureCategory;
  stageId: HandlingStageId;
  applicableRoles: string[];
  caseTags: string[];
}

/** 文书任务候选范例。 */
export interface DocumentTaskCandidate {
  exampleId: string;
  formalName: string;
  documentTypeName: string;
  procedureCategoryLabel: string;
  stageLabel: string;
  contentStatusLabel: string;
  applicableRoles: string[];
  caseTags: string[];
  /** 与同批次其他候选的差异说明。 */
  difference: string;
  /** 选择前需核验的条件。 */
  preflightChecks: string[];
}

/** `POST /api/v1/document-examples/task-candidates` 响应。 */
export interface DocumentTaskCandidatesResponse {
  contractVersion: string;
  generatedAt: string;
  releaseId: string;
  notice: DocumentExampleNotice;
  /** 固定非结论性说明。 */
  selectionBoundary: string;
  candidates: DocumentTaskCandidate[];
}

/** 测试控制：修改单个范例的内容状态。 */
export interface FixtureExampleStatusPatch {
  exampleId: string;
  status: ContentStatus;
}

/**
 * 确定性替身控制请求。仅在启用测试控制（`PM_ENABLE_TEST_CONTROLS=1`）时挂载，
 * 用于浏览器黑盒测试替换外部 Dify 与受治理内容边界。
 */
export interface FixtureControlRequest {
  difyAvailable?: boolean;
  reportMode?: ReportFailureControls["reportMode"];
  /** 测试控制：重置全部文书范例的内容状态。 */
  exampleStatusAll?: ContentStatus;
  /** 测试控制：修改指定文书范例的内容状态，用于验证单项下架与旧链接阻断。 */
  exampleStatus?: FixtureExampleStatusPatch;
  /** 测试控制：重置全部测试法源的效力状态。 */
  legalSourceStatusAll?: LegalSourceStatus;
  /** 测试控制：使全部文书范例的复核期限变为已过期。 */
  examplesExpired?: boolean;
}

/** 替身中单个测试范例的可观测治理状态；`eligible` 由状态门控实时推导。 */
export interface FixtureExampleState {
  exampleId: string;
  contentStatus: ContentStatus;
  eligible: boolean;
}

/** 替身中单个测试法源的可观测状态。 */
export interface FixtureLegalSourceState {
  sourceId: string;
  status: LegalSourceStatus;
}

/** 替身当前可观测状态。`eligibleExampleCount` 由治理门控实时推导，不可直接设置。 */
export interface FixtureControlResponse {
  difyAvailable: boolean;
  activeReleaseId: string;
  eligibleExampleCount: number;
  examples: FixtureExampleState[];
  legalSources: FixtureLegalSourceState[];
}
