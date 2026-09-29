import { CONTRACT_VERSION } from "@policymate/contracts";
import { checkReleaseReadiness, type ReleaseCheckInput } from "../release-check";
import { checkAcceptanceCoverage, checkManualEvidenceRecords, type AcceptanceIndex } from "./coverage";
import { ACCEPTANCE_SCENARIOS, REQUIRED_ACCEPTANCE_IDS } from "./scenarios";
import { blockingManualRecords, MANUAL_ACCEPTANCE_RECORDS } from "./evidence";
import { ACCEPTANCE_DRILL_IDS } from "./drills";
import {
  checkTrialDecisions,
  TRIAL_DECISION_RECORDS,
  type TrialDecisionRecord,
} from "./decisions";
import type { AcceptanceScenario, DrillResult, ManualAcceptanceRecord } from "./types";

/**
 * 受控试行发布检查。
 *
 * 把可机械核验的内容门槛、验收矩阵覆盖、紧急停止与批次演练、人工/设备验收
 * 记录以及两类角色记录组合成一次可复现的检查。任一硬门槛失败时 `blocked`
 * 为 true，调用方不得把结果表述为可开始受控试行（规格 18.1、18.2）。
 */

export interface AcceptanceCheck {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
  /** 阻断项为 true；非阻断项只作为提示。 */
  hard: boolean;
}

export interface ReleaseAcceptanceReport {
  contractVersion: string;
  releaseId: string;
  generatedAt: string;
  ok: boolean;
  blocked: boolean;
  checks: AcceptanceCheck[];
  scenarios: { id: string; title: string; evidenceCount: number }[];
  drills: DrillResult[];
}

export interface ReleaseAcceptanceInput {
  releaseCheck: ReleaseCheckInput;
  /** 当前激活的不可变内容发布批次 ID。 */
  releaseId: string;
  /** 验收矩阵覆盖率校验索引（测试标题、人工记录与演练 ID）。 */
  index: AcceptanceIndex;
  /** 已执行的演练结果。 */
  drills: DrillResult[];
  scenarios?: AcceptanceScenario[];
  manualRecords?: ManualAcceptanceRecord[];
  decisions?: TrialDecisionRecord[];
  /**
   * 是否要求阻断型人工/设备记录全部通过。默认为 true；
   * 自动化测试可以关闭以只校验编排逻辑。
   */
  requireManualEvidence?: boolean;
  generatedAt?: string;
}

function failureDetail(failures: readonly string[]): string {
  return failures.length === 0 ? "通过" : failures.join("；");
}

export function runReleaseAcceptance(input: ReleaseAcceptanceInput): ReleaseAcceptanceReport {
  const scenarios = input.scenarios ?? ACCEPTANCE_SCENARIOS;
  const manualRecords = input.manualRecords ?? MANUAL_ACCEPTANCE_RECORDS;
  const decisions = input.decisions ?? TRIAL_DECISION_RECORDS;
  const requireManualEvidence = input.requireManualEvidence ?? true;

  const releaseResult = checkReleaseReadiness(input.releaseCheck);
  const coverage = checkAcceptanceCoverage(scenarios, input.index, REQUIRED_ACCEPTANCE_IDS);

  const drillById = new Map(input.drills.map((drill) => [drill.id, drill]));
  const missingDrills = ACCEPTANCE_DRILL_IDS.filter((id) => !drillById.has(id));
  const failedDrills = input.drills.filter((drill) => !drill.passed).map((drill) => drill.id);
  const extraDrills = input.drills
    .map((drill) => drill.id)
    .filter((id) => !ACCEPTANCE_DRILL_IDS.includes(id));

  const blockingRecords = blockingManualRecords(manualRecords);
  const unfinishedRecords = blockingRecords
    .filter((record) => record.result !== "pass")
    .map((record) => `${record.id}（${record.result}）`);
  const invalidEvidence = checkManualEvidenceRecords(manualRecords, input.index);

  const decisionFailures = checkTrialDecisions(input.releaseId, decisions);

  const checks: AcceptanceCheck[] = [
    {
      id: "gate-release-readiness",
      title: "内容、文书范例阶段与高风险覆盖、服务信息与传输安全门槛",
      passed: releaseResult.ok,
      detail: failureDetail(releaseResult.failures),
      hard: true,
    },
    {
      id: "gate-acceptance-coverage",
      title: "AC-01 至 AC-34 全部存在且每条证据引用可追踪",
      passed: coverage.ok,
      detail: failureDetail(coverage.failures),
      hard: true,
    },
    {
      id: "gate-drills",
      title: "紧急停止、内容批次与隐私 canary 演练全部通过",
      passed: missingDrills.length === 0 && failedDrills.length === 0 && extraDrills.length === 0,
      detail: failureDetail([
        ...missingDrills.map((id) => `缺少演练 ${id}`),
        ...failedDrills.map((id) => `演练失败 ${id}`),
        ...extraDrills.map((id) => `未登记的演练 ${id}`),
      ]),
      hard: true,
    },
    {
      id: "gate-manual-evidence",
      title: "设备、浏览器、可访问性与性能验收记录满足阻断门槛",
      passed: !requireManualEvidence || (unfinishedRecords.length === 0 && invalidEvidence.length === 0),
      detail: requireManualEvidence
        ? failureDetail([
            ...unfinishedRecords.map((id) => `未完成或未通过：${id}`),
            ...invalidEvidence,
          ])
        : "已按调用方设置跳过人工证据门槛（仅用于自动化编排自检）。",
      hard: requireManualEvidence,
    },
    {
      id: "gate-trial-decisions",
      title: "内容批次确认与试行发布决定分别记录且不作正式审定表述",
      passed: decisionFailures.length === 0,
      detail: failureDetail(decisionFailures),
      hard: true,
    },
  ];

  const ok = checks.filter((check) => check.hard).every((check) => check.passed);
  return {
    contractVersion: CONTRACT_VERSION,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ok,
    blocked: !ok,
    checks,
    scenarios: coverage.evidenceCounts,
    drills: input.drills,
  };
}
