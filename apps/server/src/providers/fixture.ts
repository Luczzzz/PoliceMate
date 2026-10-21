import {
  REPORT_MODULE_LABELS,
  REPORT_DOCUMENT_TASK_BOUNDARY,
} from "@policymate/contracts";
import type {
  ContentStatus,
  FixtureAccidentMode,
  FixtureControlResponse,
  FixtureCaseFocusState,
  FixtureStreamMode,
  LegalSourceStatus,
  FixtureExampleState,
  LegalSourceReference,
  ReportDocumentTask,
  ReportEvidenceChecklistItem,
  ReportFailureControls,
  ReportInterviewPointItem,
  UpstreamFailureMode,
} from "@policymate/contracts";
import { createFixtureContent } from "../content/fixture-content";
import { DOCUMENT_EXAMPLE_NOTICE } from "../content/catalog";
import { buildDocumentExampleIndex, lookupDocumentExample } from "../content/responses";
import { resolveCaseFocus as resolveCaseFocusFromContent } from "../content/case-focus";
import { toLegalSourceReference, selectEligibleExamples, selectTaskCandidates } from "../content/gating";
import { createGovernedContentStore } from "../content/store";
import { extractCaseFactsFixture } from "../analysis/fixture-extract";
import { buildAssaultReport } from "../analysis/assault-report";
import { ASSAULT_FOCUS_ID } from "../content/public-order-drug-content";
import type {
  AccidentLiabilityConsultOutput,
  CaseAnalysisProvider,
  CaseExtractionRequest,
  CaseExtractionResult,
  GovernedContentExampleIndex,
  GovernedContentExampleLookup,
  GovernedContentProvider,
  GovernedContentRelease,
  Providers,
  ReportGenerationResult,
  ServiceAvailability,
} from "./types";

/**
 * 分析服务与受治理内容边界的确定性替身。
 *
 * 受治理内容来自仅用于测试的确定性内容源；替身只维护治理开关，
 * 不读取案情内容，也不返回任何真实模型或真实法源数据。
 */
export interface FixturePatch extends ReportFailureControls {
  analysisAvailable?: boolean;
  exampleStatusAll?: ContentStatus;
  exampleStatus?: { exampleId: string; status: ContentStatus };
  caseFocusStatusAll?: ContentStatus;
  caseFocusStatus?: { caseFocusId: string; status: ContentStatus };
  legalSourceStatusAll?: LegalSourceStatus;
  examplesExpired?: boolean;
  caseFocusesExpired?: boolean;
  legalSourcesExpired?: boolean;
  extractionMode?: UpstreamFailureMode;
  accidentMode?: FixtureAccidentMode;
}

/** 替身超时模式等待时长；必须明显长于测试注入的引擎超时上限。 */
export const FIXTURE_TIMEOUT_DELAY_MS = 250;
/** 事故问答 slow 模式的响应延迟：够长到能断言弹窗，够短到不拖慢黑盒测试。 */
export const FIXTURE_ACCIDENT_SLOW_DELAY_MS = 1200;

/** 流式替身每段之间的间隔，足以让浏览器黑盒测试观察到逐段出现。 */
export const FIXTURE_STREAM_PIECE_DELAY_MS = 30;
/** slow 模式的每段间隔：给浏览器测试留出点击“停止”的时间。 */
export const FIXTURE_STREAM_SLOW_DELAY_MS = 400;

/** 流式替身的固定文本：六个编号小节，内容为虚构、不依赖案情。 */export const FIXTURE_STREAM_PIECES: readonly string[] = [
  "1、案件定性：本案按虚构示例分析，涉嫌殴打他人（待核实伤情）。\n",
  "2、是否应当受案：属公安机关管辖范围，应当受案。\n",
  "3、核心证据清单：①现场监控录像；②被害人陈述；③伤情鉴定意见。\n",
  "4、询问提纲：\n- 违法嫌疑人：争执起因、具体行为。\n- 被害人：受伤时间、部位。\n",
  "5、执法风险提示：及时固定现场监控，按规定制作询问笔录。\n",
  "6、法律条文原文节选：本次为测试替身，没有可引用的受治理法源。\n",
];

