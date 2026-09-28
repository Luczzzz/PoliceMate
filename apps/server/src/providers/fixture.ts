import { REPORT_MODULE_LABELS } from "@policymate/contracts";
import type {
  ContentStatus,
  FixtureControlResponse,
  LegalSourceStatus,
  FixtureExampleState,
  LegalSourceReference,
  ReportFailureControls,
} from "@policymate/contracts";
import { createFixtureContent } from "../content/fixture-content";
import { DOCUMENT_EXAMPLE_NOTICE } from "../content/catalog";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../content/responses";
import { toLegalSourceReference } from "../content/gating";
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
export interface FixturePatch extends ReportFailureControls {
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
  let reportMode: ReportFailureControls["reportMode"] = undefined;

  const applyPatch = (patch: FixturePatch) => {
    if (patch.difyAvailable !== undefined) difyAvailable = patch.difyAvailable;
    if (patch.reportMode !== undefined) reportMode = patch.reportMode;
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
    async generateReport(request) {
      const sources = request.legalSources;
      const active = request.facts.filter((fact) => !fact.excluded);
      const confirmedFacts = active.filter((fact) => fact.status === "confirmed");
      const facts = confirmedFacts.map((fact) => fact.factId);
      const basis = sources.find((source) => source.status === "current") ?? null;
      const trace = (condition: string, judgment: string) => ({
        factIds: facts.length > 0 ? [facts[0]] : [], condition, conditionStatus: "unknown" as const,
        judgment, basis: basis === null ? null : { ...basis, article: basis.articles[0]?.location ?? "", minimalText: basis.articles[0]?.minimalText ?? "" }, basisKind: "formal_basis" as const,
      });
      const module = (id: import("@policymate/contracts").ReportModuleId, status: import("@policymate/contracts").ReportModuleStatus, items: string[], traces = (status === "present" && facts.length > 0 && basis !== null) ? [trace("待核实条件", "仅供民警核验")] : []) => ({
        id, label: REPORT_MODULE_LABELS[id], status, summary: items[0] ?? null, items, traceLinks: traces, failureReason: status === "generation_failed" ? "该模块生成或校验失败。" : null,
      });
      const mode = reportMode;
      if (mode === "critical_failure") throw new Error("报告生成边界返回结构错误。");
      const insufficient = mode === "insufficient_facts" || confirmedFacts.length === 0;
      const conflicting = mode === "conflicting" || active.some((fact) => fact.status === "disputed");
      const unavailable = mode === "basis_unavailable" || basis === null;
      const partial = mode === "partial_failure";
      const status = unavailable ? "basis_unavailable" : conflicting ? "conflicting" : insufficient ? "insufficient_facts" : partial ? "partial_failure" : "complete";
      const usableStatus = unavailable ? "basis_unavailable" : conflicting ? "conflicting" : insufficient ? "insufficient_facts" : "present";
      const modules = [
        module("preliminary_qualification", usableStatus, [unavailable ? "当前有效法源不可用，停止形成主判断。" : conflicting ? "存在相互冲突的事实说法，保留多种可能。" : insufficient ? "确认事实不足，暂不能形成初步定性意见。" : "基于确认事实形成初步意见，仍需人工核验。"]),
        module("filing_conditions", usableStatus, ["受立案条件需结合正式案卷逐项核验。"]),
        module("evidence_checklist", partial ? "generation_failed" : "present", [partial ? "该模块暂未通过校验，未展示半成品。" : "核查相关客观证据、来源和固定时间。"]),
        module("interview_points", "present", ["按参与者角色分别询问，避免将多人多行为合并。"]),
        module("enforcement_risks", "present", ["核查紧急风险、程序期限和告知送达记录。"]),
        module("legal_basis_trace", unavailable ? "basis_unavailable" : "present", [unavailable ? "没有可匹配的当前有效受治理法源。" : "每项判断均展示事实、条件、状态和法源链路。"]),
      ];
      return { status, headline: status === "complete" ? "存在可供核验的初步方向" : status === "conflicting" ? "存在多种可能，不能单一判断" : status === "insufficient_facts" ? "当前事实不足，需补充核验" : "当前不能形成受法源支持的主判断", participantBehaviorSummary: active.flatMap((fact) => fact.participantRefs.flatMap((participant) => fact.behaviorRefs.map((behavior) => ({ participant, behavior, factIds: [fact.factId], note: fact.statement })))), factLimitations: active.filter((fact) => fact.status !== "confirmed").map((fact) => `${fact.statement}（${fact.statusLabel}）`), modules, contentReleaseId: "release-fixture-2026-08", workflowVersion: "report-fixture-v1" };
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
    async listLegalSources(): Promise<LegalSourceReference[]> {
      const context = store.eligibilityContext();
      return [...context.sources.values()].map(toLegalSourceReference);
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
      reportMode = undefined;
      store.reset();
      return describe();
    },
    describe,
  };
}
