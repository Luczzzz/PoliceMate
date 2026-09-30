import type {
  AnalysisReport,
  AnalysisSessionState,
  CandidateFact,
  CaseFocusDiversion,
  EvidenceHoldingStatus,
  EvidencePriority,
  LegalSourceReference,
  ReportBasisConfirmation,
  ReportConflictVersion,
  ReportDocumentTask,
  ReportEvidenceChecklistItem,
  ReportFactConflict,
  ReportFactReference,
  ReportGapBranch,
  ReportInterviewPointItem,
  ReportModule,
  ReportModuleId,
  ReportStatus,
  ReportTraceLink,
} from "@policymate/contracts";
import {
  CONTRACT_VERSION,
  EVIDENCE_HOLDING_STATUS_LABELS,
  EVIDENCE_PRIORITY_LABELS,
  FACT_CATEGORY_LABELS,
  REPORT_BASIS_CONFIRMATION_LABELS,
  REPORT_CONFLICT_BOUNDARY,
  REPORT_DOCUMENT_TASK_BOUNDARY,
  REPORT_MODULE_LABELS,
  REPORT_STATUS_LABELS,
} from "@policymate/contracts";
import { HANDLING_STAGE_CATALOG, PROCEDURE_CATEGORY_LABELS } from "../content/catalog";
import type { ReportGenerationResult } from "../providers/types";

const MODULE_IDS: ReportModuleId[] = [
  "preliminary_qualification",
  "filing_conditions",
  "evidence_checklist",
  "interview_points",
  "enforcement_risks",
  "legal_basis_trace",
];

function validSource(source: LegalSourceReference): boolean {
  return source.status === "current" && source.sourceId !== "" && source.version !== "" &&
    source.title !== "" && source.issuingAuthority !== "" && source.documentNumber !== "" &&
    source.region !== "" && source.articles.length > 0 &&
    source.articles.every((article) => article.location !== "" && article.minimalText !== "");
}

function matchesCanonicalBasis(
  basis: NonNullable<ReportTraceLink["basis"]>,
  source: LegalSourceReference,
): boolean {
  const article = source.articles.find((candidate) => candidate.location === basis.article);
  return basis.sourceId === source.sourceId && basis.version === source.version &&
    basis.title === source.title && basis.issuingAuthority === source.issuingAuthority &&
    basis.documentNumber === source.documentNumber && basis.region === source.region &&
    basis.status === source.status && basis.minimalText === article?.minimalText &&
    basis.lastVerifiedAt === source.lastVerifiedAt && basis.retrievedAt === source.retrievedAt &&
    basis.officialUrl === source.officialUrl;
}

/** 报告依据的确认状态：只有民警已确认的事实才标为已确认（ADR-0008 第 2 点）。 */
export function basisConfirmation(status: CandidateFact["status"]): ReportBasisConfirmation {
  return status === "confirmed" ? "officer_confirmed" : "system_extracted_unconfirmed";
}

/** 把一个快照事实转换为报告依据明细；确认状态由后端统一判定。 */
export function toReportFactReference(fact: CandidateFact): ReportFactReference {
  const confirmation = basisConfirmation(fact.status);
  return {
    factId: fact.factId,
    category: fact.category,
    categoryLabel: fact.categoryLabel,
    statement: fact.statement,
    originalWording: fact.originalWording,
    value: fact.value === null ? null : { ...fact.value },
    status: fact.status,
    confirmation,
    confirmationLabel: REPORT_BASIS_CONFIRMATION_LABELS[confirmation],
  };
}

/**
 * 用当前快照事实补齐报告依据明细。
 *
 * 提供者只能返回事实 ID；确认状态、类别、结构化值与原始表述一律由后端从
 * 未被排除的事实解析，避免外部边界自行声称“已确认”。
 */
