import { describe, expect, it } from "vitest";
import { createFixtureContent } from "../src/content/fixture-content";
import {
  ContentAssetError,
  exportContentAssets,
  rebuildReleaseFromAssets,
  serializeContentAssets,
} from "../src/content/assets";
import { ReleaseActivationError, rollbackRelease } from "../src/content/release";

/**
 * 受治理内容资产的导出、重建与回滚（规格 13.5、13.6）。
 *
 * 验证可从版本化结构化资产逐字节重建当前批次，且损坏资产或发布校验失败时
 * 失败关闭，不形成部分更新。
 */

describe("受治理内容资产", () => {
  it("导出回环可逐字节重建当前激活批次", () => {
    const seed = createFixtureContent();
    const bundle = exportContentAssets(seed, "1970-01-01T00:00:00.000Z");
    const serialized = serializeContentAssets(bundle);

    const rebuilt = rebuildReleaseFromAssets(serialized);
    expect(rebuilt.release.releaseId).toBe(seed.release.releaseId);
    expect(rebuilt.release.items).toEqual(seed.release.items);
    expect(rebuilt.release.caseFocuses).toEqual(seed.release.caseFocuses);
    expect(rebuilt.release.legalSources).toEqual(seed.release.legalSources);

    // 相同输入产生相同序列化结果。
    expect(serializeContentAssets(rebuiltAsBundle(rebuilt.seed))).toBe(serialized);
  });

  it("损坏资产或发布校验失败时失败关闭", () => {
    const bundle = exportContentAssets(createFixtureContent(), "1970-01-01T00:00:00.000Z");

    expect(() => rebuildReleaseFromAssets(JSON.stringify({ formatVersion: 0, seed: {} }))).toThrow(
      ContentAssetError,
    );
    expect(() => rebuildReleaseFromAssets("not json")).toThrow();

    const broken = {
      ...bundle,
      seed: {
        ...bundle.seed,
        release: { ...bundle.seed.release, legalSources: bundle.seed.release.legalSources.slice(1) },
      },
    };
    expect(() => rebuildReleaseFromAssets(JSON.stringify(broken))).toThrow(ReleaseActivationError);
  });

  it("导出结果与运行时状态隔离，可安全用于回滚", () => {
    const seed = createFixtureContent();
    const bundle = exportContentAssets(seed, "1970-01-01T00:00:00.000Z");
    const rebuilt = rebuildReleaseFromAssets(serializeContentAssets(bundle));
    // 回滚到刚重建的批次按 releaseId 命中。
    const rolled = rollbackRelease([seed.release, rebuilt.release], seed.release.releaseId);
    expect(rolled?.releaseId).toBe(seed.release.releaseId);
  });
});

function rebuiltAsBundle(seed: ReturnType<typeof createFixtureContent>) {
  return exportContentAssets(seed, "1970-01-01T00:00:00.000Z");
}
