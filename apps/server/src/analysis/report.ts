import type {
  AnalysisReport,
  AnalysisSessionState,
  CandidateFact,
  LegalSourceReference,
  ReportModule,
  ReportModuleId,
  ReportStatus,
  ReportTraceLink,
} from "@policymate/contracts";
import { CONTRACT_VERSION, REPORT_MODULE_LABELS, REPORT_STATUS_LABELS } from "@policymate/contracts";
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

function validTrace(trace: ReportTraceLink, facts: ReadonlySet<string>, sources: ReadonlyMap<string, LegalSourceReference>): boolean {
  if (trace.factIds.length === 0 || trace.factIds.some((id) => !facts.has(id))) return false;
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
  const facts = new Set(session.facts.filter((fact) => !fact.excluded && fact.status === "confirmed").map((fact) => fact.factId));
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
  }
  const hasBasis = legalSources.some(validSource);
  if (result.status === "complete" && !hasBasis) throw new Error("主判断缺少当前有效法源。");
  if (result.status === "complete" && session.gaps.length > 0) throw new Error("存在决定性事实缺口时不能形成完整主判断。");
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
    snapshotVersion: session.snapshot?.snapshotVersion ?? 0,
    snapshotHash: session.snapshot?.snapshotHash ?? "",
    contentReleaseId: releaseId || result.contentReleaseId,
    workflowVersion: result.workflowVersion,
    modules: result.modules,
  };
}

export { MODULE_IDS };
