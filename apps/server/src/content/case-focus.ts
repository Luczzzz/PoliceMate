import type {
  CandidateFact,
  GapBranch,
  LegalSourceReference,
} from "@policymate/contracts";
import { CASE_FOCUS_DIVERSION_LABELS, FACT_CATEGORY_LABELS } from "@policymate/contracts";
import {
  effectiveReviewDueAtFor,
  evaluateGatedItem,
  firstReportLegalBasis,
  toLegalSourceReference,
} from "./gating";
import type {
  CaseFocusGapRecord,
  CaseFocusRecord,
  EligibilityContext,
  IneligibilityReason,
  LegalSourceRecord,
} from "./model";

/**
 * 派出所重点案情的当前状态门控与匹配。
 *
 * 首份分析允许依据未排除的候选或已确认行为标签与原始表述线索选择重点案情，
 * 但不解析模型生成的自然语言结论；未知、否认与争议事实不参与单一路径匹配。
 * 任何命中重点案情的分析都必须使用该重点
 * 案情当前批次内的受治理法源；重点案情不可用时立即停止支撑主结论。
 */

/**
 * 重点案情的当前状态门控。判定顺序与文书范例一致：
 * 内容状态 → 激活批次白名单 → 依赖法源效力 → 核验期限。
 */
export function evaluateCaseFocusEligibility(
  focus: CaseFocusRecord,
  context: EligibilityContext,
): IneligibilityReason | null {
  return evaluateGatedItem(
    focus,
    context.release?.caseFocuses.find((entry) => entry.caseFocusId === focus.caseFocusId),
    context,
  );
}

/** 重点案情的实际复核到期时间：自身期限与全部依赖法源期限中最早的一个。 */
export function effectiveCaseFocusReviewDueAt(
  focus: CaseFocusRecord,
  sources: ReadonlyMap<string, LegalSourceRecord>,
): string {
  return effectiveReviewDueAtFor(focus, sources);
}

export function selectEligibleCaseFocuses(
  focuses: readonly CaseFocusRecord[],
  context: EligibilityContext,
): CaseFocusRecord[] {
  return focuses.filter((focus) => evaluateCaseFocusEligibility(focus, context) === null);
}

/**
 * 参与重点案情识别的事实：候选或已确认、未被排除，且未被替代。
 *
 * ADR-0008 允许候选事实进入首份分析，因此候选行为可用于选择受治理重点案情；
 * 未知、否认与争议事实仍不得被系统静默选作单一路径。
 */
export function focusMatchingFacts(facts: readonly CandidateFact[]): CandidateFact[] {
  return facts.filter(
    (fact) =>
      !fact.excluded &&
      (fact.status === "candidate" || fact.status === "confirmed") &&
      (fact.supersededByFactId === null || fact.supersededByFactId === undefined),
  );
}

function factText(fact: CandidateFact): string {
  return `${fact.statement} ${fact.originalWording}`;
}

function behaviorLabelsOf(facts: readonly CandidateFact[]): Set<string> {
  const labels = new Set<string>();
  for (const fact of facts) {
    if (fact.category !== "behavior") continue;
    const raw = fact.value?.raw;
    if (typeof raw === "string" && raw !== "") labels.add(raw);
  }
  return labels;
}

/** 一个重点案情是否命中当前事实（候选或已确认，且已排除与替代事实不参与）。 */
export function matchesCaseFocus(focus: CaseFocusRecord, facts: readonly CandidateFact[]): boolean {
  const labels = behaviorLabelsOf(facts);
  const behaviorsMatched = focus.match.behaviorLabels.some((label) => labels.has(label));
  if (!behaviorsMatched) return false;

  const text = facts.map(factText).join("\n");
  const excluded = focus.match.excludeHints ?? [];
  if (excluded.some((hint) => text.includes(hint))) return false;

  const required = focus.match.requireAnyHints ?? [];
  if (required.length > 0 && !required.some((hint) => text.includes(hint))) return false;

  return true;
}

export function matchedCaseFocuses(
  focuses: readonly CaseFocusRecord[],
  facts: readonly CandidateFact[],
): CaseFocusRecord[] {
  const active = focusMatchingFacts(facts);
  if (active.length === 0) return [];
  return focuses.filter((focus) => matchesCaseFocus(focus, active));
}

/** 尚未解决的决定性事实缺口：不存在任何参与本次分析的对应事实。 */
export function unresolvedCaseFocusGaps(
  focus: CaseFocusRecord,
  facts: readonly CandidateFact[],
): CaseFocusGapRecord[] {
  const active = focusMatchingFacts(facts);
  return focus.gaps.filter(
    (gap) =>
      !active.some(
        (fact) =>
          // 系统初始提取事实按类别回答缺口；民警后续新增事实必须显式绑定
          // 缺口 ID，避免任意同类别事实错误关闭不相关缺口。
          (fact.sourceRound === 0 && fact.category === gap.factCategory) ||
          (fact.category === gap.factCategory && fact.resolvesGapIds.includes(gap.gapId)),
      ),
  );
}

