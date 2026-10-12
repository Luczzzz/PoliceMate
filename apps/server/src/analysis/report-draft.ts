import type { CandidateFact, LegalSourceReference, ReportLegalBasis, ReportModule } from "@policymate/contracts";
import {
  EVIDENCE_HOLDING_STATUS_LABELS,
  EVIDENCE_PRIORITY_LABELS,
  REPORT_DOCUMENT_TASK_BOUNDARY,
  REPORT_MODULE_LABELS,
} from "@policymate/contracts";
import { HANDLING_STAGE_CATALOG, PROCEDURE_CATEGORY_LABELS } from "../content/catalog";
import type { ReportDraft, ReportDraftBasis, ReportGenerationResult } from "../providers/types";

const STAGE_LABELS = new Map(HANDLING_STAGE_CATALOG.map((stage) => [stage.id, stage.label]));

export interface HydrationContext {
  facts: readonly CandidateFact[];
  legalSources: readonly LegalSourceReference[];
  contentReleaseId: string;
  workflowVersion: string;
}

function hydrateBasis(basis: ReportDraftBasis, sources: ReadonlyMap<string, LegalSourceReference>): ReportLegalBasis {
  const source = sources.get(basis.sourceId);
  if (source === undefined) throw new Error("报告引用了不在本次受治理清单中的法源。");
  const article = source.articles.find((candidate) => candidate.location === basis.article);
  if (article === undefined) throw new Error("报告引用了法源中不存在的条号。");
  return {
    sourceId: source.sourceId,
    version: source.version,
    title: source.title,
    issuingAuthority: source.issuingAuthority,
    documentNumber: source.documentNumber,
    article: article.location,
    minimalText: article.minimalText,
    status: source.status,
    region: source.region,
    publishedAt: source.publishedAt,
    lastVerifiedAt: source.lastVerifiedAt,
    retrievedAt: source.retrievedAt,
    officialUrl: source.officialUrl,
  };
}

/**
 * 把模型草稿补全为完整报告结果（ADR-0013）。
 *
 * 标签、法条原文与元数据、文书固定字段和封装元数据一律由后端给出；
 * 依据引用的法源或条号不存在时失败关闭，模型无法改写条文。
 * 事实依据明细（`factReferences`）仍由 `attachReportFactReferences` 补齐。
 */
export function hydrateReportDraft(draft: ReportDraft, context: HydrationContext): ReportGenerationResult {
  const sources = new Map(context.legalSources.map((source) => [source.sourceId, source] as const));
  return {
    status: draft.status,
    headline: draft.headline,
    participantBehaviorSummary: draft.participantBehaviorSummary,
    factLimitations: draft.factLimitations,
    modules: draft.modules.map((module): ReportModule => ({
      ...module,
      label: REPORT_MODULE_LABELS[module.id],
      traceLinks: module.traceLinks.map((trace) => ({
        ...trace,
        factReferences: [],
        basis: trace.basis === null ? null : hydrateBasis(trace.basis, sources),
      })),
      evidenceItems: module.evidenceItems.map((item) => ({
        ...item,
        priorityLabel: EVIDENCE_PRIORITY_LABELS[item.priority],
        holdingStatusLabel: EVIDENCE_HOLDING_STATUS_LABELS[item.holdingStatus],
      })),
    })),
    documentTasks: draft.documentTasks.map((task) => ({
      ...task,
      procedureCategoryLabel: PROCEDURE_CATEGORY_LABELS[task.procedureCategory],
      stageLabel: STAGE_LABELS.get(task.stageId) ?? "",
      boundaryStatement: REPORT_DOCUMENT_TASK_BOUNDARY,
    })),
    contentReleaseId: context.contentReleaseId,
    workflowVersion: context.workflowVersion,
    ...(draft.quickBrief === undefined ? {} : { quickBrief: draft.quickBrief }),
  };
}

/** 把完整报告结果裁成模型应输出的草稿；测试与替身使用，生产路径不调用。 */
export function toReportDraft(result: ReportGenerationResult): ReportDraft {
  return {
    status: result.status,
    headline: result.headline,
    participantBehaviorSummary: result.participantBehaviorSummary,
    factLimitations: result.factLimitations,
    modules: result.modules.map((module) => ({
      id: module.id,
      status: module.status,
      summary: module.summary,
      items: module.items,
      traceLinks: module.traceLinks.map((trace) => ({
        factIds: trace.factIds,
        condition: trace.condition,
        conditionStatus: trace.conditionStatus,
        judgment: trace.judgment,
        basisKind: trace.basisKind,
        basis: trace.basis === null ? null : { sourceId: trace.basis.sourceId, article: trace.basis.article },
      })),
      failureReason: module.failureReason,
      evidenceItems: module.evidenceItems.map(({ priorityLabel: _p, holdingStatusLabel: _h, ...item }) => item),
      interviewItems: module.interviewItems,
    })),
    documentTasks: result.documentTasks.map(({ procedureCategoryLabel: _c, stageLabel: _s, boundaryStatement: _b, ...task }) => task),
    ...(result.quickBrief === undefined ? {} : { quickBrief: result.quickBrief }),
  };
}

interface MeasurableReport {
  participantBehaviorSummary: readonly unknown[];
  factLimitations: readonly unknown[];
  documentTasks: readonly unknown[];
  modules: ReadonlyArray<{
    items: readonly unknown[];
    traceLinks: readonly unknown[];
    evidenceItems: readonly unknown[];
    interviewItems: readonly unknown[];
  }>;
}

/**
 * 报告体量度量（只含计数，不含内容）：序列化字符数，以及超过 ADR-0012 数量上限的部分个数。
 * 后端校验不因超限拒绝报告，此处只为让部署端看到模型是否遵守上限。
 */
export function measureReport(report: MeasurableReport): { outputCharacters: number; capExceeded: number } {
  const over = (count: number, max: number): number => (count > max ? 1 : 0);
  let capExceeded =
    over(report.participantBehaviorSummary.length, 6) +
    over(report.factLimitations.length, 5) +
    over(report.documentTasks.length, 5);
  for (const module of report.modules) {
    capExceeded +=
      over(module.items.length, 6) + over(module.traceLinks.length, 4) +
      over(module.evidenceItems.length, 8) + over(module.interviewItems.length, 12);
  }
  return { outputCharacters: JSON.stringify(report).length, capExceeded };
}