export function attachReportFactReferences(
  result: ReportGenerationResult,
  facts: readonly CandidateFact[],
): ReportGenerationResult {
  const byId = new Map(
    facts.filter((fact) => !fact.excluded).map((fact) => [fact.factId, fact] as const),
  );
  return {
    ...result,
    modules: result.modules.map((module) => ({
      ...module,
      traceLinks: module.traceLinks.map((trace) => ({
        ...trace,
        factReferences: trace.factIds
          .map((factId) => byId.get(factId))
          .filter((fact): fact is CandidateFact => fact !== undefined)
          .map(toReportFactReference),
      })),
    })),
  };
}

/** 争议事实说明：只列出会被确定性规则标记为争议的值类别，其余走通用说明。 */
const CONFLICT_DESCRIPTIONS: Partial<Record<CandidateFact["category"], string>> = {
  result: "对同一事实的结果或后果存在不同说法，尚不能按单一版本确认。",
  amount: "对同一事实的金额存在不同说法，尚不能按单一版本确认。",
  count: "对同一事实的次数或数量存在不同说法，尚不能按单一版本确认。",
  age: "对同一事实的年龄存在不同说法，尚不能按单一版本确认。",
};

/**
 * 把一个争议版本的原始表述映射到分流方向。
 *
 * 只用于把“不同说法”对应到已有的条件分支，不产生任何结论：
 * 伤情程度表述对应刑事/行政方向，其他表述无法对应分支时返回 `null`。
 */
function diversionForConflictVersion(fact: CandidateFact): CaseFocusDiversion | null {
  const raw = fact.value?.raw ?? fact.statement;
  if (/轻微伤|擦伤|挫伤|未达轻伤/.test(raw)) return "administrative";
  if (/轻伤|重伤/.test(raw)) return "criminal";
  return null;
}

/**
 * 从当前快照中整理争议事实，并按未解决缺口并列给出各版本的分支。
 *
 * - 只收集未被排除且带争议分组标识的事实；
 * - 同一分组的事实按稳定顺序全部保留，不做去重、不选定版本；
 * - 若存在与争议类别相同的未解决缺口，则把各版本映射到对应分流分支。
 */
export function buildFactConflicts(
  facts: readonly CandidateFact[],
  gapBranches: readonly ReportGapBranch[],
): ReportFactConflict[] {
  const grouped = new Map<string, CandidateFact[]>();
  for (const fact of facts) {
    if (fact.excluded || fact.disputeGroupId === null) continue;
    const bucket = grouped.get(fact.disputeGroupId) ?? [];
    bucket.push(fact);
    grouped.set(fact.disputeGroupId, bucket);
  }

  return [...grouped.entries()].map(([conflictId, versions]) => {
    const category = versions[0]?.category ?? "other";
    const gap = gapBranches.find((branch) => branch.factCategory === category) ?? null;
    const conflictVersions: ReportConflictVersion[] = versions.map((fact) => {
      const diversion = diversionForConflictVersion(fact);
      const branch =
        gap === null || diversion === null
          ? null
          : gap.branches.find((candidate) => candidate.diversion === diversion) ?? null;
      return { ...toReportFactReference(fact), branch };
    });
    return {
      conflictId,
      description:
        CONFLICT_DESCRIPTIONS[category] ?? `对同一${FACT_CATEGORY_LABELS[category]}存在不同说法，尚不能按单一版本确认。`,
      factCategory: category,
      factCategoryLabel: FACT_CATEGORY_LABELS[category],
      versions: conflictVersions,
      boundaryStatement: REPORT_CONFLICT_BOUNDARY,
    };
  });
}

/** 依据明细必须与 `factIds` 一一对应，且与快照事实完全一致。 */
function referencesMatchFacts(
  trace: ReportTraceLink,
  facts: ReadonlyMap<string, CandidateFact>,
): boolean {
  if (trace.factReferences.length !== trace.factIds.length) return false;
  for (let index = 0; index < trace.factIds.length; index += 1) {
    const fact = facts.get(trace.factIds[index]);
    const reference = trace.factReferences[index];
    if (fact === undefined || reference === undefined) return false;
    if (JSON.stringify(toReportFactReference(fact)) !== JSON.stringify(reference)) return false;
  }
  return true;
}

