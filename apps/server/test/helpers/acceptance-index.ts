import { ACCEPTANCE_DRILL_IDS } from "../../src/acceptance/drills";
import { MANUAL_ACCEPTANCE_RECORDS } from "../../src/acceptance/evidence";
import {
  acceptanceTestFiles,
  loadAcceptanceIndex,
  type AcceptanceIndex,
} from "../../src/acceptance/coverage";

/**
 * 共享装置：从磁盘构造验收矩阵覆盖率索引。
 *
 * 索引只在测试与发布检查脚本中构造；产品运行时不会读取测试文件。
 */

export function buildAcceptanceIndex(): AcceptanceIndex {
  return loadAcceptanceIndex(acceptanceTestFiles(), MANUAL_ACCEPTANCE_RECORDS, ACCEPTANCE_DRILL_IDS);
}
