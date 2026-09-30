import type { DataUseServiceInfo } from "@policymate/contracts";
import type { AppConfig, ResolvedRuntimeConfig } from "./config";

/**
 * 受控试行发布检查。
 *
 * 发布检查必须在存在占位值、缺少实际服务信息或缺少最低文书范例覆盖时失败。
 * 它只检查可机械核验的门槛；内容与场景覆盖由内容维护者和产品负责人分别确认。
 */

/** 明显占位或虚构的主体/说明文本。 */
const PLACEHOLDER_PATTERN =
  /待填写|待补|待定|占位|示例公司|测试主体|某公司|placeholder|example\.com|xxx|todo|tbd/i;

export function isPlaceholderValue(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  if (value.trim() === "") return true;
  return PLACEHOLDER_PATTERN.test(value);
}

export interface DataUseCheckResult {
  failures: string[];
}

/** 使用与数据说明必须填写实际服务主体、联系人、数据处理说明和技术日志边界。 */
export function checkDataUseReadiness(service: DataUseServiceInfo): DataUseCheckResult {
  const failures: string[] = [];
  if (isPlaceholderValue(service.provider)) {
    failures.push("使用与数据说明缺少实际服务提供者（或仍为占位值）。");
  }
  if (isPlaceholderValue(service.contact)) {
    failures.push("使用与数据说明缺少实际试行反馈联系人（或仍为占位值）。");
  }
  if (isPlaceholderValue(service.dataProcessingStatement)) {
    failures.push("使用与数据说明缺少实际数据处理说明（或仍为占位值）。");
  }
  if (service.technicalLoggingBoundary.length === 0) {
    failures.push("使用与数据说明缺少技术日志边界说明。");
  } else if (service.technicalLoggingBoundary.some((line) => isPlaceholderValue(line))) {
    failures.push("技术日志边界说明仍包含占位值。");
  }
  return { failures };
}

export interface ReleaseCheckInput {
  config: AppConfig;
  runtime: ResolvedRuntimeConfig;
  /** 当前激活批次中通过治理门槛的文书范例变体数量。 */
  eligibleExampleCount: number;
  /**
   * 文书范例阶段覆盖门槛：`requiredStages` 是必须覆盖的办理阶段 ID，
   * `eligibleStages` 是当前激活批次中实际合格的文书范例所处阶段。未提供时不检查。
   * `requiredHighRiskCount` / `eligibleHighRiskCount` 用于要求至少一个高风险程序环节的合格范例。
   */
  documentExampleCoverage?: {
    requiredStages: readonly string[];
    eligibleStages: readonly string[];
    requiredHighRiskCount?: number;
    eligibleHighRiskCount?: number;
  };
  /**
   * 重点案情覆盖门槛：`required` 是必须达到门槛的重点案情 ID，
   * `eligible` 是当前激活批次中实际合格的重点案情 ID。未提供时不检查。
   */
  caseFocusCoverage?: { required: readonly string[]; eligible: readonly string[] };
}

export interface ReleaseCheckResult {
  ok: boolean;
  failures: string[];
}

/** 最低合格文书范例数量（规格 3.4：至少 6 个变体）。 */
export const MIN_ELIGIBLE_DOCUMENT_EXAMPLES = 6;

export function checkReleaseReadiness(input: ReleaseCheckInput): ReleaseCheckResult {
  const failures = [...checkDataUseReadiness(input.config.service).failures];

  if (input.eligibleExampleCount < MIN_ELIGIBLE_DOCUMENT_EXAMPLES) {
    failures.push(
      `当前仅 ${input.eligibleExampleCount} 个合格文书范例，低于受控试行要求的 ${MIN_ELIGIBLE_DOCUMENT_EXAMPLES} 个。`,
    );
  }

  if (input.documentExampleCoverage !== undefined) {
    const eligible = new Set(input.documentExampleCoverage.eligibleStages);
    const missing = input.documentExampleCoverage.requiredStages.filter(
      (stageId) => !eligible.has(stageId),
    );
    if (missing.length > 0) {
      failures.push(
        `以下办理阶段没有合格文书范例（内容禁用、法源失效、已到期或不在激活批次内）：${missing.join("、")}。`,
      );
    }
    if (input.documentExampleCoverage.requiredHighRiskCount !== undefined) {
      const highRiskCount = input.documentExampleCoverage.eligibleHighRiskCount ?? 0;
      if (highRiskCount < input.documentExampleCoverage.requiredHighRiskCount) {
        failures.push(
          `当前仅 ${highRiskCount} 个合格的高风险程序环节文书范例，低于受控试行要求的 ${input.documentExampleCoverage.requiredHighRiskCount} 个。`,
        );
      }
    }
  }

  if (input.caseFocusCoverage !== undefined) {
    const eligible = new Set(input.caseFocusCoverage.eligible);
    const missing = input.caseFocusCoverage.required.filter((caseFocusId) => !eligible.has(caseFocusId));
    if (missing.length > 0) {
      failures.push(
        `以下派出所重点案情未达到发布门槛（内容禁用、法源失效、已到期或不在激活批次内）：${missing.join("、")}。`,
      );
    }
  }

  if (input.config.environment === "production" && input.config.enableTestControls) {
    failures.push("生产环境不得启用测试用替身控制接口。");
  }

  if (input.config.environment === "production" && input.config.analysisEnabled) {
    if (input.config.providerMode !== "dify") failures.push("生产分析必须使用真实 Dify，不能使用 fixture。");
    if (!input.config.difyBaseUrl || !input.config.difyApiKey || !input.config.difyWorkflowVersion) {
      failures.push("真实分析缺少 Dify 地址、应用密钥或允许的工作流版本。");
    }
  }

  if (input.config.difyBaseUrl !== null && input.config.difyBaseUrl !== undefined) {
    if (!input.config.difyBaseUrl.startsWith("https://")) {
      failures.push("Dify 基地址必须使用 HTTPS。");
    }
  }

  if (
    input.config.environment === "production" &&
    input.runtime.allowedOrigins.some((origin) => origin.startsWith("http://"))
  ) {
    failures.push("生产环境的允许来源不得包含明文 HTTP 地址。");
  }

  return { ok: failures.length === 0, failures };
}
