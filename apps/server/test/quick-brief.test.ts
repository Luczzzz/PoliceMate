import { describe, expect, it } from "vitest";
import type { ReportGenerationResult } from "../src/providers/types";
import { AnalysisEngine } from "../src/analysis/engine";
import { attachReportFactReferences, validateReportResult } from "../src/analysis/report";
import { createFixtureControls } from "../src/providers/fixture";

const fixtures = createFixtureControls();
const text = "4月1日晚，张某酒后在路边殴打李某，李某头部流血，伤情未查。";

async function baseline() {
  const [state] = await new AnalysisEngine(fixtures.analysis).createSessions({ caseText: text });
  const resolution = await fixtures.content.resolveCaseFocus!(state.facts);
  const generated = await fixtures.analysis.generateReport!({
    facts: state.facts, snapshot: state.snapshot, legalSources: resolution.legalSources,
    caseFocusId: resolution.caseFocusId, contentReleaseId: "release-trial-0001",
  });
  const result = attachReportFactReferences(generated, state.facts);
  return { state, sources: resolution.legalSources, result };
}

const brief = (over: Record<string, unknown> = {}) => ({
  bottomLine: "像是酒后打人致伤（涉嫌殴打他人/故意伤害），伤情未查清，决定走治安还是刑事。",
  nextSteps: [
    { plain: "先送医并留好病历", legal: "固定伤情，为鉴定做准备", targetModule: "evidence_checklist" },
    { plain: "调取路边监控", legal: null, targetModule: "evidence_checklist" },
    { plain: "分别问双方谁先动手", legal: null, targetModule: "interview_points" },
  ],
  branchCards: [{ condition: "鉴定为轻伤及以上", outcome: "转刑事立案方向", legal: "故意伤害罪" }],
  ...over,
});
const withBrief = (result: ReportGenerationResult, quickBrief: unknown) =>
  ({ ...result, quickBrief }) as unknown as ReportGenerationResult;

describe("研判速览校验（ADR-0011）", () => {
  it("合规的速览通过校验；不带速览的旧结果也通过", async () => {
    const { state, sources, result } = await baseline();
    expect(() => validateReportResult(withBrief(result, brief()), state, sources)).not.toThrow();
    expect(() => validateReportResult(result, state, sources)).not.toThrow();
  });

  it.each([
    ["bottomLine 为空", { bottomLine: "  " }],
    ["bottomLine 超过 60 字", { bottomLine: "打".repeat(61) }],
    ["动作少于 3 条", { nextSteps: brief().nextSteps.slice(0, 2) }],
    ["动作多于 5 条", { nextSteps: Array.from({ length: 6 }, () => brief().nextSteps[0]) }],
    ["动作 plain 为空", { nextSteps: [{ ...brief().nextSteps[0], plain: "" }, ...brief().nextSteps.slice(1)] }],
    ["动作 plain 超过 30 字", { nextSteps: [{ ...brief().nextSteps[0], plain: "查".repeat(31) }, ...brief().nextSteps.slice(1)] }],
    ["动作锚点不是报告模块", { nextSteps: [{ ...brief().nextSteps[0], targetModule: "nowhere" }, ...brief().nextSteps.slice(1)] }],
    ["分支卡片多于 3 张", { branchCards: Array.from({ length: 4 }, () => brief().branchCards[0]) }],
    ["分支卡片白话条件为空", { branchCards: [{ condition: "", outcome: "转刑事", legal: null }] }],
  ])("%s 时拒绝", async (_name, over) => {
    const { state, sources, result } = await baseline();
    expect(() => validateReportResult(withBrief(result, brief(over)), state, sources)).toThrow();
  });
});

import type { GenerateReportRequest } from "@policymate/contracts";
import { applyConservativeDowngrade, buildReport } from "../src/analysis/report";
import { makeHarness } from "./helpers/case-focus-scenario-harness";

