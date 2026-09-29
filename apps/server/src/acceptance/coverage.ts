import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  ACCEPTANCE_SCENARIOS,
  REQUIRED_ACCEPTANCE_IDS,
} from "./scenarios";
import { MANUAL_ACCEPTANCE_RECORDS } from "./evidence";
import type { AcceptanceScenario, ManualAcceptanceRecord } from "./types";

/**
 * 验收矩阵覆盖率校验。
 *
 * 机械校验：
 * - 规格 17 节的 AC-01 至 AC-34 全部存在且不重复，没有多余编号；
 * - 每个场景至少绑定一类证据（自动化测试、人工记录或演练）；
 * - 每条自动化测试引用都能在对应文件中找到同名测试；
 * - 每条人工记录与演练都被矩阵引用，避免出现无法解释的“僵尸门槛”；
 * - 所有阻断型人工记录都被矩阵引用。
 */

export interface AcceptanceIndex {
  /** 仓库根目录相对路径 → 测试文件源码。 */
  testSources: Map<string, string>;
  manualRecordIds: Set<string>;
  drillIds: Set<string>;
}

export interface AcceptanceCoverageResult {
  ok: boolean;
  failures: string[];
  /** 每个场景实际绑定的证据数量，用于发布检查结果追溯。 */
  evidenceCounts: { id: string; title: string; evidenceCount: number }[];
}

/**
 * 校验阻断型人工/设备记录是否具备可追溯证据。
 *
 * 声明为 `pass` 的阻断型记录必须带可解析执行日期、环境说明、执行角色与
 * 真实存在的测试引用，避免在没有设备证据的情况下被翻转成通过。
 * 未完成的记录由发布检查的 `gate-manual-evidence` 门槛单独报告。
 */
export function checkManualEvidenceRecords(
  records: readonly ManualAcceptanceRecord[],
  index: AcceptanceIndex,
): string[] {
  const failures: string[] = [];
  for (const record of records) {
    if (!record.blocksRelease || record.result !== "pass") continue;
    if (!Number.isFinite(Date.parse(record.performedAt))) {
      failures.push(`${record.id} 的通过记录缺少可解析的执行日期。`);
    }
    if (record.environment.trim() === "") {
      failures.push(`${record.id} 的通过记录缺少环境说明。`);
    }
    if (record.operator.trim() === "") {
      failures.push(`${record.id} 的通过记录缺少执行角色。`);
    }
    if (record.evidence.length === 0) {
      failures.push(`${record.id} 的通过记录缺少证据引用。`);
    }
    for (const ref of record.evidence) {
      if (!hasTitle(index, ref.file, ref.title)) {
        failures.push(`${record.id} 的证据引用不存在：${ref.file} → ${ref.title}`);
      }
    }
  }
  return failures;
}

/** 矩阵与人工记录引用到的全部测试文件（去重排序）。 */
export function acceptanceTestFiles(
  scenarios: readonly AcceptanceScenario[] = ACCEPTANCE_SCENARIOS,
  records: readonly ManualAcceptanceRecord[] = MANUAL_ACCEPTANCE_RECORDS,
): string[] {
  return [
    ...new Set([
      ...scenarios.flatMap((scenario) => scenario.automated.map((ref) => ref.file)),
      ...records.flatMap((record) => record.evidence.map((ref) => ref.file)),
    ]),
  ].sort();
}

/** 从磁盘读取测试文件源码，构造覆盖率校验所需的索引。 */
export function loadAcceptanceIndex(
  testFiles: readonly string[],
  manualRecords: readonly ManualAcceptanceRecord[] = MANUAL_ACCEPTANCE_RECORDS,
  drillIds: readonly string[] = [],
  repoRoot: string = fileURLToPath(new URL("../../../../", import.meta.url)),
): AcceptanceIndex {
  const testSources = new Map<string, string>();
  for (const file of testFiles) {
    try {
      testSources.set(file, readFileSync(resolve(repoRoot, file), "utf8"));
    } catch {
      // 文件缺失在覆盖率校验中按“引用不存在”处理，不在这里抛出。
    }
  }
  return {
    testSources,
    manualRecordIds: new Set(manualRecords.map((record) => record.id)),
    drillIds: new Set(drillIds),
  };
}

function hasTitle(index: AcceptanceIndex, file: string, title: string): boolean {
  const source = index.testSources.get(file);
  if (source === undefined) return false;
  return source.includes(title);
}

export function checkAcceptanceCoverage(
  scenarios: readonly AcceptanceScenario[] = ACCEPTANCE_SCENARIOS,
  index: AcceptanceIndex,
  requiredIds: readonly string[] = REQUIRED_ACCEPTANCE_IDS,
): AcceptanceCoverageResult {
  const failures: string[] = [];
  const byId = new Map<string, AcceptanceScenario>();
  for (const scenario of scenarios) {
    if (byId.has(scenario.id)) failures.push(`验收场景 ${scenario.id} 重复定义。`);
    byId.set(scenario.id, scenario);
  }

  for (const id of requiredIds) {
    if (!byId.has(id)) failures.push(`验收场景 ${id} 缺失（不得静默删除）。`);
  }
  for (const scenario of scenarios) {
    if (!requiredIds.includes(scenario.id)) {
      failures.push(`验收场景 ${scenario.id} 不在规格定义的 AC-01 至 AC-34 范围内。`);
    }
  }

  const referencedManual = new Set<string>();
  const referencedDrills = new Set<string>();

  for (const id of requiredIds) {
    const scenario = byId.get(id);
    if (scenario === undefined) continue;
    const evidenceCount = scenario.automated.length + scenario.manual.length + scenario.drills.length;
    if (evidenceCount === 0) {
      failures.push(`验收场景 ${id} 没有任何证据（自动化、人工记录或演练）。`);
    }
    for (const ref of scenario.automated) {
      if (!hasTitle(index, ref.file, ref.title)) {
        failures.push(`验收场景 ${id} 引用的自动化测试不存在：${ref.file} → ${ref.title}`);
      }
    }
    for (const recordId of scenario.manual) {
      if (!index.manualRecordIds.has(recordId)) {
        failures.push(`验收场景 ${id} 引用了不存在的人工记录 ${recordId}。`);
      }
      referencedManual.add(recordId);
    }
    for (const drillId of scenario.drills) {
      if (!index.drillIds.has(drillId)) {
        failures.push(`验收场景 ${id} 引用了不存在的演练 ${drillId}。`);
      }
      referencedDrills.add(drillId);
    }
  }

  for (const recordId of index.manualRecordIds) {
    if (!referencedManual.has(recordId)) {
      failures.push(`人工记录 ${recordId} 没有被任何验收场景引用。`);
    }
  }
  for (const drillId of index.drillIds) {
    if (!referencedDrills.has(drillId)) {
      failures.push(`演练 ${drillId} 没有被任何验收场景引用。`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    evidenceCounts: requiredIds.flatMap((id) => {
      const scenario = byId.get(id);
      if (scenario === undefined) return [];
      return [
        {
          id,
          title: scenario.title,
          evidenceCount:
            scenario.automated.length + scenario.manual.length + scenario.drills.length,
        },
      ];
    }),
  };
}