function validTrace(trace: ReportTraceLink, facts: ReadonlyMap<string, CandidateFact>, sources: ReadonlyMap<string, LegalSourceReference>): boolean {
  if (!Array.isArray(trace.factIds) || trace.factIds.length === 0 || trace.factIds.some((id) => !facts.has(id))) return false;
  if (!Array.isArray(trace.factReferences) || !referencesMatchFacts(trace, facts)) return false;
  if (!trace.condition || !trace.judgment) return false;
  if (!["satisfied", "not_satisfied", "unknown", "conflicting"].includes(trace.conditionStatus)) return false;
  if (trace.basisKind === "formal_basis") {
    if (trace.basis === null) return false;
    const source = sources.get(trace.basis.sourceId);
    if (source === undefined || !validSource(source) || !matchesCanonicalBasis(trace.basis, source)) return false;
  } else if (trace.basis !== null) {
    return false;
  }
  return true;
}

const EVIDENCE_PRIORITIES = new Set<string>(Object.keys(EVIDENCE_PRIORITY_LABELS));const EVIDENCE_HOLDING_STATUSES = new Set<string>(Object.keys(EVIDENCE_HOLDING_STATUS_LABELS));
const STAGE_LABELS = new Map(HANDLING_STAGE_CATALOG.map((stage) => [stage.id, stage.label]));

function validateEvidenceItems(items: ReportEvidenceChecklistItem[]): void {
  if (!Array.isArray(items)) throw new Error("证据核查清单项目结构无效。");
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.itemId !== "string" || item.itemId === "" || seen.has(item.itemId)) {
      throw new Error("证据核查清单项目缺少稳定 ID 或 ID 重复。");
    }
    seen.add(item.itemId);
    if (typeof item.text !== "string" || item.text.trim() === "") {
      throw new Error("证据核查清单项目缺少内容。");
    }
    if (!EVIDENCE_PRIORITIES.has(item.priority) || item.priorityLabel !== EVIDENCE_PRIORITY_LABELS[item.priority as EvidencePriority]) {
      throw new Error("证据核查清单优先级无效。");
    }
    if (
      !EVIDENCE_HOLDING_STATUSES.has(item.holdingStatus) ||
      item.holdingStatusLabel !== EVIDENCE_HOLDING_STATUS_LABELS[item.holdingStatus as EvidenceHoldingStatus]
    ) {
      throw new Error("证据核查清单掌握状态无效。");
    }
  }
}

function validateInterviewItems(items: ReportInterviewPointItem[]): void {
  if (!Array.isArray(items)) throw new Error("分角色询问要点项目结构无效。");
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.itemId !== "string" || item.itemId === "" || seen.has(item.itemId)) {
      throw new Error("分角色询问要点缺少稳定 ID 或 ID 重复。");
    }
    seen.add(item.itemId);
    if (typeof item.text !== "string" || item.text.trim() === "") {
      throw new Error("分角色询问要点缺少内容。");
    }
    if (typeof item.role !== "string" || item.role === "" || typeof item.roleLabel !== "string" || item.roleLabel === "") {
      throw new Error("分角色询问要点缺少询问对象角色。");
    }
  }
}

/** 文书任务只允许结构化办案条件；不得携带事实或结论性表达。 */
function validateDocumentTasks(tasks: ReportDocumentTask[]): void {
  if (!Array.isArray(tasks)) throw new Error("报告文书任务结构无效。");
  const seen = new Set<string>();
  for (const task of tasks) {
    if (typeof task.taskId !== "string" || task.taskId === "" || seen.has(task.taskId)) {
      throw new Error("报告文书任务缺少稳定 ID 或 ID 重复。");
    }
    seen.add(task.taskId);
    if (typeof task.title !== "string" || task.title.trim() === "" || typeof task.description !== "string") {
      throw new Error("报告文书任务缺少标题或说明。");
    }
    if (task.procedureCategory !== "administrative" && task.procedureCategory !== "criminal") {
      throw new Error("报告文书任务程序类别无效。");
    }
    if (task.procedureCategoryLabel !== PROCEDURE_CATEGORY_LABELS[task.procedureCategory]) {
      throw new Error("报告文书任务程序类别名称不符合契约。");
    }
    if (STAGE_LABELS.get(task.stageId) !== task.stageLabel) {
      throw new Error("报告文书任务办理阶段无效。");
    }
    if (!Array.isArray(task.applicableRoles) || !Array.isArray(task.caseTags)) {
      throw new Error("报告文书任务筛选条件无效。");
    }
    if (task.boundaryStatement !== REPORT_DOCUMENT_TASK_BOUNDARY) {
      throw new Error("报告文书任务必须使用固定的非结论性边界说明。");
    }
  }
}