/** 与主命中重点案情相邻、且同样命中当前事实的重点案情。 */
export function adjacentMatchedFocuses(
  focus: CaseFocusRecord,
  matched: readonly CaseFocusRecord[],
): CaseFocusRecord[] {
  const neighborIds = new Set(
    focus.neighbors.flatMap((neighbor) =>
      neighbor.neighborFocusId === null ? [] : [neighbor.neighborFocusId],
    ),
  );
  return matched.filter(
    (candidate) => candidate.caseFocusId !== focus.caseFocusId && neighborIds.has(candidate.caseFocusId),
  );
}

/**
 * 把未解决的决定性缺口展开为“若…则…”条件分支。
 *
 * 分支只声明条件与分流方向；程序路径与依据一律从该重点案情当前生效的
 * `diversionRules` 读取，避免分支内容与分流规则两处漂移。缺口未解决时
 * 不阻断报告生成，由报告呈现分支与补充建议。
 */
export function buildUnresolvedGapBranches(
  focus: CaseFocusRecord,
  gaps: readonly CaseFocusGapRecord[],
  sources: ReadonlyMap<string, LegalSourceRecord>,
): GapBranch[] {
  return gaps.map((gap) => ({
    gapId: gap.gapId,
    description: gap.description,
    factCategory: gap.factCategory,
    factCategoryLabel: FACT_CATEGORY_LABELS[gap.factCategory],
    supplementSuggestion:
      `补充「${gap.description}」涉及的关键信息后重新分析，可缩小结论范围；` +
      "也可以先回答“未知”或“待核实”，报告会继续保持分支呈现。",
    branches: gap.branches.flatMap((branch) => {
      const rule = focus.diversionRules.find(
        (candidate) => candidate.diversion === branch.diversion,
      );
      if (rule === undefined) return [];
      return [
        {
          branchId: branch.branchId,
          condition: branch.condition,
          diversion: branch.diversion,
          diversionLabel: CASE_FOCUS_DIVERSION_LABELS[branch.diversion],
          proceduralPath: [...rule.conditions],
          basis: firstReportLegalBasis(rule.basis, sources),
        },
      ];
    }),
  }));
}

export interface CaseFocusResolutionResult {
  /** 当前事实命中的全部重点案情（含不可用的重点案情，用于保守降级）。 */
  matched: CaseFocusRecord[];
  primary: CaseFocusRecord | null;
  /** 主命中的重点案情是否可用；不可用时其内容立即停止支撑主结论。 */
  primaryEligible: boolean;
  adjacent: CaseFocusRecord[];
  unresolvedGaps: CaseFocusGapRecord[];
  /** 未解决缺口的条件分支；未命中或缺口已解决时为空数组。 */
  unresolvedGapBranches: GapBranch[];
  /** 该重点案情当前可用的受治理法源；不可用或未命中时为空。 */
  legalSources: LegalSourceReference[];
}

/**
 * 解析本次分析应使用的重点案情与法源。
 *
 * - 未命中任何重点案情：返回空结果，由调用方回退到通用法源；
 * - 命中且可用：返回该重点案情的法源；
 * - 命中但不可用：返回空法源，迫使报告保守降级为“依据不可用”。
 */
export function resolveCaseFocus(
  focuses: readonly CaseFocusRecord[],
  facts: readonly CandidateFact[],
  context: EligibilityContext,
): CaseFocusResolutionResult {
  const active = focusMatchingFacts(facts);
  const matched = focuses.filter((focus) => matchesCaseFocus(focus, active));
  if (matched.length === 0) {
    return {
      matched: [],
      primary: null,
      primaryEligible: false,
      adjacent: [],
      unresolvedGaps: [],
      unresolvedGapBranches: [],
      legalSources: [],
    };
  }

  const primary = matched[0] as CaseFocusRecord;
  const primaryEligible = evaluateCaseFocusEligibility(primary, context) === null;
  const adjacent = adjacentMatchedFocuses(primary, matched);
  const unresolvedGaps = unresolvedCaseFocusGaps(primary, active);
  const legalSources = primaryEligible
    ? primary.sourceIds
        .flatMap((sourceId) => {
          const source = context.sources.get(sourceId);
          return source === undefined ? [] : [toLegalSourceReference(source)];
        })
        .filter((source) => source.status === "current")
    : [];

  return {
    matched,
    primary,
    primaryEligible,
    adjacent,
    unresolvedGaps,
    unresolvedGapBranches: buildUnresolvedGapBranches(primary, unresolvedGaps, context.sources),
    legalSources,
  };
}
