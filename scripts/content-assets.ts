/**
 * 受治理内容资产的导出与重建工具。
 *
 * 用法：
 *   npm run content:assets                          # 导出当前批次资产并回环校验
 *   npm run content:assets -- --out <file>          # 导出到版本化资产文件
 *   npm run content:assets -- --in <file>           # 从资产文件重建并校验批次
 *
 * 对应当前产品规格 13.5「从版本库或可导出结构化存储重建当前批次的能力」与
 * 13.6「可整体回滚批次」。结构或发布校验失败时以非零退出码失败关闭，
 * 调用方必须保持上一完整批次，不得形成部分更新。
 * 输出只包含批次与内容数量，不打印任何正文或案情。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createFixtureContent } from "../apps/server/src/content/fixture-content";
import {
  ContentAssetError,
  exportContentAssets,
  rebuildReleaseFromAssets,
  serializeContentAssets,
} from "../apps/server/src/content/assets";
import { ReleaseActivationError } from "../apps/server/src/content/release";

/** 固定导出时间，使版本化资产文件逐字节可复现。 */
const DETERMINISTIC_EXPORTED_AT = "1970-01-01T00:00:00.000Z";

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

function main(): void {
  try {
    const inputPath = readArg("--in");
    const outputPath = readArg("--out");

    if (inputPath !== null) {
      const { release } = rebuildReleaseFromAssets(readFileSync(inputPath, "utf8"));
      console.log(
        `[content:assets] 重建通过：批次 ${release.releaseId}，内容项 ${release.items.length}，重点案情 ${release.caseFocuses.length}，法源 ${release.legalSources.length}。`,
      );
      return;
    }

    const assets = exportContentAssets(createFixtureContent(), DETERMINISTIC_EXPORTED_AT);
    const rebuilt = rebuildReleaseFromAssets(serializeContentAssets(assets));
    if (outputPath !== null) {
      writeFileSync(outputPath, `${JSON.stringify(assets, null, 2)}\n`, "utf8");
      console.log(`[content:assets] 已导出：${outputPath}`);
    }
    console.log(
      `[content:assets] 回环校验通过：批次 ${rebuilt.release.releaseId}，内容项 ${rebuilt.release.items.length}，重点案情 ${rebuilt.release.caseFocuses.length}，法源 ${rebuilt.release.legalSources.length}。`,
    );
  } catch (error) {
    if (error instanceof ContentAssetError || error instanceof ReleaseActivationError) {
      console.error(`[content:assets] 重建失败：${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main();
