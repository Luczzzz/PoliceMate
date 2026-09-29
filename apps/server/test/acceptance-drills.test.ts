import { describe, expect, it } from "vitest";
import { ACCEPTANCE_DRILL_IDS, runAcceptanceDrills } from "../src/acceptance/drills";

/**
 * 受控试行紧急停止与内容批次演练。
 *
 * 覆盖规格 13.7、12.4、18.2：法源到期/状态不明、单项撤回、重点案情禁用、
 * 文书范例禁用、入口禁用、案情分析总开关与后端总开关，以及内容批次
 * 原子激活失败、整体回滚与从版本化资产重建；另含合成 canary 演练。
 */

describe("受控试行紧急停止与内容批次演练", () => {
  it("全部演练通过且结果与登记 ID 一一对应", async () => {
    const results = await runAcceptanceDrills();
    expect(results.map((result) => result.id)).toEqual(ACCEPTANCE_DRILL_IDS);

    const failed = results.filter((result) => !result.passed);
    expect(
      failed,
      failed.map((result) => `${result.id}: ${result.evidence.join(" / ")}`).join("\n"),
    ).toEqual([]);
    for (const result of results) {
      expect(result.evidence.length, `${result.id} 缺少证据行`).toBeGreaterThan(0);
    }
  });

  it("演练结果不包含任何案情、事实或报告内容", async () => {
    const results = await runAcceptanceDrills();
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("张某");
    expect(serialized).not.toContain("殴打");
    expect(serialized).not.toContain("CANARY");
  });
});
