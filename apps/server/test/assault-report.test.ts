import { describe, expect, it } from "vitest";
import type { GenerateReportRequest } from "@policymate/contracts";
import { makeHarness } from "./helpers/case-focus-scenario-harness";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const TEXT = "今天下午12:40张某报警称自己在江滨酒店被叶某打了叶某喝酒了。";

async function analyze(text = TEXT, harness = makeHarness()) {
  const [state] = await harness.engine.createSessions({ caseText: text }, NOW);
  const report = await harness.engine.generateReport(state.sessionId, {
    contractVersion: "1.0", requestId: "assault-report-test",
    snapshotVersion: state.snapshot.snapshotVersion,
    snapshotHash: state.snapshot.snapshotHash,
  } satisfies GenerateReportRequest, await harness.fixtures.content.listLegalSources!(), NOW,
  "release-trial-0001", (facts, now) => harness.fixtures.content.resolveCaseFocus!(facts, now));
  return { state, report };
}

function content(report: Awaited<ReturnType<typeof analyze>>["report"]) {
  return report.modules.map((module) => [module.summary, ...module.items,
    ...module.evidenceItems.map((item) => item.text),
    ...module.interviewItems.map((item) => item.text)].join("\n")).join("\n");
}

describe("殴打案首份报告：明确方向与可执行核验", () => {
  it("保留报警时间、酒店地点、单向被殴打表述和饮酒背景，不写成双方均实施殴打", async () => {
    const { state } = await analyze();
    const behavior = state.facts.find((fact) => fact.category === "behavior");
    expect(behavior?.statement).toContain("人员乙");
    expect(behavior?.statement).toContain("人员甲报警称自己");
    expect(behavior?.statement).toContain("被人员乙打了");
    expect(behavior?.statement).not.toContain("人员甲、人员乙实施了");
    expect(state.facts.find((fact) => fact.category === "time")?.value?.raw).toContain("12:40");
    expect(state.facts.some((fact) => fact.category === "background" && fact.statement.includes("饮酒"))).toBe(true);
  });

  it("伤情缺失时给出涉嫌殴打方向、受理调查建议及刑事转换条件，保留依据", async () => {
    const { report } = await analyze();
    expect(report.status).toBe("insufficient_facts");
    expect(report.headline).toContain("涉嫌殴打他人");
    const qualification = report.modules.find((module) => module.id === "preliminary_qualification")!;
    expect(qualification.status).toBe("insufficient_facts");
    expect(qualification.summary).toContain("涉嫌殴打他人");
    expect(qualification.items.join("\n")).toContain("不等于无伤情");
    expect(qualification.items.join("\n")).toContain("轻伤");
    expect(qualification.traceLinks.length).toBeGreaterThan(0);
    const filing = report.modules.find((module) => module.id === "filing_conditions")!;
    expect(filing.status).toBe("present");
    expect(filing.summary).toContain("建议及时受理");
    expect(filing.items.join("\n")).toContain("管辖");
    expect(report.modules.find((module) => module.id === "legal_basis_trace")?.status).toBe("present");
    expect(report.gapBranches.map((gap) => gap.gapId)).toContain("gap-injury");
    for (const trace of qualification.traceLinks) {
      expect(trace.factReferences.every((reference) => reference.confirmation === "system_extracted_unconfirmed")).toBe(true);
    }
    expect(content(report)).not.toMatch(/本案属于行政案件|无伤情、财物损失|未达到故意伤害罪刑事立案标准|应当拘留|建议拘留/);
  });

  it("取证指向酒店监控和伤情，询问采用开放问题，酒后处置写明条件", async () => {
    const { report } = await analyze();
    const evidence = report.modules.find((module) => module.id === "evidence_checklist")!;
    expect(evidence.evidenceItems.map((item) => item.text).join("\n")).toContain("江滨酒店");
    expect(evidence.evidenceItems.map((item) => item.text).join("\n")).toContain("伤情");
    expect(evidence.evidenceItems.every((item) => item.holdingStatus === "unknown")).toBe(true);
    const interview = report.modules.find((module) => module.id === "interview_points")!;
    expect(interview.interviewItems.map((item) => item.text).join("\n")).toContain("饮酒");
    expect(interview.interviewItems.map((item) => item.text).join("\n")).toContain("亲眼看到");
    const risks = report.modules.find((module) => module.id === "enforcement_risks")!;
    expect(risks.items.join("\n")).toContain("饮酒不等于醉酒失控");
    expect(risks.items.join("\n")).toContain("执法办案场所");
    expect(risks.items.join("\n")).toContain("十二小时");
    expect(risks.items.join("\n")).toContain("不能仅凭双方同意");
    const bases = report.modules.flatMap((module) => module.traceLinks).flatMap((trace) => trace.basis ?? []);
    expect(bases.some((basis) => basis.article === "第五十一条" && basis.minimalText.includes("一千元"))).toBe(true);
    expect(bases.some((basis) => basis.article === "第六十五条")).toBe(true);
    expect(bases.some((basis) => basis.article === "第九十七条")).toBe(true);
  });

  it("不同地点不会沿用酒店取证建议，未提到饮酒不增加酒后专属问题", async () => {
    const { report } = await analyze("张某在城南市场门口殴打李某，李某手部擦伤。");
    expect(content(report)).not.toContain("江滨酒店");
    expect(report.modules.find((module) => module.id === "evidence_checklist")?.evidenceItems[0].text).toContain("城南市场门口");
    expect(report.modules.find((module) => module.id === "interview_points")?.interviewItems.map((item) => item.text).join("\n")).not.toContain("饮酒");
  });

  it("达到轻伤的输入保留刑事方向，不自动按治安结案", async () => {
    const { report } = await analyze("张某在城南市场殴打李某。经鉴定李某轻伤二级。");
    expect(report.headline).toContain("故意伤害");
    expect(content(report)).toContain("刑事");
    expect(content(report)).not.toContain("本案属于行政案件");
    expect(report.documentTasks).toHaveLength(0);
  });

  it("否定表述不反转为轻伤或饮酒，仍保留原文关系", async () => {
    const { state, report } = await analyze("张某在城南市场殴打李某。经鉴定李某未达到轻伤。叶某未饮酒。");
    expect(report.headline).not.toContain("涉嫌故意伤害");
    expect(state.facts.find((fact) => fact.category === "result")?.value?.raw).toBe("未达到轻伤");
    expect(state.facts.some((fact) => fact.category === "background")).toBe(false);
    expect(report.modules.find((module) => module.id === "interview_points")?.interviewItems.map((item) => item.text).join("\n")).not.toContain("饮酒");
  });

  it("争议、重点案情禁用和生成失败不能被详细报告绕过", async () => {
    const disputed = await analyze("张某在城南市场殴打李某。李某称轻伤，张某称轻微伤。");
    expect(disputed.report.status).toBe("conflicting");
    const disabled = makeHarness();
    disabled.fixtures.updateState({ caseFocusStatusAll: "withdrawn" });
    const { report } = await analyze(TEXT, disabled);
    expect(report.status).toBe("basis_unavailable");
    expect(report.modules.every((module) => module.traceLinks.length === 0)).toBe(true);
    expect(content(report)).not.toContain("涉嫌殴打他人");
    const failure = makeHarness();
    failure.fixtures.updateState({ reportMode: "critical_failure" });
    await expect(analyze(TEXT, failure)).rejects.toThrow();
  });
});
