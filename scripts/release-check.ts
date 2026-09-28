/**
 * 受控试行发布检查脚本。
 *
 * 用法：`npm run release:check`
 * 存在占位值、缺少实际服务信息或缺少最低文书范例覆盖时以非零退出码失败。
 * 该脚本只输出门槛名称，不打印任何案情、事实或报告内容。
 */
import { loadConfig, resolveRuntimeConfig } from "../apps/server/src/config";
import { REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS } from "../apps/server/src/content/property-economic-content";
import { REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS } from "../apps/server/src/content/public-order-drug-content";
import { createFixtureControls } from "../apps/server/src/providers/fixture";
import { checkReleaseReadiness } from "../apps/server/src/release-check";

async function main(): Promise<void> {
  const config = loadConfig();
  const runtime = resolveRuntimeConfig(config);
  const fixtures = createFixtureControls();
  const release = await fixtures.content.getActiveRelease();
  const state = fixtures.describe();

  const result = checkReleaseReadiness({
    config,
    runtime,
    eligibleExampleCount: release.eligibleExampleCount,
    caseFocusCoverage: {
      required: [
        ...REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS,
        ...REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS,
      ],
      eligible: state.caseFocuses.filter((item) => item.eligible).map((item) => item.caseFocusId),
    },
  });

  if (result.ok) {
    console.log("[release-check] 通过：受控试行硬门槛中可机械核验的项目均满足。");
    return;
  }

  console.error("[release-check] 未通过，存在以下阻断项：");
  for (const failure of result.failures) {
    console.error(` - ${failure}`);
  }
  process.exitCode = 1;
}

void main();
