import { createGenerator } from "ts-json-schema-generator";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 生成分析服务使用的 JSON Schema。
 *
 * - `extract.json` / `report.json`：后端期望的完整输出封装，供运维核对；
 * - `extract-result.json` / `report-result.json`：模型的输出 Schema，只包含
 *   `result`，封装元数据由后端补上。
 *
 * 生成物必须与类型定义一起提交；缺少或过期会让真实模式拒绝模型输出。
 */
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}apps/server/src/providers/schemas`;
mkdirSync(output, { recursive: true });

const targets = [
  ["ModelExtractionOutput", "extract.json"],
  ["ModelReportOutput", "report.json"],
  ["CaseExtractionResult", "extract-result.json"],
  ["ReportDraft", "report-result.json"],
] as const;

for (const [type, name] of targets) {
  const schema = createGenerator({
    path: `${root}apps/server/src/providers/types.ts`,
    tsconfig: `${root}apps/server/tsconfig.json`,
    type,
    additionalProperties: false,
    skipTypeCheck: true,
  }).createSchema(type);
  // 体量上限（ADR-0012）只约束模型输出；后端封装校验不因超出而整份失败，由显示层折叠。
  const text = JSON.stringify(schema, null, 2);
  const out =
    name === "report.json"
      ? JSON.stringify(JSON.parse(text, (key, value) => (key === "maxItems" ? undefined : value)), null, 2)
      : text;
  writeFileSync(`${output}/${name}`, `${out}\n`);
  console.log(`Generated ${name} from ${type}.`);
}
