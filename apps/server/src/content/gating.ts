import type {
  ContentStatus,
  DocumentExampleFacetOption,
  DocumentExampleFacets,
  DocumentExampleVariantDetail,
  DocumentExampleVariantSummary,
  DocumentTaskCandidate,
  DocumentTaskCandidateRequest,
  LegalSourceReference,
} from "@policymate/contracts";
import {
  CONTENT_STATUS_LABELS,
  DOCUMENT_EXAMPLE_NOTICE,
  HANDLING_STAGE_CATALOG,
  LEGAL_SOURCE_STATUS_LABELS,
  PROCEDURE_CATEGORY_LABELS,
  handlingStageLabel,
} from "./catalog";
import type {
  DocumentExampleRecord,
  EligibilityContext,
  IneligibilityReason,
  LegalSourceRecord,
} from "./model";

/**
 * 当前状态门控。
 *
 * 每次列表、检索、打开详情或跟随旧链接时都重新计算，不依赖任何缓存结果。
 * 判定顺序为：内容状态 → 激活批次白名单 → 依赖法源效力 → 核验期限。
 * 文书范例与重点案情共用同一判定，只是批次白名单字段不同。
 */
export interface GatedContentItem {
  contentStatus: ContentStatus;
  version: string;
  sourceIds: string[];
  nextReviewDueAt: string;
}

export function evaluateGatedItem(
  item: GatedContentItem,
  releaseEntry: { version: string } | undefined,
  context: EligibilityContext,
): IneligibilityReason | null {
  if (item.contentStatus !== "trial") return "content_status";
  if (!releaseEntry || releaseEntry.version !== item.version) return "not_in_release";

  for (const sourceId of item.sourceIds) {
    const source = context.sources.get(sourceId);
    if (!source || source.status !== "current") return "source_status";
  }

  // 复核日期无法解析时失败关闭：无法确认有效即视为失效。
  const reviewDueAt = Date.parse(effectiveReviewDueAtFor(item, context.sources));
  if (!Number.isFinite(reviewDueAt) || reviewDueAt <= context.now.getTime()) {
    return "expired";
  }

  return null;
}

/**
 * 内容的实际复核到期时间：内容自身期限与全部依赖法源期限中最早的一个。
 * 任一依赖法源更早到期时，内容随法源到期。
 */
export function effectiveReviewDueAtFor(
  item: Pick<GatedContentItem, "sourceIds" | "nextReviewDueAt">,
  sources: ReadonlyMap<string, LegalSourceRecord>,
): string {
  const candidates = [Date.parse(item.nextReviewDueAt)];
  for (const sourceId of item.sourceIds) {
    const source = sources.get(sourceId);
    if (source === undefined) continue;
    candidates.push(Date.parse(source.nextReviewDueAt));
  }
  // 任一时间不可解析时返回空字符串，由调用方失败关闭。
  if (candidates.some((value) => !Number.isFinite(value))) return "";
  return new Date(Math.min(...candidates)).toISOString();
}

export function evaluateEligibility(
  item: DocumentExampleRecord,
  context: EligibilityContext,
): IneligibilityReason | null {
  return evaluateGatedItem(
    item,
    context.release?.items.find((entry) => entry.exampleId === item.exampleId),
    context,
  );
}

/** 文书范例的实际复核到期时间；共用 `effectiveReviewDueAtFor` 的判定。 */
export function effectiveReviewDueAt(
  item: DocumentExampleRecord,
  sources: ReadonlyMap<string, LegalSourceRecord>,
): string {
  return effectiveReviewDueAtFor(item, sources);
}

export function selectEligibleExamples(
  examples: readonly DocumentExampleRecord[],
  context: EligibilityContext,
): DocumentExampleRecord[] {
  return examples.filter((item) => evaluateEligibility(item, context) === null);
}

/** 只对传入的合格内容计数；调用方必须先完成状态门控。 */
export function buildFacets(
  items: readonly DocumentExampleRecord[],
): DocumentExampleFacets {
  const procedure = new Map<string, DocumentExampleFacetOption>();
  const stageCounts = new Map<string, number>();
  const documentTypes = new Map<string, DocumentExampleFacetOption>();

  const bump = (map: Map<string, DocumentExampleFacetOption>, id: string, label: string) => {
    const existing = map.get(id);
    if (existing === undefined) map.set(id, { id, label, count: 1 });
    else existing.count += 1;
  };

  for (const item of items) {
    bump(procedure, item.procedureCategory, PROCEDURE_CATEGORY_LABELS[item.procedureCategory]);
    bump(documentTypes, item.documentTypeId, item.documentTypeName);
    stageCounts.set(item.stageId, (stageCounts.get(item.stageId) ?? 0) + 1);
  }

  return {
    procedureCategories: [...procedure.values()],
    // 办理阶段始终给出完整目录，空阶段以 0 计数展示。
    stages: HANDLING_STAGE_CATALOG.map((stage) => ({
      id: stage.id,
      label: stage.label,
      count: stageCounts.get(stage.id) ?? 0,
    })),
    documentTypes: [...documentTypes.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "zh-Hans-CN"),
    ),
  };
}

/**
 * 按报告文书任务的结构化办案条件筛查候选范例。
 *
 * 只使用程序类别、办理阶段、适用对象和案情标签，不接收任何案情事实；
 * 传入的必须是已经通过当前状态门控的合格内容。多个候选保持并列，
 * 不自动挑选唯一范例。
 */
