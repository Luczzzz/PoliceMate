import { describe, expect, it } from "vitest";
import { createFixtureControls } from "../src/providers/fixture";
import { AnalysisEngine } from "../src/analysis/engine";
import type { ReportDraft, ReportGenerationRequest, ReportGenerationResult } from "../src/providers/types";
import { hydrateReportDraft, toReportDraft } from "../src/analysis/report-draft";

const fixtures = createFixtureControls();
const text = "4月1日，张某在酒店殴打李某。";

async function requestForReport(): Promise<ReportGenerationRequest> {
  const [state] = await new AnalysisEngine(fixtures.analysis).createSessions({ caseText: text });
  const resolution = await fixtures.content.resolveCaseFocus!(state.facts);
  return { facts: state.facts, snapshot: state.snapshot, legalSources: resolution.legalSources, caseFocusId: resolution.caseFocusId, contentReleaseId: "release-trial-0001" };
}

/** 完整报告中只保留 ADR-0013 规定模型要写的部分，其余一律由后端补全。 */
async function fullReport(request: ReportGenerationRequest): Promise<ReportGenerationResult> {
  const full = await fixtures.analysis.generateReport!(request);
  return { ...full, workflowVersion: "workflow-test-v1", contentReleaseId: request.contentReleaseId! };
}

describe("报告草稿补全（ADR-0013）", () => {
  it("草稿不含标签、法条回抄、文书固定字段和封装元数据", async () => {
    const request = await requestForReport();
    const draft = toReportDraft(await fullReport(request));
    const json = JSON.stringify(draft);
    for (const dropped of ["categoryLabel", "priorityLabel", "holdingStatusLabel", "procedureCategoryLabel", "stageLabel", "boundaryStatement", "issuingAuthority", "minimalText", "contentReleaseId", "workflowVersion", "factReferences"]) {
      expect(json).not.toContain(dropped);
    }
    expect(draft.modules.map((module) => "label" in module)).not.toContain(true);
    expect(json.length).toBeLessThan(JSON.stringify(await fullReport(request)).length);
  });

  it("补全后与完整报告逐字段一致", async () => {
    const request = await requestForReport();
    const full = await fullReport(request);
    const hydrated = hydrateReportDraft(toReportDraft(full), {
      facts: request.facts, legalSources: request.legalSources,
      contentReleaseId: request.contentReleaseId!, workflowVersion: "workflow-test-v1",
    });
    const expected = { ...full, modules: full.modules.map((module) => ({ ...module, traceLinks: module.traceLinks.map((trace) => ({ ...trace, factReferences: [] })) })) };
    expect(hydrated).toEqual(expected);
  });

  it("引用不存在的法源或条号时失败关闭", async () => {
    const request = await requestForReport();
    const draft = toReportDraft(await fullReport(request));
    const bad = structuredClone(draft) as ReportDraft;
    const trace = bad.modules.flatMap((module) => module.traceLinks).find((link) => link.basis !== null)!;
    trace.basis = { sourceId: "no-such-source", article: "第一条" };
    expect(() => hydrateReportDraft(bad, { facts: request.facts, legalSources: request.legalSources, contentReleaseId: "r", workflowVersion: "w" })).toThrow("法源");
    trace.basis = { sourceId: request.legalSources[0].sourceId, article: "不存在的条号" };
    expect(() => hydrateReportDraft(bad, { facts: request.facts, legalSources: request.legalSources, contentReleaseId: "r", workflowVersion: "w" })).toThrow("条号");
  });
});
