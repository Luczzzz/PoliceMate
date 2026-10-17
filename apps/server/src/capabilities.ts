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
  streamUnsupported: "当前分析服务不支持流式输出，请联系维护者调整配置",
  noVerifiedExamples: "当前没有可用的已核验文书范例",
  accidentLiabilityDisabled: "交通事故责任认定入口已临时停用",
  accidentLiabilityUnsupported: "当前分析服务不支持多轮问答，请联系维护者调整配置",
} as const;

export interface CapabilityConfig {
  masterSwitch: boolean;
  analysisEnabled: boolean;
  documentsEnabled: boolean;
  /** 交通事故责任认定辅助开关；未显式配置时默认开启。 */
  accidentLiabilityEnabled?: boolean;
}

/** 计算各入口可用性所需的全部输入。 */
export interface CapabilityInputs extends CapabilityConfig {
  analysisAvailable: boolean;
  analysisUnavailableReason: string | null;
  eligibleExampleCount: number;
  /** 当前外部边界是否实现了多轮问答；未实现时该入口失败关闭。 */
  accidentLiabilitySupported?: boolean;
}

/**
 * 从外部边界提供者读取可用性输入。这是唯一允许决定入口可用性的数据来源，
 * 页面不得根据文案、URL 或点击结果推断。
 */
export async function loadCapabilityInputs(
  config: CapabilityConfig,
  providers: Providers,
): Promise<CapabilityInputs> {
  const [analysis, release] = await Promise.all([
    providers.analysis.getAvailability(),
    providers.content.getActiveRelease(),
  ]);

  return {
    masterSwitch: config.masterSwitch,
    analysisEnabled: config.analysisEnabled,
    documentsEnabled: config.documentsEnabled,
    accidentLiabilityEnabled: config.accidentLiabilityEnabled ?? true,
    analysisAvailable: analysis.available,
    analysisUnavailableReason: analysis.reason,
    eligibleExampleCount: release.eligibleExampleCount,
    accidentLiabilitySupported: providers.accidentLiability?.consultAccidentLiability !== undefined,
  };
}

export function resolveCaseAnalysisAvailability(inputs: CapabilityInputs): EntryAvailability {
  if (!inputs.masterSwitch) {
    return { available: false, reason: UNAVAILABLE_REASONS.trialPaused };
  }
  if (!inputs.analysisEnabled) {
    return { available: false, reason: UNAVAILABLE_REASONS.analysisDisabled };
  }
  if (!inputs.analysisAvailable) {
    return {
      available: false,
      reason: inputs.analysisUnavailableReason ?? UNAVAILABLE_REASONS.analysisService,
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
 * 交通事故责任认定辅助入口可用性。总开关、入口开关、边界是否支持多轮问答
 * 以及分析服务可用性都满足时才开放；任一不满足都失败关闭。
 */
export function resolveAccidentLiabilityAvailability(inputs: CapabilityInputs): EntryAvailability {
  if (!inputs.masterSwitch) {
    return { available: false, reason: UNAVAILABLE_REASONS.trialPaused };
  }
  if (inputs.accidentLiabilityEnabled === false) {
    return { available: false, reason: UNAVAILABLE_REASONS.accidentLiabilityDisabled };
  }
  if (inputs.accidentLiabilitySupported !== true) {
    return { available: false, reason: UNAVAILABLE_REASONS.accidentLiabilityUnsupported };
  }
  if (!inputs.analysisAvailable) {
    return {
      available: false,
      reason: inputs.analysisUnavailableReason ?? UNAVAILABLE_REASONS.analysisService,
    };
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
  reportFormat: ProductShellResponse["reportFormat"] = "structured",
): ProductShellResponse {
  return {
    contractVersion,
    generatedAt: generatedAt.toISOString(),
    entries: {
      caseAnalysis: resolveCaseAnalysisAvailability(inputs),
      documentExamples: resolveDocumentExamplesAvailability(inputs),
      accidentLiability: resolveAccidentLiabilityAvailability(inputs),
    },
    reportFormat,
  };
}
