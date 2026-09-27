import type {
  ContentStatus,
  DocumentExampleNotice,
  HandlingStageCatalogEntry,
  LegalSourceStatus,
  ProcedureCategory,
} from "@policymate/contracts";

/**
 * 受治理内容的固定展示目录。
 *
 * 办理阶段、程序类别和状态文案由后端提供，页面不得自行拼写或增删，
 * 以免展示名称与治理模型漂移。
 */

export const HANDLING_STAGE_CATALOG: readonly HandlingStageCatalogEntry[] = [
  { id: "reception_acceptance", label: "接报与受理", order: 1 },
  { id: "investigation_evidence", label: "调查取证", order: 2 },
  { id: "measures_approval", label: "措施与审批", order: 3 },
  { id: "notification_service", label: "告知与送达", order: 4 },
  { id: "decision_disposition", label: "处理决定", order: 5 },
  { id: "execution_closure", label: "执行与结案", order: 6 },
];

const STAGE_LABELS = new Map(HANDLING_STAGE_CATALOG.map((stage) => [stage.id, stage.label]));

export function handlingStageLabel(stageId: HandlingStageCatalogEntry["id"]): string {
  return STAGE_LABELS.get(stageId) ?? stageId;
}

export const PROCEDURE_CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  administrative: "行政程序",
  criminal: "刑事程序",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "草稿",
  pending_verification: "待核验",
  trial: "试行辅助内容",
  withdrawn: "已下架",
};

export const LEGAL_SOURCE_STATUS_LABELS: Record<LegalSourceStatus, string> = {
  current: "现行有效",
  future: "尚未生效",
  superseded: "已被替代",
  repealed: "已废止",
  uncertain: "效力不明",
};

/** 文书范例详情页与列表页必须常驻的定位说明。 */
export const DOCUMENT_EXAMPLE_NOTICE: DocumentExampleNotice = {
  auxiliaryReference: "辅助参考—未经过正式内容审定，请结合现行规范和正式案卷核验",
  notFormalTemplate: "不是正式文书模板",
  mustNotIssue: "不得直接制发，应结合正式办案系统、现行规范和具体案情核验",
  fictionalData: "示例人物、地址、号码、时间和金额均为虚构",
};