export function selectTaskCandidates(
  eligibleExamples: readonly DocumentExampleRecord[],
  request: DocumentTaskCandidateRequest,
): DocumentTaskCandidate[] {
  const candidates = eligibleExamples.filter((item) => {
    if (item.procedureCategory !== request.procedureCategory) return false;
    if (item.stageId !== request.stageId) return false;
    if (
      request.applicableRoles.length > 0 &&
      !item.applicableRoles.some((role) => request.applicableRoles.includes(role))
    ) {
      return false;
    }
    if (request.caseTags.length > 0 && !item.caseTags.some((tag) => request.caseTags.includes(tag))) {
      return false;
    }
    return true;
  });
  const multiple = candidates.length > 1;
  return candidates.map((item) => {
    const neighborDifferences = item.neighbors
      .filter((neighbor) => candidates.some((candidate) => candidate.exampleId === neighbor.exampleId))
      .map((neighbor) => neighbor.difference);
    return {
      exampleId: item.exampleId,
      formalName: item.formalName,
      documentTypeName: item.documentTypeName,
      procedureCategoryLabel: PROCEDURE_CATEGORY_LABELS[item.procedureCategory],
      stageLabel: handlingStageLabel(item.stageId),
      contentStatusLabel: CONTENT_STATUS_LABELS[item.contentStatus],
      applicableRoles: [...item.applicableRoles],
      caseTags: [...item.caseTags],
      difference:
        neighborDifferences.length > 0
          ? neighborDifferences.join(" ")
          : multiple
            ? "与同阶段其他候选的差异：请核对适用场景、不适用情形与前置条件后自行判断。"
            : "当前批次中仅此候选；仍需核对适用条件，系统不自动认定为唯一适用范例。",
      preflightChecks: [...item.preflightChecks],
    };
  });
}

export function toSummary(
  item: DocumentExampleRecord,
  releaseId: string,
): DocumentExampleVariantSummary {
  return {
    exampleId: item.exampleId,
    version: item.version,
    contentStatus: item.contentStatus,
    contentStatusLabel: CONTENT_STATUS_LABELS[item.contentStatus],
    formalName: item.formalName,
    aliases: [...item.aliases],
    procedureCategory: item.procedureCategory,
    procedureCategoryLabel: PROCEDURE_CATEGORY_LABELS[item.procedureCategory],
    stageId: item.stageId,
    stageLabel: handlingStageLabel(item.stageId),
    documentTypeId: item.documentTypeId,
    documentTypeName: item.documentTypeName,
    caseTags: [...item.caseTags],
    applicableRoles: [...item.applicableRoles],
    releaseId,
    sourceIds: [...item.sourceIds],
    lastVerifiedAt: item.lastVerifiedAt,
    nextReviewDueAt: item.nextReviewDueAt,
  };
}

export function toLegalSourceReference(source: LegalSourceRecord): LegalSourceReference {
  return {
    sourceId: source.sourceId,
    version: source.version,
    title: source.title,
    issuingAuthority: source.issuingAuthority,
    documentNumber: source.documentNumber,
    authorityLevel: source.authorityLevel,
    region: source.region,
    status: source.status,
    statusLabel: LEGAL_SOURCE_STATUS_LABELS[source.status],
    publishedAt: source.publishedAt,
    effectiveAt: source.effectiveAt,
    officialUrl: source.officialUrl,
    retrievedAt: source.retrievedAt,
    lastVerifiedAt: source.lastVerifiedAt,
    nextReviewDueAt: source.nextReviewDueAt,
    maintainer: source.maintainer,
    articles: source.articles.map((article) => ({ ...article })),
  };
}

/**
 * 详情投影。相邻变体只保留在当前批次中仍然合格的内容，
 * 失效的相邻变体不会因出现在详情里而绕过状态门控。
 */
export function toDetail(
  item: DocumentExampleRecord,
  context: EligibilityContext,
  allExamples: readonly DocumentExampleRecord[],
): DocumentExampleVariantDetail {
  const byId = new Map(allExamples.map((candidate) => [candidate.exampleId, candidate]));
  const neighboringVariants = item.neighbors.flatMap((neighbor) => {
    const candidate = byId.get(neighbor.exampleId);
    if (candidate === undefined || candidate.exampleId === item.exampleId) return [];
    if (evaluateEligibility(candidate, context) !== null) return [];
    return [
      {
        exampleId: candidate.exampleId,
        formalName: candidate.formalName,
        difference: neighbor.difference,
      },
    ];
  });

  const releaseId = context.release?.releaseId ?? "";
  const legalSources = item.sourceIds.flatMap((sourceId) => {
    const source = context.sources.get(sourceId);
    return source === undefined ? [] : [toLegalSourceReference(source)];
  });

  return {
    ...toSummary(item, releaseId),
    applicableScenarios: [...item.applicableScenarios],
    exclusions: [...item.exclusions],
    prerequisites: [...item.prerequisites],
    preflightChecks: [...item.preflightChecks],
    neighboringVariants,
    structure: item.structure.map((section) => ({ ...section })),
    annotatedExample: item.annotatedExample.map((part) => ({
      ...part,
      annotations: [...part.annotations],
    })),
    productionPoints: [...item.productionPoints],
    commonErrors: [...item.commonErrors],
    riskNotes: [...item.riskNotes],
    formatSource: item.formatSource,
    legalSources,
    governance: {
      maintainer: item.maintainer,
      draftedAt: item.draftedAt,
      verifiedAt: item.verifiedAt,
      publishedAt: item.publishedAt,
      lastVerifiedAt: item.lastVerifiedAt,
      nextReviewDueAt: item.nextReviewDueAt,
      releaseId,
      changeNote: item.changeNote,
      sourceVerificationNote: item.sourceVerificationNote,
    },
  };
}

export { DOCUMENT_EXAMPLE_NOTICE };