export const FIXTURE_ACCIDENT_QUESTION =
  "请补充说明：事故双方当时的通行方向和路口信号灯（或标志标线）状态。";

/** 事故问答替身的固定报告：四个小节，内容为虚构、不依赖案情。 */
export const FIXTURE_ACCIDENT_REPORT = [
  "【责任认定】",
  "机动车一方承担主要责任，非机动车一方承担次要责任。",
  "",
  "理由：",
  "1. 机动车未按规定让行",
  "2. 非机动车存在未在非机动车道行驶的违法行为",
  "3. 这只是研判意见，最终以官方认定为准",
  "",
  "法律依据",
  "本次为测试替身，没有可引用的受治理法源。",
  "",
  "程序要点",
  "1. 需制作《道路交通事故认定书》，10日内送达当事人",
  "2. 告知当事人复核权利（3日内可申请复核）",
  "3. 核对监控录像、当事人陈述与现场照片",
  "",
  "关键事实",
  "• 机动车由东向西行驶，路口未让行",
  "• 非机动车由南向北行驶，未在非机动车道内",
  "• 碰撞发生在路口中心位置",
].join("\n");

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FixtureControls extends Providers {
  updateState(patch: FixturePatch): FixtureControlResponse;
  reset(): FixtureControlResponse;
  describe(): FixtureControlResponse;
}

