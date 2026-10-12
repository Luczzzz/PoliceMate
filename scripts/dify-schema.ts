import { createGenerator } from "ts-json-schema-generator";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * 直连 LLM 模式（ADR-0014）读取的系统提示词，由 `docs/deployment/dify-prompts/*.md`
 * 截取“复制时从下一行开始”之后的正文生成，保证仓库里只有一份提示词真源。
 */
const promptOutput = `${root}apps/server/src/providers/prompts`;
mkdirSync(promptOutput, { recursive: true });
for (const [source, name] of [["extract-system.md", "extract-system.txt"], ["report-system.md", "report-system.txt"]] as const) {
  const lines = readFileSync(`${root}docs/deployment/dify-prompts/${source}`, "utf8").split("\n");
  const marker = lines.findIndex((line) => line.includes("复制时从下一行开始"));
  if (marker < 0) throw new Error(`${source} 缺少“复制时从下一行开始”标记。`);
  const body = lines.slice(marker + 1);
  while (body[0]?.trim() === "") body.shift();
  if (body[0]?.trim() === "---") body.shift();
  writeFileSync(`${promptOutput}/${name}`, `${body.join("\n").trim()}\n`);
  console.log(`Generated prompts/${name}.`);
}
