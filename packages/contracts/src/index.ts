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
