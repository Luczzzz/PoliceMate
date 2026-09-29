/**
 * 受控试行发布检查脚本。
 *
 * 用法：`npm run release:acceptance`（含真实设备/浏览器人工记录门槛）
 *       `npm run release:acceptance -- --auto-only`（只跑可自动化门槛，不覆盖结果文件）
 *
 * 组合内容门槛、验收矩阵覆盖、紧急停止与批次演练、人工/设备记录以及两类角色
 * 记录，输出可复现的检查结果。任一硬门槛失败时以非零退出码阻断，且只输出
 * 门槛名称与失败原因，不打印任何案情、事实或报告内容。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../apps/server/src/config";
import { createFixtureControls } from "../apps/server/src/providers/fixture";
import { buildReleaseCheckInput } from "../apps/server/src/release-check-input";
import { MANUAL_ACCEPTANCE_RECORDS } from "../apps/server/src/acceptance/evidence";
import { ACCEPTANCE_DRILL_IDS, runAcceptanceDrills } from "../apps/server/src/acceptance/drills";
import {
  acceptanceTestFiles,
  loadAcceptanceIndex,
} from "../apps/server/src/acceptance/coverage";
import { runReleaseAcceptance } from "../apps/server/src/acceptance/release-acceptance";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const RESULT_PATH = resolve(repoRoot, "docs/acceptance/trial-release-result.json");

async function main(): Promise<void> {
  const autoOnly = process.argv.includes("--auto-only");
  const config = loadConfig();
  const fixtures = createFixtureControls();

  const releaseCheck = await buildReleaseCheckInput(config, fixtures);
  const acceptanceIndex = loadAcceptanceIndex(
    acceptanceTestFiles(),
    MANUAL_ACCEPTANCE_RECORDS,
    ACCEPTANCE_DRILL_IDS,
  );

  const generatedAt = process.env.PM_ACCEPTANCE_GENERATED_AT ?? new Date().toISOString();
  const report = runReleaseAcceptance({
    releaseCheck,
    releaseId: (await fixtures.content.getActiveRelease()).releaseId,
    index: acceptanceIndex,
    drills: await runAcceptanceDrills(),
    generatedAt,
    requireManualEvidence: !autoOnly,
  });

  // 自动自检模式只用于本地/CI 排查，不覆盖版本化的完整检查结果。
  if (autoOnly) {
    console.log("[release-acceptance] 模式：automated-only（不写入版本化结果文件）；");
  } else {
    mkdirSync(dirname(RESULT_PATH), { recursive: true });
    writeFileSync(
      RESULT_PATH,
      `${JSON.stringify({ mode: "full", result: report }, null, 2)}\n`,
      "utf8",
    );
    console.log(`[release-acceptance] 模式：full；结果文件：${RESULT_PATH}`);
  }

  for (const check of report.checks) {
    console.log(
      ` - ${check.passed ? "通过" : "阻断"}：${check.title}${check.passed ? "" : `（${check.detail}）`}`,
    );
  }

  if (report.blocked) {
    console.error("[release-acceptance] 存在硬门槛未满足，受控试行发布被阻断。");
    process.exitCode = 1;
    return;
  }
  console.log("[release-acceptance] 全部硬门槛通过：可生成受控试行发布检查结果。");
}

void main();
