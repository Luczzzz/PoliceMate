import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 运行配置。所有影响能力可用性的输入都必须来自配置或外部边界提供者，
 * 不得由页面文案或自然语言结果决定。
 */
export interface AppConfig {
  host: string;
  port: number;
  /** 提供者模式。当前只有确定性替身，真实 Dify / 内容源在后续切片接入。 */
  providerMode: "fixture";
  /** 是否挂载测试用替身控制接口；生产环境必须关闭。 */
  enableTestControls: boolean;
  /** 后端总开关；关闭时两个入口均不可用。 */
  masterSwitch: boolean;
  analysisEnabled: boolean;
  documentsEnabled: boolean;
  /** 构建后的 H5 静态资源目录；不存在时仅提供 API。 */
  staticDir: string | null;
  service: ServiceDeploymentInfo;
}

/**
 * 部署相关的服务信息。受控试行前必须填写实际值；未配置时保持 `null`，
 * 页面必须如实显示“尚未配置”，不得使用虚构主体或联系人。
 */
export interface ServiceDeploymentInfo {
  provider: string | null;
  contact: string | null;
  dataProcessingStatement: string | null;
  technicalLoggingBoundary: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultStaticDir = resolve(packageRoot, "../web/dist");

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "on", "yes"].includes(raw.trim().toLowerCase());
}

function readOptional(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const staticDirCandidate = readOptional(env.PM_WEB_DIST) ?? defaultStaticDir;

  return {
    host: readOptional(env.PM_HOST) ?? "127.0.0.1",
    port: Number(readOptional(env.PM_SERVER_PORT) ?? "8787"),
    providerMode: "fixture",
    enableTestControls: readBoolean(env.PM_ENABLE_TEST_CONTROLS, false),
    masterSwitch: readBoolean(env.PM_MASTER_SWITCH, true),
    analysisEnabled: readBoolean(env.PM_ANALYSIS_ENABLED, true),
    documentsEnabled: readBoolean(env.PM_DOCUMENTS_ENABLED, true),
    staticDir: existsSync(resolve(staticDirCandidate, "index.html")) ? staticDirCandidate : null,
    service: {
      provider: readOptional(env.PM_SERVICE_PROVIDER),
      contact: readOptional(env.PM_SERVICE_CONTACT),
      dataProcessingStatement: readOptional(env.PM_DATA_PROCESSING_STATEMENT),
      technicalLoggingBoundary: readList(env.PM_TECHNICAL_LOGGING_BOUNDARY),
    },
  };
}
