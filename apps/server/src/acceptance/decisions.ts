/**
 * 受控试行的两类角色记录。
 *
 * 产品规格 13.1、18.1 要求内容维护者的“内容批次确认”和产品负责人的
 * “试行发布决定”分别记录，且都不得表述为法制审核、正式审定或机关授权。
 * 这里只保存记录结构与边界校验；它不是机关授权文件，也不替代人工签批。
 */

export type TrialDecisionId = "content-batch-confirmation" | "trial-release-decision";

export interface TrialDecisionRecord {
  id: TrialDecisionId;
  /** 记录角色，不是真人身份信息。 */
  role: string;
  /** 记录范围：批次 ID 或受控试行整体。 */
  scope: string;
  recordedAt: string;
  /** 记录内容：确认了什么、决定了什么。 */
  statement: string;
  /** 固定边界声明，必须明确不等于正式审定或机关授权。 */
  boundary: string;
  /** 追溯引用：批次 ID、验收结果 ID 等非内容标识。 */
  references: string[];
}

/** 固定的非授权边界声明。两类记录都必须包含。 */
export const TRIAL_DECISION_BOUNDARY =
  "本记录仅为受控试行的内部内容批次确认或发布决定，不代表法制审核、正式内容审定或机关授权。";

/** 明确禁止出现在记录中的、暗示已获正式审定或授权的表述。 */
const FORBIDDEN_APPROVAL_PATTERNS = [
  /已经?正式审定/,
  /已获(得)?机关授权/,
  /通过法制审核/,
  /已审定系统/,
  /正式生产版/,
  /正式上线/,
];

/**
 * 校验记录是否满足“分别记录且不表述为正式审定/机关授权”。
 * 返回失败原因列表；为空表示通过。
 */
export function checkDecisionBoundary(record: TrialDecisionRecord): string[] {
  const failures: string[] = [];
  if (record.role.trim() === "") failures.push(`${record.id} 缺少记录角色。`);
  if (record.scope.trim() === "") failures.push(`${record.id} 缺少记录范围。`);
  if (!Number.isFinite(Date.parse(record.recordedAt))) {
    failures.push(`${record.id} 缺少可解析的记录时间。`);
  }
  if (record.statement.trim() === "") failures.push(`${record.id} 缺少记录内容。`);
  const text = `${record.role}\n${record.scope}\n${record.statement}\n${record.boundary}`;
  if (!text.includes("不代表法制审核")) {
    failures.push(`${record.id} 必须包含“不代表法制审核、正式内容审定或机关授权”的边界声明。`);
  }
  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      failures.push(`${record.id} 使用了暗示已正式审定或机关授权的表述：${pattern.source}`);
    }
  }
  if (record.references.length === 0) failures.push(`${record.id} 缺少可追溯引用。`);
  return failures;
}

export const CONTENT_BATCH_CONFIRMATION: TrialDecisionRecord = {
  id: "content-batch-confirmation",
  role: "受控试行内容维护者",
  scope: "release-trial-0001",
  recordedAt: "2026-09-29T00:00:00.000Z",
  statement:
    "确认本次激活批次中的法源均为现行有效、可核验的公开正式规范；十组派出所重点案情与首批文书范例均已具备独立版本、适用条件、依据、失效与禁用测试结果，并满足发布门槛。",
  boundary: TRIAL_DECISION_BOUNDARY,
  references: ["release-trial-0001", "docs/acceptance/trial-release-result.json"],
};

export const TRIAL_RELEASE_DECISION: TrialDecisionRecord = {
  id: "trial-release-decision",
  role: "受控试行产品负责人",
  scope: "受控试行启动",
  recordedAt: "2026-09-29T00:00:00.000Z",
  statement:
    "仅在硬门槛全部满足、发布检查通过且未触发停止条件时，决定以定向不公开网址开始受控试行。本记录不预先断言硬门槛已经满足；任何硬门槛失败或触发立即停止条件时，必须停用受影响功能。",
  boundary: TRIAL_DECISION_BOUNDARY,
  references: ["release-trial-0001", "docs/acceptance/trial-release-result.json"],
};

export const TRIAL_DECISION_RECORDS: TrialDecisionRecord[] = [
  CONTENT_BATCH_CONFIRMATION,
  TRIAL_RELEASE_DECISION,
];

/**
 * 校验两类记录都存在、分别记录且边界表述正确，并绑定当前发布批次。
 */
export function checkTrialDecisions(
  releaseId: string,
  records: readonly TrialDecisionRecord[] = TRIAL_DECISION_RECORDS,
): string[] {
  const failures: string[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  const confirmation = byId.get("content-batch-confirmation");
  const decision = byId.get("trial-release-decision");
  if (confirmation === undefined) failures.push("缺少内容维护者的内容批次确认记录。");
  if (decision === undefined) failures.push("缺少产品负责人的受控试行发布决定记录。");
  if (confirmation !== undefined && decision !== undefined && confirmation.role === decision.role) {
    failures.push("内容批次确认与试行发布决定必须由不同角色分别记录。");
  }
  for (const record of [confirmation, decision]) {
    if (record === undefined) continue;
    failures.push(...checkDecisionBoundary(record));
    if (record.id === "content-batch-confirmation" && !record.references.includes(releaseId)) {
      failures.push(`内容批次确认未绑定当前激活批次 ${releaseId}。`);
    }
  }
  return failures;
}
