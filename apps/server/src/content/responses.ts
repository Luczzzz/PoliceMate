import type {
  DocumentExampleFacets,
  DocumentExampleVariantDetail,
  DocumentExampleVariantSummary,
  HandlingStageCatalogEntry,
} from "@policymate/contracts";
import { DOCUMENT_EXAMPLE_NOTICE, HANDLING_STAGE_CATALOG } from "./catalog";
import { buildFacets, evaluateEligibility, selectEligibleExamples, toDetail, toSummary } from "./gating";
import type { GovernedContentStore } from "./store";

/** 列表结果：只包含通过当前状态门控的内容。 */
export interface DocumentExampleIndex {
  releaseId: string;
  stages: HandlingStageCatalogEntry[];
  items: DocumentExampleVariantSummary[];
  facets: DocumentExampleFacets;
}

/**
 * 详情查询结果。`unavailable` 表示该标识曾经存在但当前已被治理状态阻断，
 * 旧链接必须映射到这一结果，不得回退到缓存的正文。
 */
export type DocumentExampleLookup =
  | { outcome: "found"; example: DocumentExampleVariantDetail; releaseId: string }
  | { outcome: "unavailable" }
  | { outcome: "not_found" };

const STAGE_ORDER = new Map(HANDLING_STAGE_CATALOG.map((stage) => [stage.id, stage.order]));

/**
 * 构建当前激活批次中可检索的文书范例索引。
 * 每次调用都重新执行状态门控，因而不存在可被缓存绕过的旧结果。
 */
export function buildDocumentExampleIndex(
  store: GovernedContentStore,
  now: Date = new Date(),
): DocumentExampleIndex {
  const context = store.eligibilityContext(now);
  const eligible = selectEligibleExamples(store.examples(), context);
  const releaseId = context.release?.releaseId ?? "";
  const items = eligible
    .map((item) => toSummary(item, releaseId))
    .sort((a, b) => {
      const stageDelta = (STAGE_ORDER.get(a.stageId) ?? 99) - (STAGE_ORDER.get(b.stageId) ?? 99);
      if (stageDelta !== 0) return stageDelta;
      return a.formalName.localeCompare(b.formalName, "zh-Hans-CN");
    });

  return {
    releaseId,
    stages: HANDLING_STAGE_CATALOG.map((stage) => ({ ...stage })),
    items,
    facets: buildFacets(eligible),
  };
}

/** 打开详情：先做当前状态门控，再投影；失效内容返回 `unavailable`。 */
export function lookupDocumentExample(
  store: GovernedContentStore,
  exampleId: string,
  now: Date = new Date(),
): DocumentExampleLookup {
  const item = store.findExample(exampleId);
  if (item === undefined) return { outcome: "not_found" };

  const context = store.eligibilityContext(now);
  if (evaluateEligibility(item, context) !== null) return { outcome: "unavailable" };

  return {
    outcome: "found",
    example: toDetail(item, context, store.examples()),
    releaseId: context.release?.releaseId ?? "",
  };
}

export { DOCUMENT_EXAMPLE_NOTICE };
