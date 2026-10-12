import { describe, expect, it, vi } from "vitest";
import { createDifyProvider } from "../src/providers/dify";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { AnalysisEngine } from "../src/analysis/engine";
import type { ReportDraft, ReportGenerationRequest, ReportGenerationResult } from "../src/providers/types";
import { hydrateReportDraft, toReportDraft } from "../src/analysis/report-draft";

const config = (): AppConfig => ({
  ...loadConfig({}), providerMode: "dify", enableTestControls: false,
  difyBaseUrl: "https://dify.test/v1", difyApiKey: "private-test-key",
  difyWorkflowVersion: "workflow-test-v1", staticDir: null,
});
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

function transportReturning(draftFor: (request: ReportGenerationRequest) => Promise<unknown>) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).inputs.payload_json);
    const { payload, operation, ...metadata } = input;
    expect(operation).toBe("report");
    return Response.json({ data: { status: "succeeded", outputs: { result: { ...metadata, result: await draftFor(payload) } } } });
  });
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

  it("Dify 提供者接收草稿并返回补全后的完整报告", async () => {
    const request = await requestForReport();
    const full = await fullReport(request);
    const provider = createDifyProvider(config(), { fetchImpl: transportReturning(async () => toReportDraft(full)) });
    const report = await provider.generateReport!(request);
    expect(report.modules).toHaveLength(6);
    expect(report.workflowVersion).toBe("workflow-test-v1");
    expect(report.contentReleaseId).toBe(request.contentReleaseId);
    expect(report.modules.flatMap((module) => module.traceLinks).some((trace) => trace.basis?.minimalText)).toBe(true);
  });

  it("Dify 提供者拒绝仍带完整法条回抄的旧格式输出", async () => {
    const request = await requestForReport();
    const full = await fullReport(request);
    const provider = createDifyProvider(config(), { fetchImpl: transportReturning(async () => full) });
    await expect(provider.generateReport!(request)).rejects.toThrow();
  });
});
