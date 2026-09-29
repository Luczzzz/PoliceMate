import { describe, expect, it } from "vitest";
import { loadConfig, resolveRuntimeConfig, type AppConfig } from "../src/config";
import {
  HIGH_RISK_CASE_TAG,
  REQUIRED_DOCUMENT_EXAMPLE_STAGES,
} from "../src/content/document-example-content";
import { REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS } from "../src/content/property-economic-content";
import { REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS } from "../src/content/public-order-drug-content";
import { REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS } from "../src/content/family-minor-content";
import { createFixtureControls } from "../src/providers/fixture";
import { runAcceptanceDrills } from "../src/acceptance/drills";
import { MANUAL_ACCEPTANCE_RECORDS } from "../src/acceptance/evidence";
import {
  TRIAL_DECISION_RECORDS,
  TRIAL_DECISION_BOUNDARY,
  type TrialDecisionRecord,
} from "../src/acceptance/decisions";
import { runReleaseAcceptance, type ReleaseAcceptanceInput } from "../src/acceptance/release-acceptance";
import type { ReleaseCheckInput } from "../src/release-check";
import { buildAcceptanceIndex } from "./helpers/acceptance-index";

/**
 * 受控试行发布检查编排。
 *
 * 验证硬门槛全部通过时放行、任一硬门槛失败时明确阻断，且结果可复现。
 */

const RELEASE_ID = "release-trial-0001";

function trialConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    providerMode: "fixture",
    enableTestControls: false,
    masterSwitch: true,
    analysisEnabled: true,
    documentsEnabled: true,
    staticDir: null,
    service: {
      provider: "松阳县公安局",
      contact: "试行联系人 0578-0000000",
      dataProcessingStatement: "仅用于本次受控试行的功能验证，不用于训练。",
      technicalLoggingBoundary: ["云主机负载均衡可能记录不含请求体的访问元数据。"],
    },
    allowedOrigins: ["https://trial.example"],
    ...overrides,
  };
}

async function releaseCheckInput(): Promise<ReleaseCheckInput> {
  const fixtures = createFixtureControls();
  const index = await fixtures.content.listExamples();
  const state = fixtures.describe();
  const config = trialConfig();
  return {
    config,
    runtime: resolveRuntimeConfig(config),
    eligibleExampleCount: index.items.length,
    documentExampleCoverage: {
      requiredStages: REQUIRED_DOCUMENT_EXAMPLE_STAGES,
      eligibleStages: index.items.map((item) => item.stageId),
      requiredHighRiskCount: 1,
      eligibleHighRiskCount: index.items.filter((item) => item.caseTags.includes(HIGH_RISK_CASE_TAG))
        .length,
    },
    caseFocusCoverage: {
      required: [
        ...REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS,
        ...REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS,
        ...REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS,
      ],
      eligible: state.caseFocuses.filter((item) => item.eligible).map((item) => item.caseFocusId),
    },
  };
}

async function acceptanceInput(
  overrides: Partial<ReleaseAcceptanceInput> = {},
): Promise<ReleaseAcceptanceInput> {
  return {
    releaseCheck: await releaseCheckInput(),
    releaseId: RELEASE_ID,
    index: buildAcceptanceIndex(),
    drills: await runAcceptanceDrills(),
    generatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("受控试行发布检查", () => {
  it("全部硬门槛通过且不要求真实设备记录时放行", async () => {
    const report = runReleaseAcceptance(
      await acceptanceInput({ requireManualEvidence: false }),
    );
    expect(report.ok).toBe(true);
    expect(report.blocked).toBe(false);
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.scenarios).toHaveLength(34);
    expect(report.drills).toHaveLength(15);
  });

  it("默认要求真实设备/浏览器记录，未完成时阻断发布", async () => {
    const report = runReleaseAcceptance(await acceptanceInput());
    expect(report.ok).toBe(false);
    expect(report.blocked).toBe(true);
    const manual = report.checks.find((check) => check.id === "gate-manual-evidence");
    expect(manual?.passed).toBe(false);
    expect(manual?.detail).toContain("browser-ios-safari");
  });

  it("内容门槛失败时明确阻断并保留失败原因", async () => {
    const base = await releaseCheckInput();
    const report = runReleaseAcceptance(
      await acceptanceInput({
        requireManualEvidence: false,
        releaseCheck: { ...base, eligibleExampleCount: 1 },
      }),
    );
    expect(report.blocked).toBe(true);
    const gate = report.checks.find((check) => check.id === "gate-release-readiness");
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain("合格文书范例");
  });

  it("场景缺失时验收矩阵门槛阻断发布", async () => {
    const report = runReleaseAcceptance(
      await acceptanceInput({
        requireManualEvidence: false,
        scenarios: (await import("../src/acceptance/scenarios")).ACCEPTANCE_SCENARIOS.slice(0, -1),
      }),
    );
    const gate = report.checks.find((check) => check.id === "gate-acceptance-coverage");
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain("AC-34");
    expect(report.blocked).toBe(true);
  });

  it("演练缺失或失败时阻断发布", async () => {
    const report = runReleaseAcceptance(
      await acceptanceInput({
        requireManualEvidence: false,
        drills: (await runAcceptanceDrills()).slice(0, -1),
      }),
    );
    const gate = report.checks.find((check) => check.id === "gate-drills");
    expect(gate?.passed).toBe(false);
    expect(report.blocked).toBe(true);
  });

  it("把发布决定表述为已正式审定时阻断发布", async () => {
    const tampered: TrialDecisionRecord[] = TRIAL_DECISION_RECORDS.map((record) =>
      record.id === "trial-release-decision"
        ? {
            ...record,
            statement: "本系统已经正式审定，可以直接上线。",
            boundary: TRIAL_DECISION_BOUNDARY,
          }
        : record,
    );
    const report = runReleaseAcceptance(
      await acceptanceInput({ requireManualEvidence: false, decisions: tampered }),
    );
    const gate = report.checks.find((check) => check.id === "gate-trial-decisions");
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain("正式审定");
    expect(report.blocked).toBe(true);
  });

  it("缺少服务信息时发布检查阻断（默认加载的配置）", async () => {
    const config = loadConfig({});
    const report = runReleaseAcceptance({
      releaseCheck: { config, runtime: resolveRuntimeConfig(config), eligibleExampleCount: 6 },
      releaseId: RELEASE_ID,
      index: buildAcceptanceIndex(),
      drills: await runAcceptanceDrills(),
      requireManualEvidence: false,
    });
    expect(report.blocked).toBe(true);
  });

  it("检查结果是可复现的：相同输入产生相同结果", async () => {
    const input = await acceptanceInput({ requireManualEvidence: false });
    const first = runReleaseAcceptance(input);
    const second = runReleaseAcceptance(input);
    const normalize = (report: typeof first) => JSON.stringify({ ...report, generatedAt: "" });
    expect(normalize(first)).toBe(normalize(second));
  });

  it("人工验收记录覆盖真实设备、屏幕阅读器与真实网络", () => {
    const manualIds = MANUAL_ACCEPTANCE_RECORDS.filter((record) => record.method === "manual").map(
      (record) => record.id,
    );
    expect(manualIds).toEqual(
      expect.arrayContaining(["browser-ios-safari", "a11y-device-assistive-tech", "performance-real-device-4g"]),
    );
    for (const record of MANUAL_ACCEPTANCE_RECORDS.filter((item) => item.method === "manual")) {
      expect(record.result, `${record.id} 不应被伪造为通过`).toBe("not_run");
    }
  });
});
