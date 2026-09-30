import { createFixtureContent } from "../content/fixture-content";
import { createGovernedContentStore } from "../content/store";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../content/responses";
import { DOCUMENT_EXAMPLE_NOTICE } from "../content/catalog";
import { selectEligibleExamples, selectTaskCandidates, toLegalSourceReference } from "../content/gating";
import { resolveCaseFocus } from "../content/case-focus";
import type { GovernedContentProvider } from "./types";

/** 读取版本化试行内容种子，与模型与测试控制完全独立。 */
export function createGovernedContentProvider(): GovernedContentProvider {
  const store = createGovernedContentStore(createFixtureContent());
  return {
    async getActiveRelease() {
      const snapshot = store.snapshot();
      return { releaseId: snapshot.activeReleaseId, eligibleExampleCount: snapshot.eligibleExampleCount };
    },
    async listExamples() {
      return { ...buildDocumentExampleIndex(store), notice: DOCUMENT_EXAMPLE_NOTICE };
    },
    async getExample(exampleId) {
      const lookup = lookupDocumentExample(store, exampleId);
      return lookup.outcome === "found" ? { ...lookup, notice: DOCUMENT_EXAMPLE_NOTICE } : lookup;
    },
    async listLegalSources() {
      return [...store.eligibilityContext().sources.values()].map(toLegalSourceReference);
    },
    async listTaskCandidates(request) {
      return selectTaskCandidates(selectEligibleExamples(store.examples(), store.eligibilityContext()), request);
    },
    async resolveCaseFocus(facts, now = new Date()) {
      const context = store.eligibilityContext(now);
      const resolution = resolveCaseFocus(store.caseFocuses(), facts, context);
      return {
        matchedCaseFocusIds: resolution.matched.map((focus) => focus.caseFocusId),
        caseFocusId: resolution.primary?.caseFocusId ?? null,
        caseFocusVersion: resolution.primary?.version ?? null,
        caseFocusTitle: resolution.primary?.title ?? null,
        caseFocusEligible: resolution.primaryEligible,
        unresolvedAlternatives: resolution.adjacent.map((focus) => focus.title),
        unresolvedAlternativeIds: resolution.adjacent.map((focus) => focus.caseFocusId),
        unresolvedGapNotes: resolution.unresolvedGaps.map((gap) => gap.description),
        unresolvedGapIds: resolution.unresolvedGaps.map((gap) => gap.gapId),
        unresolvedGapBranches: resolution.unresolvedGapBranches,
        legalSources: resolution.primary === null
          ? [...context.sources.values()].filter((source) => source.status === "current").map(toLegalSourceReference)
          : resolution.legalSources,
      };
    },
  };
}