export function createFixtureControls(initial: FixturePatch = {}): FixtureControls {
  const store = createGovernedContentStore(createFixtureContent());
  let analysisAvailable = true;
  let reportMode: NonNullable<ReportFailureControls["reportMode"]> = "complete";
  let extractionMode: UpstreamFailureMode = "normal";
  let streamMode: FixtureStreamMode = "normal";
  let accidentMode: FixtureAccidentMode = "normal";

  const applyPatch = (patch: FixturePatch) => {
    if (patch.analysisAvailable !== undefined) analysisAvailable = patch.analysisAvailable;
    if (patch.reportMode !== undefined) reportMode = patch.reportMode;
    if (patch.extractionMode !== undefined) extractionMode = patch.extractionMode;
    if (patch.streamMode !== undefined) streamMode = patch.streamMode;
    if (patch.accidentMode !== undefined) accidentMode = patch.accidentMode;
    if (patch.exampleStatusAll !== undefined) store.setAllExampleStatus(patch.exampleStatusAll);
    if (patch.exampleStatus !== undefined) {
      store.setExampleStatus(patch.exampleStatus.exampleId, patch.exampleStatus.status);
    }
    if (patch.caseFocusStatusAll !== undefined) {
      store.setAllCaseFocusStatus(patch.caseFocusStatusAll);
    }
    if (patch.caseFocusStatus !== undefined) {
      store.setCaseFocusStatus(patch.caseFocusStatus.caseFocusId, patch.caseFocusStatus.status);
    }
    if (patch.legalSourceStatusAll !== undefined) {
      store.setAllLegalSourceStatus(patch.legalSourceStatusAll);
    }
    if (patch.examplesExpired !== undefined) store.setExamplesExpired(patch.examplesExpired);
    if (patch.caseFocusesExpired !== undefined) store.setCaseFocusesExpired(patch.caseFocusesExpired);
    if (patch.legalSourcesExpired !== undefined) store.setLegalSourcesExpired(patch.legalSourcesExpired);
  };

  const describe = (): FixtureControlResponse => {
    const snapshot = store.snapshot();
    const examples: FixtureExampleState[] = snapshot.examples.map((item) => ({ ...item }));
    const caseFocuses: FixtureCaseFocusState[] = snapshot.caseFocuses.map((item) => ({ ...item }));
    return {
      analysisAvailable,
      activeReleaseId: snapshot.activeReleaseId,
      eligibleExampleCount: snapshot.eligibleExampleCount,
      eligibleCaseFocusCount: snapshot.eligibleCaseFocusCount,
      examples,
      caseFocuses,
      legalSources: snapshot.legalSources.map((source) => ({ ...source })),
      extractionMode,
      reportMode,
      streamMode,
      accidentMode,
    };
  };

  applyPatch(initial);

  /**
   * 案情分析边界替身：确定性提取与报告生成。
   * 后端负责结构校验、状态机、快照与紧急提示，替身不决定任何产品状态。
   */
  const analysis: CaseAnalysisProvider = {
    async getAvailability(): Promise<ServiceAvailability> {
      return analysisAvailable
        ? { available: true, reason: null }
        : { available: false, reason: "分析服务暂不可用" };
    },
    async *streamAnalysis(_request, signal) {
      let index = 0;
      for (const piece of FIXTURE_STREAM_PIECES) {
        await delay(streamMode === "slow" ? FIXTURE_STREAM_SLOW_DELAY_MS : FIXTURE_STREAM_PIECE_DELAY_MS);
        if (signal?.aborted) throw new Error("流式分析已中止。");
        if (streamMode === "fail_midway" && index === 2) throw new Error("fixture stream failure");
        yield piece;
        index += 1;
      }
    },
    async extractCaseFacts(request: CaseExtractionRequest): Promise<CaseExtractionResult> {
      if (extractionMode === "timeout") await delay(FIXTURE_TIMEOUT_DELAY_MS);
      if (extractionMode === "empty") {
        return { matters: [] };
      }
      if (extractionMode === "malformed") {
        return {
          matters: [
            {
              matterId: "matter-1",
              label: "事项一",
              facts: [{ factId: "" }] as unknown as CaseExtractionResult["matters"][number]["facts"],
            },
          ],
        };
      }
      return { matters: extractCaseFactsFixture(request.caseText).matters };
    },
    async generateReport(request) {
      const sources = request.legalSources;
      const active = request.facts.filter((fact) => !fact.excluded);
      // 未经确认的候选事实也可以支撑初步意见（ADR-0008）；确认状态由
      // 报告标签表达，替身不因此把报告降级为条件不足。
      const facts = active.map((fact) => fact.factId);
      const basis = sources.find((source) => source.status === "current") ?? null;
      const trace = (condition: string, judgment: string) => ({
        factIds: facts.length > 0 ? [facts[0]] : [], factReferences: [], condition, conditionStatus: "unknown" as const,
        judgment, basis: basis === null ? null : { ...basis, article: basis.articles[0]?.location ?? "", minimalText: basis.articles[0]?.minimalText ?? "" }, basisKind: "formal_basis" as const,
      });
      const module = (id: import("@policymate/contracts").ReportModuleId, status: import("@policymate/contracts").ReportModuleStatus, items: string[], traces = (status === "present" && facts.length > 0 && basis !== null) ? [trace("待核实条件", "仅供民警核验")] : [], extra: { evidenceItems?: ReportEvidenceChecklistItem[]; interviewItems?: ReportInterviewPointItem[] } = {}) => ({
        id, label: REPORT_MODULE_LABELS[id], status, summary: items[0] ?? null, items, traceLinks: traces, failureReason: status === "generation_failed" ? "该模块生成或校验失败。" : null,
        evidenceItems: extra.evidenceItems ?? [],
        interviewItems: extra.interviewItems ?? [],
      });
      const evidenceItems: ReportEvidenceChecklistItem[] = [
        {
          itemId: "ev-01",
          text: "调取案发现场监控或周边视频，固定行为过程与时间。",
          purpose: "证明行为发生过程与时间点。",
          sourceHint: "现场及周边公共视频、单位自有监控。",
          preservationRisk: "监控存储周期短，存在被覆盖风险。",
          priority: "high",
          priorityLabel: "高优先级",
          holdingStatus: "not_held",
          holdingStatusLabel: "尚未掌握",
        },
        {
          itemId: "ev-02",
          text: "收集就诊记录、诊断证明或伤情鉴定意见，确认结果后果。",
          purpose: "证明结果后果及其程度。",
          sourceHint: "医疗机构就诊记录。",
          preservationRisk: null,
          priority: "medium",
          priorityLabel: "中优先级",
          holdingStatus: "partial",
          holdingStatusLabel: "部分掌握",
        },
        {
          itemId: "ev-03",
          text: "分别核实各方陈述，标注一致点与矛盾点。",
          purpose: "核对陈述一致性与矛盾。",
          sourceHint: "询问笔录。",
          preservationRisk: null,
          priority: "low",
          priorityLabel: "低优先级",
          holdingStatus: "unknown",
          holdingStatusLabel: "情况不明",
        },
      ];
      const interviewItems: ReportInterviewPointItem[] = [
        {
          itemId: "iv-01",
          text: "围绕时间、地点、行为过程逐项询问，保留不确定表述。",
          role: "suspect",
          roleLabel: "违法嫌疑人",
          topic: "行为过程",
        },
        {
          itemId: "iv-02",
          text: "询问现场目击情况，避免诱导性或评价性提问。",
          role: "witness",
          roleLabel: "证人",
          topic: "目击情况",
        },
        {
          itemId: "iv-03",
          text: "核实报案经过、来源与可脱敏记录的联系方式。",
          role: "reporter",
          roleLabel: "报案人",
          topic: "报案经过",
        },
      ];
      const documentTasks: ReportDocumentTask[] = [
        {
          taskId: "task-reception-register",
          title: "受案登记",
          description: "受理行政案件后，可能需要制作受案登记，载明案件来源与受理时间。",
          procedureCategory: "administrative",
          procedureCategoryLabel: "行政程序",
          stageId: "reception_acceptance",
          stageLabel: "接报与受理",
          applicableRoles: ["办案民警", "值班民警"],
          caseTags: ["接报受理"],
          boundaryStatement: REPORT_DOCUMENT_TASK_BOUNDARY,
        },
        {
          taskId: "task-admin-inquiry",
          title: "询问笔录",
          description: "对违法嫌疑人或证人询问并固定陈述时，可能需要制作询问笔录。",
          procedureCategory: "administrative",
          procedureCategoryLabel: "行政程序",
          stageId: "investigation_evidence",
          stageLabel: "调查取证",
          applicableRoles: ["办案民警"],
          caseTags: ["调查取证"],
          boundaryStatement: REPORT_DOCUMENT_TASK_BOUNDARY,
        },
      ];
      const mode = reportMode;
      if (mode === "timeout") await delay(FIXTURE_TIMEOUT_DELAY_MS);
      if (mode === "critical_failure") throw new Error("报告生成边界返回结构错误。");
      if (mode === "empty") return {} as unknown as ReportGenerationResult;
      if (mode === "malformed") {
        return { status: "complete", headline: "", modules: [] } as unknown as ReportGenerationResult;
      }
      const insufficient = mode === "insufficient_facts";
      const conflicting = mode === "conflicting" || active.some((fact) => fact.status === "disputed");
      const unavailable = mode === "basis_unavailable" || basis === null;
      const partial = mode === "partial_failure";
      const status = unavailable ? "basis_unavailable" : conflicting ? "conflicting" : insufficient ? "insufficient_facts" : partial ? "partial_failure" : "complete";
      const usableStatus = unavailable ? "basis_unavailable" : conflicting ? "conflicting" : insufficient ? "insufficient_facts" : "present";
      const modules = [
        module("preliminary_qualification", usableStatus, [unavailable ? "当前有效法源不可用，停止形成主判断。" : conflicting ? "存在相互冲突的事实说法，保留多种可能。" : insufficient ? "确认事实不足，暂不能形成初步定性意见。" : "基于确认事实形成初步意见，仍需人工核验。"]),
        module("filing_conditions", usableStatus, ["受立案条件需结合正式案卷逐项核验。"]),
        module("evidence_checklist", partial ? "generation_failed" : "present", [partial ? "该模块暂未通过校验，未展示半成品。" : "核查相关客观证据、来源和固定时间。"], undefined, { evidenceItems: partial ? [] : evidenceItems }),
        module("interview_points", "present", ["按参与者角色分别询问，避免将多人多行为合并。"], undefined, { interviewItems }),
        module("enforcement_risks", "present", ["核查紧急风险、程序期限和告知送达记录。"]),
        module("legal_basis_trace", unavailable ? "basis_unavailable" : "present", [unavailable ? "没有可匹配的当前有效受治理法源。" : "每项判断均展示事实、条件、状态和法源链路。"]),
      ];
      const effectiveModules =
        mode === "contradiction"
          ? modules.map((item) =>
              item.id === "filing_conditions" ? { ...item, status: "basis_unavailable" as const } : item,
            )
          : mode === "unmatched_source"
            ? modules.map((item) =>
                item.traceLinks.length === 0
                  ? item
                  : {
                      ...item,
                      traceLinks: item.traceLinks.map((trace, index) =>
                        index === 0 && trace.basis !== null
                          ? { ...trace, basis: { ...trace.basis, sourceId: "source-does-not-exist" } }
                          : trace,
                      ),
                    },
              )
            : modules;
      const result: ReportGenerationResult = { status, headline: status === "complete" ? "存在可供核验的初步方向" : status === "conflicting" ? "存在多种可能，不能单一判断" : status === "insufficient_facts" ? "当前事实不足，需补充核验" : "当前不能形成受法源支持的主判断", participantBehaviorSummary: active.flatMap((fact) => fact.participantRefs.flatMap((participant) => fact.behaviorRefs.map((behavior) => ({ participant, behavior, factIds: [fact.factId], note: fact.statement })))), factLimitations: active.filter((fact) => fact.status !== "confirmed").map((fact) => `${fact.statement}（${fact.statusLabel}）`), modules: effectiveModules, documentTasks, contentReleaseId: "release-fixture-2026-08", workflowVersion: "report-fixture-v1" };
      return mode === "complete" && status === "complete" && request.caseFocusId === ASSAULT_FOCUS_ID
        ? buildAssaultReport(request, result)
        : result;
    },
  };

  const accidentLiability: NonNullable<Providers["accidentLiability"]> = {
    async consultAccidentLiability(request): Promise<AccidentLiabilityConsultOutput> {
      // slow 模式给浏览器黑盒测试留出观察等待弹窗与点击取消的时间。
      if (accidentMode === "slow") await delay(FIXTURE_ACCIDENT_SLOW_DELAY_MS);
      const officerTurns = request.turns.filter((turn) => turn.speaker === "officer").length;
      return request.forceReport || officerTurns >= 2
        ? { kind: "report", text: FIXTURE_ACCIDENT_REPORT }
        : { kind: "question", text: FIXTURE_ACCIDENT_QUESTION };
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
    async listTaskCandidates(request) {
      const context = store.eligibilityContext();
      const eligible = selectEligibleExamples(store.examples(), context);
      return selectTaskCandidates(eligible, request);
    },
    async resolveCaseFocus(facts, now) {
      const context = store.eligibilityContext(now ?? new Date());
      const resolution = resolveCaseFocusFromContent(store.caseFocuses(), facts, context);
      const genericSources = [...context.sources.values()]
        .filter((source) => source.status === "current")
        .map(toLegalSourceReference);
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
        unresolvedGapBranches: resolution.unresolvedGapBranches.map((branch) => ({
          ...branch,
          branches: branch.branches.map((path) => ({
            ...path,
            proceduralPath: [...path.proceduralPath],
            basis: path.basis === null ? null : { ...path.basis },
          })),
        })),
        legalSources: resolution.primary === null ? genericSources : resolution.legalSources,
      };
    },
  };

  return {
    analysis,
    content,
    accidentLiability,
    updateState: (patch) => {
      applyPatch(patch);
      return describe();
    },
    reset: () => {
      analysisAvailable = true;
      reportMode = "complete";
      extractionMode = "normal";
      store.reset();
      return describe();
    },
    describe,
  };
}
