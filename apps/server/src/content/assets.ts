import { validateRelease, ReleaseActivationError } from "./release";
import type {
  CaseFocusRecord,
  ContentReleaseManifest,
  DocumentExampleRecord,
  GovernedContentSeed,
  LegalSourceRecord,
} from "./model";

/**
 * 受治理内容资产的导出与重建。
 *
 * 产品规格 13.5 要求具备“从版本库或可导出结构化存储重建当前批次的能力”，
 * 13.6 要求批次可整体回滚。这里提供与运行时代码无关的资产封装：把当前种子
 * 导出为结构化 JSON，再经结构校验与发布校验重建出不可变发布批次。
 *
 * 资产只包含受治理内容本身，不包含任何案情、事实、报告或会话数据。
 */

export const CONTENT_ASSET_FORMAT_VERSION = 1;

export interface ContentAssetBundle {
  formatVersion: number;
  /** 导出时间；只用于审计，不参与门控。 */
  exportedAt: string;
  seed: GovernedContentSeed;
}

export function exportContentAssets(
  seed: GovernedContentSeed,
  exportedAt: string = new Date().toISOString(),
): ContentAssetBundle {
  return {
    formatVersion: CONTENT_ASSET_FORMAT_VERSION,
    exportedAt,
    // 深拷贝，避免导出结果与运行时共享可变引用。
    seed: structuredClone(seed),
  };
}

export function serializeContentAssets(bundle: ContentAssetBundle): string {
  return JSON.stringify(bundle);
}

export class ContentAssetError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`受治理内容资产无法重建：${errors.join("；")}`);
    this.name = "ContentAssetError";
    this.errors = errors;
  }
}

function structuralErrors(bundle: unknown): { errors: string[]; bundle: ContentAssetBundle | null } {
  if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle)) {
    return { errors: ["资产不是对象。"], bundle: null };
  }
  const candidate = bundle as Partial<ContentAssetBundle>;
  const errors: string[] = [];
  if (candidate.formatVersion !== CONTENT_ASSET_FORMAT_VERSION) {
    errors.push("资产格式版本不受支持。");
  }
  if (typeof candidate.exportedAt !== "string") {
    errors.push("资产缺少导出时间。");
  }
  const seed = candidate.seed as Partial<GovernedContentSeed> | undefined;
  if (typeof seed !== "object" || seed === null) {
    errors.push("资产缺少内容种子。");
    return { errors, bundle: null };
  }
  if (!Array.isArray(seed.sources)) errors.push("资产缺少法源记录。");
  if (!Array.isArray(seed.examples)) errors.push("资产缺少文书范例记录。");
  if (!Array.isArray(seed.caseFocuses)) errors.push("资产缺少重点案情记录。");
  if (typeof seed.release !== "object" || seed.release === null) errors.push("资产缺少发布批次清单。");
  if (errors.length > 0) return { errors, bundle: null };
  return { errors, bundle: candidate as ContentAssetBundle };
}

/**
 * 解析并重建发布批次。
 *
 * 结构不合法、发布校验不通过或批次引用的内容缺失时抛出
 * `ContentAssetError`/`ReleaseActivationError`，调用方必须保持上一批次，
 * 不得形成部分更新。
 */
export function rebuildReleaseFromAssets(input: string | unknown): {
  seed: GovernedContentSeed;
  release: ContentReleaseManifest;
} {
  const parsed: unknown = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  const { errors, bundle } = structuralErrors(parsed);
  if (bundle === null) throw new ContentAssetError(errors);

  const seed = bundle.seed as GovernedContentSeed;
  const sources = new Map<string, LegalSourceRecord>(
    seed.sources.map((source) => [source.sourceId, source]),
  );
  const examples: DocumentExampleRecord[] = seed.examples;
  const caseFocuses: CaseFocusRecord[] = seed.caseFocuses;

  const releaseErrors = validateRelease(seed.release, sources, examples, caseFocuses);
  if (releaseErrors.length > 0) throw new ReleaseActivationError(releaseErrors);

  return {
    seed: structuredClone(seed),
    release: Object.freeze({
      ...seed.release,
      items: seed.release.items.map((entry) => Object.freeze({ ...entry })),
      caseFocuses: seed.release.caseFocuses.map((entry) => Object.freeze({ ...entry })),
      legalSources: seed.release.legalSources.map((entry) => Object.freeze({ ...entry })),
    }),
  };
}