export function validateReportResult(result: ReportGenerationResult, session: AnalysisSessionState, legalSources: LegalSourceReference[]): void {
  if (!result || typeof result.headline !== "string" || !Array.isArray(result.modules)) {
    throw new Error("报告结构无效。");
  }
  if (result.modules.length !== MODULE_IDS.length) throw new Error("报告必须包含固定六个模块。");
  if (!["complete", "insufficient_facts", "conflicting", "basis_unavailable", "generation_failed", "partial_failure"].includes(result.status)) {
    throw new Error("报告总体状态无效。");
  }
  if (typeof result.headline !== "string" || result.headline.trim() === "" ||
      !Array.isArray(result.factLimitations) || !Array.isArray(result.participantBehaviorSummary) ||
      typeof result.workflowVersion !== "string" || result.workflowVersion === "") {
    throw new Error("报告头部结构无效。");
  }
  // 未经民警确认的候选事实也可以支撑初步定性意见（ADR-0008）；
  // 依据的确认状态由报告标签单独表达，这里只排除已排除出本次分析的事实。
  const facts = new Map(
    session.facts
      .filter((fact) => !fact.excluded)
      .map((fact) => [fact.factId, fact] as const),
  );
  const sources = new Map(legalSources.map((source) => [source.sourceId, source]));
  const seen = new Set<string>();
  for (const module of result.modules) {
    if (!MODULE_IDS.includes(module.id) || seen.has(module.id)) throw new Error("报告模块编号无效或重复。");
    seen.add(module.id);
    if (module.label !== REPORT_MODULE_LABELS[module.id]) throw new Error("报告模块名称不符合契约。");
    if (!["present", "not_applicable", "insufficient_facts", "basis_unavailable", "conflicting", "generation_failed"].includes(module.status)) throw new Error("报告模块状态无效。");
    if (!Array.isArray(module.items) || !Array.isArray(module.traceLinks) ||
        module.items.some((item) => typeof item !== "string") ||
        (module.summary !== null && typeof module.summary !== "string")) throw new Error("报告模块内容无效。");
    if (module.status === "present" && module.traceLinks.some((trace) => !validTrace(trace, facts, sources))) {
      throw new Error("报告缺少有效的事实—条件—依据解释链路。");
    }
    for (const trace of module.traceLinks) {
      if (!validTrace(trace, facts, sources)) throw new Error("报告解释链路无效。");
    }
    if (module.id === "evidence_checklist") validateEvidenceItems(module.evidenceItems);
    else if (module.evidenceItems.length > 0) throw new Error("非证据模块不得携带证据核查项目。");
    if (module.id === "interview_points") validateInterviewItems(module.interviewItems);
    else if (module.interviewItems.length > 0) throw new Error("非询问模块不得携带询问项目。");
  }
  validateDocumentTasks(result.documentTasks);
  const hasBasis = legalSources.some(validSource);
  if (result.status === "complete" && !hasBasis) throw new Error("主判断缺少当前有效法源。");
  const critical = result.modules.filter((module) => ["preliminary_qualification", "filing_conditions", "legal_basis_trace"].includes(module.id));
  if (result.status === "complete" && critical.some((module) => module.status !== "present")) throw new Error("关键模块未通过校验，不能标记为完整报告。");
  if (result.status === "partial_failure" && !result.modules.some((module) => module.status === "generation_failed")) throw new Error("局部失败状态必须对应失败模块。");
  const qualification = result.modules.find((module) => module.id === "preliminary_qualification");
  const filing = result.modules.find((module) => module.id === "filing_conditions");
  if (qualification?.status === "present" && filing?.status === "basis_unavailable") {
    throw new Error("跨模块依据状态矛盾。");
  }
}

