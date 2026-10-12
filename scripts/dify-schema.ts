import { createGenerator } from "ts-json-schema-generator";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 生成 Dify 工作流使用的 JSON Schema。
 *
 * - `dify-extract.json` / `dify-report.json`：后端期望的完整输出封装，供运维核对；
 * - `dify-extract-result.json` / `dify-report-result.json`：LLM 节点的结构化输出
 *   Schema，只包含 `result`，由工作流的结构整理节点负责补上封装元数据。
 *
 * 生成物必须与类型定义一起提交；缺少或过期会让真实模式拒绝上游输出。
 */
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}apps/server/src/providers/schemas`;
mkdirSync(output, { recursive: true });

const targets = [
  ["DifyExtractionOutput", "dify-extract.json"],
  ["DifyReportOutput", "dify-report.json"],
  ["CaseExtractionResult", "dify-extract-result.json"],
  ["ReportDraft", "dify-report-result.json"],
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
    name === "dify-report.json"
      ? JSON.stringify(JSON.parse(text, (key, value) => (key === "maxItems" ? undefined : value)), null, 2)
      : text;
  writeFileSync(`${output}/${name}`, `${out}\n`);
  console.log(`Generated ${name} from ${type}.`);
}
