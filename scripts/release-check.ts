/**
 * 受控试行内容发布检查脚本（仅内容与文书范例覆盖门槛）。
 *
 * 用法：`npm run release:check`
 * 存在占位值、缺少实际服务信息、缺少最低文书范例覆盖或者缺少必需办理阶段时，
 * 以非零退出码失败。完整发布检查见 `scripts/release-acceptance.ts`。
 * 该脚本只输出门槛名称，不打印任何案情、事实或报告内容。
 */
import { loadConfig } from "../apps/server/src/config";
import { createFixtureControls } from "../apps/server/src/providers/fixture";
import { buildReleaseCheckInput } from "../apps/server/src/release-check-input";
import { checkReleaseReadiness } from "../apps/server/src/release-check";

async function main(): Promise<void> {
  const config = loadConfig();
  const fixtures = createFixtureControls();
  const result = checkReleaseReadiness(await buildReleaseCheckInput(config, fixtures));

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