export function buildReport(
  session: AnalysisSessionState,
  requestId: string,
  generatedAt: string,
  result: ReportGenerationResult,
  releaseId: string,
  focus: { caseFocusId: string | null; caseFocusVersion: string | null } = {
    caseFocusId: null,
    caseFocusVersion: null,
  },
  gapBranches: ReportGapBranch[] = [],
  conflicts: ReportFactConflict[] = [],
): AnalysisReport {
  return {
    contractVersion: CONTRACT_VERSION,
    requestId,
    generatedAt,
    sessionId: session.sessionId,
    status: result.status,
    statusLabel: REPORT_STATUS_LABELS[result.status],
    headline: result.headline,
    participantBehaviorSummary: result.participantBehaviorSummary,
    factLimitations: result.factLimitations,
    snapshotVersion: session.snapshot.snapshotVersion,
    snapshotHash: session.snapshot.snapshotHash,
    contentReleaseId: releaseId || result.contentReleaseId,
    caseFocusId: focus.caseFocusId,
    caseFocusVersion: focus.caseFocusVersion,
    workflowVersion: result.workflowVersion,
    modules: result.modules,
    gapBranches,
    conflicts,
    documentTasks: result.documentTasks,
  };
}

export { MODULE_IDS };

/* ---------- 受治理内容驱动的保守降级 ---------- */

/** 支撑主判断的关键模块；依据不可用或存在多种可能时必须整体降级。 */
export const CRITICAL_MODULE_IDS: ReportModuleId[] = [
  "preliminary_qualification",
  "filing_conditions",
  "legal_basis_trace",
];

/** 总体状态的保守顺序：数值越大越保守（规格 7.2）。 */
const STATUS_SEVERITY: Record<ReportStatus, number> = {
  complete: 0,
  partial_failure: 0,
  insufficient_facts: 1,
  conflicting: 2,
  basis_unavailable: 3,
  generation_failed: 4,
};

function moduleSeverity(status: ReportModule["status"]): number {
  if (status === "present" || status === "not_applicable") return 0;
  if (status === "generation_failed") return 4;
  return STATUS_SEVERITY[status];
}

const DOWNGRADE_SUMMARY: Record<"basis_unavailable" | "conflicting" | "insufficient_facts", string> = {
  basis_unavailable: "当前重点案情依赖的正式依据不可用或已失效，停止形成主判断。",
  conflicting: "存在不能排除的相邻方向，保留多种可能，不形成单一判断。",
  insufficient_facts: "决定性事实尚未确认，暂不能形成单一主结论；请按条件分支补充核验。",
};

export type ConservativeDowngradeStatus = keyof typeof DOWNGRADE_SUMMARY;

/**
 * 按受治理内容解析结果保守降级报告。
 *
 * 只降级支撑主判断的关键模块，不补写任何法律结论；
 * 依据不可用或存在多种可能时不展示确定性单一判断。
 */
export function applyConservativeDowngrade(
  result: ReportGenerationResult,
  forcedStatus: ConservativeDowngradeStatus,
  notes: string[],
): ReportGenerationResult {
  if (STATUS_SEVERITY[forcedStatus] <= STATUS_SEVERITY[result.status]) return result;

  const critical = new Set<string>(CRITICAL_MODULE_IDS);
  const summary = DOWNGRADE_SUMMARY[forcedStatus];
  const modules = result.modules.map((module) => {
    if (!critical.has(module.id)) return module;
    const status =
      moduleSeverity(module.status) > STATUS_SEVERITY[forcedStatus]
        ? module.status
        : forcedStatus;
    return {
      ...module,
      status,
      summary,
      items: [summary],
      traceLinks: [],
      failureReason: notes.length > 0 ? notes.join("；") : null,
      evidenceItems: [],
      interviewItems: [],
    };
  });

  return {
    ...result,
    status: forcedStatus,
    headline: summary,
    factLimitations: [...result.factLimitations, ...notes],
    modules,
  };
}
