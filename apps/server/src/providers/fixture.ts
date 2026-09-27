import type {
  ContentStatus,
  FixtureControlResponse,
  LegalSourceStatus,
  FixtureExampleState,
} from "@policymate/contracts";
import { createFixtureContent } from "../content/fixture-content";
import { DOCUMENT_EXAMPLE_NOTICE } from "../content/catalog";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../content/responses";
import { createGovernedContentStore } from "../content/store";
import { extractCaseFactsFixture } from "../analysis/fixture-extract";
import { proposeDecisiveQuestionsFixture } from "../analysis/fixture-questions";
import type {
  CaseAnalysisProvider,
  CaseExtractionRequest,
  CaseExtractionResult,
  DifyProvider,
  GovernedContentExampleIndex,
  GovernedContentExampleLookup,
  GovernedContentProvider,
  GovernedContentRelease,
  Providers,
  QuestionPoolRequest,
  QuestionPoolResult,
  ServiceAvailability,
} from "./types";

/**
 * Dify 与受治理内容边界的确定性替身。
 *
 * 受治理内容来自仅用于测试的确定性内容源；替身只维护治理开关，
 * 不读取案情内容，也不返回任何真实模型或真实法源数据。
 */
export interface FixturePatch {
  difyAvailable?: boolean;
  exampleStatusAll?: ContentStatus;
  exampleStatus?: { exampleId: string; status: ContentStatus };
  legalSourceStatusAll?: LegalSourceStatus;
  examplesExpired?: boolean;
}

export interface FixtureControls extends Providers {
  updateState(patch: FixturePatch): FixtureControlResponse;
  reset(): FixtureControlResponse;
  describe(): FixtureControlResponse;
}

export function createFixtureControls(initial: FixturePatch = {}): FixtureControls {
  const store = createGovernedContentStore(createFixtureContent());
  let difyAvailable = true;

  const applyPatch = (patch: FixturePatch) => {
    if (patch.difyAvailable !== undefined) difyAvailable = patch.difyAvailable;
    if (patch.exampleStatusAll !== undefined) store.setAllExampleStatus(patch.exampleStatusAll);
    if (patch.exampleStatus !== undefined) {
      store.setExampleStatus(patch.exampleStatus.exampleId, patch.exampleStatus.status);
    }
    if (patch.legalSourceStatusAll !== undefined) {
      store.setAllLegalSourceStatus(patch.legalSourceStatusAll);
    }
    if (patch.examplesExpired !== undefined) store.setExamplesExpired(patch.examplesExpired);
  };

  const describe = (): FixtureControlResponse => {
    const snapshot = store.snapshot();
    const examples: FixtureExampleState[] = snapshot.examples.map((item) => ({ ...item }));
    return {
      difyAvailable,
      activeReleaseId: snapshot.activeReleaseId,
      eligibleExampleCount: snapshot.eligibleExampleCount,
      examples,
      legalSources: snapshot.legalSources.map((source) => ({ ...source })),
    };
  };

  applyPatch(initial);

  const dify: DifyProvider = {
    async getAvailability(): Promise<ServiceAvailability> {
      return difyAvailable
        ? { available: true, reason: null }
        : { available: false, reason: "分析服务暂不可用" };
    },
  };

  /**
   * 案情分析边界替身：确定性提取与追问选题。
   * 后端负责结构校验、状态机、上限控制与紧急提示，替身不决定任何产品状态。
   */
  const analysis: CaseAnalysisProvider = {
    async extractCaseFacts(request: CaseExtractionRequest): Promise<CaseExtractionResult> {
      return extractCaseFactsFixture(request.caseText);
    },
    async proposeDecisiveQuestions(request: QuestionPoolRequest): Promise<QuestionPoolResult> {
      return proposeDecisiveQuestionsFixture(request);
    },
  };

  const content: GovernedContentProvider = {
    async getActiveRelease(): Promise<GovernedContentRelease> {
      const snapshot = store.snapshot();
      return {
        releaseId: snapshot.activeReleaseId,
        eligibleExampleCount: snapshot.eligibleExampleCount,
      };
    },
    async listExamples(): Promise<GovernedContentExampleIndex> {
      const index = buildDocumentExampleIndex(store);
      return { notice: DOCUMENT_EXAMPLE_NOTICE, ...index };
    },
    async getExample(exampleId: string): Promise<GovernedContentExampleLookup> {
      const lookup = lookupDocumentExample(store, exampleId);
      if (lookup.outcome !== "found") return lookup;
      return { ...lookup, notice: DOCUMENT_EXAMPLE_NOTICE };
    },
  };

  return {
    dify,
    analysis,
    content,
    updateState: (patch) => {
      applyPatch(patch);
      return describe();
    },
    reset: () => {
      difyAvailable = true;
      store.reset();
      return describe();
    },
    describe,
  };
}
