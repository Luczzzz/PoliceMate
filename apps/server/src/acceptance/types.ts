/**
 * 受控试行验收矩阵的类型定义。
 *
 * 矩阵把产品规格第 17 节的 AC-01 至 AC-34 逐项绑定到可追踪证据：
 * 自动化测试、人工/设备记录或专项演练。矩阵本身只是数据，
 * 由 `coverage.ts` 机械校验引用完整性，防止场景被静默删除。
 */

/** 一条自动化测试引用；标题必须能在文件中字面找到。 */
export interface TestReference {
  /** 仓库根目录相对路径，例如 `apps/server/test/app.test.ts`。 */
  file: string;
  /** 测试标题，与源码中的字面量一致（`it.each` 模板可以包含 `%s`）。 */
  title: string;
}

export interface AcceptanceScenario {
  /** `AC-01` 至 `AC-34`。 */
  id: string;
  title: string;
  /** 规格章节号，例如 `6.4`、`7.2`。 */
  specSections: string[];
  /** 自动化测试证据。可以为空，但此时必须有人工记录或演练。 */
  automated: TestReference[];
  /** 人工/设备验收记录 ID，必须存在于 evidence 记录中。 */
  manual: string[];
  /** 演练 ID，必须存在于 drills 中。 */
  drills: string[];
}

export type ManualRecordKind = "browser" | "accessibility" | "performance";

export interface ManualAcceptanceRecord {
  id: string;
  kind: ManualRecordKind;
  title: string;
  /**
   * `automated-proxy`：用确定性浏览器引擎或设备仿真自动执行；
   * `manual`：必须在真实设备或真实浏览器上由人执行并记录。
   */
  method: "automated-proxy" | "manual";
  /** 设备/浏览器/网络环境描述。 */
  environment: string;
  performedAt: string;
  result: "pass" | "fail" | "not_run";
  /** 证据引用：e2e 文件与测试标题，或人工证据说明。 */
  evidence: TestReference[];
  operator: string;
  notes: string;
  /** 为 true 时该记录未通过会阻断受控试行发布检查。 */
  blocksRelease: boolean;
}

export interface DrillResult {
  id: string;
  title: string;
  passed: boolean;
  /** 不含任何案情、事实或报告内容的机器可读证据行。 */
  evidence: string[];
}
