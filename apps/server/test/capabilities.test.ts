import { describe, expect, it } from "vitest";
import {
  UNAVAILABLE_REASONS,
  buildProductShell,
  resolveCaseAnalysisAvailability,
  resolveDocumentExamplesAvailability,
  type CapabilityInputs,
} from "../src/capabilities";

const allAvailable: CapabilityInputs = {
  masterSwitch: true,
  analysisEnabled: true,
  documentsEnabled: true,
  difyAvailable: true,
  difyUnavailableReason: null,
  eligibleExampleCount: 3,
};

describe("入口可用性", () => {
  it("默认情况下两个入口都可用，且不显示不可用原因", () => {
    expect(resolveCaseAnalysisAvailability(allAvailable)).toEqual({
      available: true,
      reason: null,
    });
    expect(resolveDocumentExamplesAvailability(allAvailable)).toEqual({
      available: true,
      reason: null,
    });
  });

  it("总开关关闭时两个入口都不可用", () => {
    const inputs = { ...allAvailable, masterSwitch: false };
    const expected = { available: false, reason: UNAVAILABLE_REASONS.trialPaused };

    expect(resolveCaseAnalysisAvailability(inputs)).toEqual(expected);
    expect(resolveDocumentExamplesAvailability(inputs)).toEqual(expected);
  });

  it("案情分析禁用时文书范例保持可用", () => {
    const inputs = { ...allAvailable, analysisEnabled: false };

    expect(resolveCaseAnalysisAvailability(inputs)).toEqual({
      available: false,
      reason: UNAVAILABLE_REASONS.analysisDisabled,
    });
    expect(resolveDocumentExamplesAvailability(inputs).available).toBe(true);
  });

  it("Dify 不可用时代理提供者给出的原因", () => {
    const inputs = {
      ...allAvailable,
      difyAvailable: false,
      difyUnavailableReason: "上游分析服务连接失败",
    };

    expect(resolveCaseAnalysisAvailability(inputs)).toEqual({
      available: false,
      reason: "上游分析服务连接失败",
    });
    expect(resolveDocumentExamplesAvailability(inputs).available).toBe(true);
  });

  it("提供者未给出原因时回落为通用分析服务原因", () => {
    const inputs = { ...allAvailable, difyAvailable: false };

    expect(resolveCaseAnalysisAvailability(inputs).reason).toBe(
      UNAVAILABLE_REASONS.analysisService,
    );
  });

  it("当前批次没有合格范例时文书范例不可用，案情分析不受影响", () => {
    const inputs = { ...allAvailable, eligibleExampleCount: 0 };

    expect(resolveDocumentExamplesAvailability(inputs)).toEqual({
      available: false,
      reason: UNAVAILABLE_REASONS.noVerifiedExamples,
    });
    expect(resolveCaseAnalysisAvailability(inputs).available).toBe(true);
  });
});

describe("产品外壳响应", () => {
  it("携带契约版本与生成时间，并按能力汇总入口", () => {
    const generatedAt = new Date("2026-01-02T03:04:05.000Z");
    const shell = buildProductShell(allAvailable, "1.0", generatedAt);

    expect(shell.contractVersion).toBe("1.0");
    expect(shell.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(Object.keys(shell.entries).sort()).toEqual(["caseAnalysis", "documentExamples"]);
  });
});