describe("研判速览随报告状态降级（ADR-0011 / Q13）", () => {
  it("正常状态原样进入报告；旧结果无速览时报告也没有，不补造", async () => {
    const { state, result } = await baseline();
    const b = brief() as unknown as NonNullable<ReportGenerationResult["quickBrief"]>;
    expect(buildReport(state, "r1", "2026-10-01T00:00:00Z", { ...result, quickBrief: b }, "rel").quickBrief).toEqual(b);
    expect(buildReport(state, "r2", "2026-10-01T00:00:00Z", { ...result, quickBrief: undefined }, "rel").quickBrief).toBeUndefined();
  });

  it.each(["basis_unavailable", "conflicting"] as const)("非保留降级（%s）不显示速览", async (status) => {
    const { result } = await baseline();
    const b = brief() as unknown as NonNullable<ReportGenerationResult["quickBrief"]>;
    const downgraded = applyConservativeDowngrade({ ...result, quickBrief: b }, status, []);
    expect(downgraded.quickBrief).toBeUndefined();
  });

  it("条件不足且保留可执行内容时，一句话改写为“现在还不能下结论，因为…”，动作与分支保留", async () => {
    const { result } = await baseline();
    const b = brief() as unknown as NonNullable<ReportGenerationResult["quickBrief"]>;
    const downgraded = applyConservativeDowngrade({ ...result, status: "complete", quickBrief: b }, "insufficient_facts", [], { preserveActionableContent: true });
    expect(downgraded.quickBrief?.bottomLine.startsWith("现在还不能下结论，因为")).toBe(true);
    expect(downgraded.quickBrief?.nextSteps).toEqual(b.nextSteps);
    expect(downgraded.quickBrief?.branchCards).toEqual(b.branchCards);
  });

  it("部分失败时丢弃锚点指向失败模块的动作；剩余不足 3 条则整体不显示速览", async () => {
    const { state, result } = await baseline();
    const b = brief() as unknown as NonNullable<ReportGenerationResult["quickBrief"]>;
    const failed = (id: string) => ({
      ...result, status: "partial_failure" as const, quickBrief: b,
      modules: result.modules.map((m) => (m.id === id ? { ...m, status: "generation_failed" as const } : m)),
    });
    const build = (r: ReportGenerationResult) => buildReport(state, "r3", "2026-10-01T00:00:00Z", r, "rel").quickBrief;
    expect(build(failed("interview_points"))).toBeUndefined();
    const five = { ...b, nextSteps: [...b.nextSteps, b.nextSteps[0], b.nextSteps[1]] };
    const kept = build({ ...failed("interview_points"), quickBrief: five });
    expect(kept?.nextSteps.every((s) => s.targetModule !== "interview_points")).toBe(true);
    expect(kept?.nextSteps).toHaveLength(4);
  });
});

describe("殴打伤害案例的研判速览（Q12 样例）", () => {
  it("伤情未查：一句话先说明不能下结论，动作可执行并带锚点，分支不超过 3 张", async () => {
    const harness = makeHarness();
    const [state] = await harness.engine.createSessions({ caseText: "今天下午12:40张某报警称自己在江滨酒店被叶某打了叶某喝酒了。" }, new Date("2026-10-01T00:00:00Z"));
    const report = await harness.engine.generateReport(state.sessionId, {
      contractVersion: "1.0", requestId: "qb-assault",
      snapshotVersion: state.snapshot.snapshotVersion, snapshotHash: state.snapshot.snapshotHash,
    } satisfies GenerateReportRequest, await harness.fixtures.content.listLegalSources!(), new Date("2026-10-01T00:00:00Z"),
    "release-trial-0001", (facts, now) => harness.fixtures.content.resolveCaseFocus!(facts, now));
    const quick = report.quickBrief!;
    expect(quick.bottomLine.startsWith("现在还不能下结论，因为")).toBe(true);
    expect(quick.bottomLine).toContain("伤情");
    expect(quick.nextSteps.length).toBeGreaterThanOrEqual(3);
    expect(quick.nextSteps.length).toBeLessThanOrEqual(5);
    expect(quick.nextSteps.some((s) => /监控/.test(s.plain) && s.targetModule === "evidence_checklist")).toBe(true);
    expect(quick.branchCards.length).toBeGreaterThan(0);
    expect(quick.branchCards.length).toBeLessThanOrEqual(3);
    expect(quick.branchCards.some((c) => /轻伤/.test(c.condition) && /刑事/.test(c.outcome))).toBe(true);
    expect(JSON.stringify(quick)).not.toMatch(/拘留|罚款|日以下/);
  });
});
