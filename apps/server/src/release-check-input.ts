import type { AppConfig } from "./config";
import { resolveRuntimeConfig } from "./config";
import {
  HIGH_RISK_CASE_TAG,
  REQUIRED_DOCUMENT_EXAMPLE_STAGES,
} from "./content/document-example-content";
import { REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS } from "./content/property-economic-content";
import { REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS } from "./content/public-order-drug-content";
import { REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS } from "./content/family-minor-content";
import type { ReleaseCheckInput } from "./release-check";
import type { FixtureControls } from "./providers/fixture";

/**
 * 从当前激活批次与运行配置派生发布检查输入。
 *
 * 发布检查脚本与验收测试共用同一份派生逻辑，避免各自重复维护
 * “必需阶段 / 十组重点案情 / 高风险环节”门槛而出现漂移。
 */
export async function buildReleaseCheckInput(
  config: AppConfig,
  fixtures: FixtureControls,
): Promise<ReleaseCheckInput> {
  const index = await fixtures.content.listExamples();
  const state = fixtures.describe();
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
