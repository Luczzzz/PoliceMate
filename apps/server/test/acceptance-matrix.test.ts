import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkAcceptanceCoverage } from "../src/acceptance/coverage";
import { ACCEPTANCE_SCENARIOS, REQUIRED_ACCEPTANCE_IDS } from "../src/acceptance/scenarios";
import { buildAcceptanceIndex } from "./helpers/acceptance-index";

/**
 * 受控试行验收矩阵自检。
 *
 * 防止场景被静默删除、证据引用失效或规格章节无法追溯。
 */

const SPEC_PATH = fileURLToPath(
  new URL("../../../docs/specs/songjing-h5-v1-product-spec.md", import.meta.url),
);

function specSectionIds(): Set<string> {
  const source = readFileSync(SPEC_PATH, "utf8");
  const ids = new Set<string>();
  for (const line of source.split("\n")) {
    const match = line.match(/^#{2,4}\s+(\d+(?:\.\d+)*)/);
    if (match !== null) ids.add(match[1]);
  }
  return ids;
}

describe("受控试行验收矩阵", () => {
  it("AC-01 至 AC-34 全部有可追踪证据且引用完整", () => {
    const index = buildAcceptanceIndex();
    const result = checkAcceptanceCoverage(ACCEPTANCE_SCENARIOS, index);
    expect(result.failures, result.failures.join("\n")).toEqual([]);
    expect(result.evidenceCounts).toHaveLength(REQUIRED_ACCEPTANCE_IDS.length);
    for (const scenario of result.evidenceCounts) {
      expect(scenario.evidenceCount, `${scenario.id} 证据数量`).toBeGreaterThan(0);
    }
  });

  it("每个场景都追溯到产品规格正文中的实际章节", () => {
    const sections = specSectionIds();
    const missing: string[] = [];
    for (const scenario of ACCEPTANCE_SCENARIOS) {
      expect(scenario.specSections.length, `${scenario.id} 缺少规格章节`).toBeGreaterThan(0);
      for (const section of scenario.specSections) {
        const found = [...sections].some(
          (heading) => heading === section || heading.startsWith(`${section}.`) || section.startsWith(`${heading}.`),
        );
        if (!found) missing.push(`${scenario.id} → ${section}`);
      }
    }
    expect(missing, `无法追溯的规格章节：${missing.join("、")}`).toEqual([]);
  });

  it("没有场景被静默删除、重复或替换为未知编号", () => {
    const ids = ACCEPTANCE_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...REQUIRED_ACCEPTANCE_IDS].sort());
    for (const scenario of ACCEPTANCE_SCENARIOS) {
      expect(scenario.title.trim(), `${scenario.id} 缺少标题`).not.toBe("");
    }
  });

  it("自动化证据标题必须能在对应测试文件中字面找到", () => {
    const index = buildAcceptanceIndex();
    const missing: string[] = [];
    for (const scenario of ACCEPTANCE_SCENARIOS) {
      for (const ref of scenario.automated) {
        const source = index.testSources.get(ref.file);
        if (source === undefined) {
          missing.push(`${scenario.id} → 文件不存在：${ref.file}`);
          continue;
        }
        if (!source.includes(ref.title)) {
          missing.push(`${scenario.id} → 标题不存在：${ref.file} :: ${ref.title}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
