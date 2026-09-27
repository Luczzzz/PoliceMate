import type { EntryAvailability, ProductShellResponse } from "@policymate/contracts";
import type { Providers } from "./providers/types";

/**
 * 面向民警的入口不可用原因。原因必须说明影响方向，不得暴露内部服务名、
 * 模型名、堆栈或密钥。
 */
export const UNAVAILABLE_REASONS = {
  trialPaused: "受控试行当前已暂停",
  analysisDisabled: "案情分析入口已临时停用",
  analysisService: "分析服务暂不可用，请稍后再试",
  documentsDisabled: "文书范例入口已临时停用",
  noVerifiedExamples: "当前没有可用的已核验文书范例",
} as const;

export interface CapabilityConfig {
  masterSwitch: boolean;
  analysisEnabled: boolean;
  documentsEnabled: boolean;
}

/** 计算两个入口可用性所需的全部输入。 */
export interface CapabilityInputs extends CapabilityConfig {
  difyAvailable: boolean;
  difyUnavailableReason: string | null;
  eligibleExampleCount: number;
}

/**
 * 从外部边界提供者读取可用性输入。这是唯一允许决定入口可用性的数据来源，
 * 页面不得根据文案、URL 或点击结果推断。
 */
export async function loadCapabilityInputs(
  config: CapabilityConfig,
  providers: Providers,
): Promise<CapabilityInputs> {
  const [dify, release] = await Promise.all([
    providers.dify.getAvailability(),
    providers.content.getActiveRelease(),
  ]);

  return {
    masterSwitch: config.masterSwitch,
    analysisEnabled: config.analysisEnabled,
    documentsEnabled: config.documentsEnabled,
    difyAvailable: dify.available,
    difyUnavailableReason: dify.reason,
    eligibleExampleCount: release.eligibleExampleCount,
  };
}

export function resolveCaseAnalysisAvailability(inputs: CapabilityInputs): EntryAvailability {
  if (!inputs.masterSwitch) {
    return { available: false, reason: UNAVAILABLE_REASONS.trialPaused };
  }
  if (!inputs.analysisEnabled) {
    return { available: false, reason: UNAVAILABLE_REASONS.analysisDisabled };
  }
  if (!inputs.difyAvailable) {
    return {
      available: false,
      reason: inputs.difyUnavailableReason ?? UNAVAILABLE_REASONS.analysisService,
    };
  }
  return { available: true, reason: null };
}

export function resolveDocumentExamplesAvailability(inputs: CapabilityInputs): EntryAvailability {
  if (!inputs.masterSwitch) {
    return { available: false, reason: UNAVAILABLE_REASONS.trialPaused };
  }
  if (!inputs.documentsEnabled) {
    return { available: false, reason: UNAVAILABLE_REASONS.documentsDisabled };
  }
  if (inputs.eligibleExampleCount < 1) {
    return { available: false, reason: UNAVAILABLE_REASONS.noVerifiedExamples };
  }
  return { available: true, reason: null };
}

/**
 * 文书范例正文是否允许检索与打开。总开关或入口开关关闭时必须失败关闭：
 * 只让首页入口卡片降级不足以保证旧链接无法访问正文。
 */
export function isDocumentRetrievalEnabled(config: CapabilityConfig): boolean {
  return config.masterSwitch && config.documentsEnabled;
}

export function buildProductShell(
  inputs: CapabilityInputs,
  contractVersion: string,
  generatedAt: Date = new Date(),
): ProductShellResponse {
  return {
    contractVersion,
    generatedAt: generatedAt.toISOString(),
    entries: {
      caseAnalysis: resolveCaseAnalysisAvailability(inputs),
      documentExamples: resolveDocumentExamplesAvailability(inputs),
    },
  };
}
