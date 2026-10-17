import { readFileSync } from "node:fs";
import Ajv from "ajv";
import type { ModelExtractionOutput, ModelReportOutput } from "./types";

/** 共享的结构契约：分析服务提供者使用同一套提示词版本与输出校验。 */
export const ANALYSIS_PROMPT_VERSION = "actionable-analysis-v3";
const ajv = new Ajv({ allErrors: false, allowUnionTypes: true });
const extractSchema = JSON.parse(readFileSync(new URL("./schemas/extract.json", import.meta.url), "utf8"));
const reportSchema = JSON.parse(readFileSync(new URL("./schemas/report.json", import.meta.url), "utf8"));
export const validateExtract = ajv.compile<ModelExtractionOutput>(extractSchema);
export const validateReport = ajv.compile<ModelReportOutput>(reportSchema);

export async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new Error("响应超过大小限制。");
  }
  if (response.body === null) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("响应超过大小限制。");
    return JSON.parse(text) as unknown;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("响应超过大小限制。");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
