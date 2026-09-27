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
  | "internal_error";

export interface ApiErrorBody {
  contractVersion: string;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
}

/**
 * 确定性替身控制请求。仅在启用测试控制（`PM_ENABLE_TEST_CONTROLS=1`）时挂载，
 * 用于浏览器黑盒测试替换外部 Dify 与受治理内容边界。
 */
export interface FixtureControlRequest {
  difyAvailable?: boolean;
  eligibleExampleCount?: number;
}

export interface FixtureControlResponse {
  difyAvailable: boolean;
  eligibleExampleCount: number;
}
