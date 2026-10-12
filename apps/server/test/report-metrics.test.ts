import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { AnonymousTokenService } from "../src/security";
import { createMemoryTelemetrySink } from "../src/telemetry";
import { measureReport } from "../src/analysis/report-draft";

const tokenService = new AnonymousTokenService();
const headers = { "x-pm-contract-version": "1.0", "x-pm-anonymous-token": tokenService.issue().token };
// 不用“殴打”案情：它走确定性的殴打伤害报告（ADR-0009），内容量本就超过模型输出上限。
const TEXT = "4月1日，王某在商场偷窃一部手机，价值约三千元。";
const config: AppConfig = {
  host: "127.0.0.1", port: 0, providerMode: "fixture", enableTestControls: false, masterSwitch: true,
  analysisEnabled: true, documentsEnabled: true, staticDir: null,
  service: { provider: null, contact: null, dataProcessingStatement: null, technicalLoggingBoundary: [] },
};

describe("报告体量监控（ADR-0012/0013）", () => {
  it("measureReport 统计字符数，并只在超过上限时计入超限数", () => {
    const module = { items: ["a"], traceLinks: [], evidenceItems: [], interviewItems: [] };
    const report = { participantBehaviorSummary: [], factLimitations: ["x"], documentTasks: [], modules: [module, module] };
    const normal = measureReport(report);
    expect(normal.outputCharacters).toBe(JSON.stringify(report).length);
    expect(normal.capExceeded).toBe(0);
    const bloated = {
      ...report,
      factLimitations: Array.from({ length: 7 }, () => "x"),
      modules: [{ ...module, items: Array.from({ length: 9 }, () => "x") }, module],
    };
    expect(measureReport(bloated).capExceeded).toBe(2);
  });

  it("报告遥测带耗时、字符数、超限数，且不含案情正文", async () => {
    const telemetry = createMemoryTelemetrySink();
    const fixtures = createFixtureControls();
    const app = await buildApp({ config, fixtures, tokenService, telemetry });
    const created = await app.inject({ method: "POST", url: "/api/v1/analysis/sessions", headers, payload: { caseText: TEXT } });
    expect(created.statusCode).toBe(201);
    const event = telemetry.events.find((e) => e.kind === "analysis.report" && e.outcome === "ok");
    expect(event?.durationMs).toBeGreaterThanOrEqual(0);
    expect(event?.outputCharacters).toBeGreaterThan(0);
    expect(event?.capExceeded).toBe(0);
    expect(JSON.stringify(telemetry.events)).not.toContain("王某");
    await app.close();
  });
});
