import type {
  CaseFocusRecord,
  ContentReleaseManifest,
  ContentTestResult,
  DocumentExampleRecord,
  LegalSourceRecord,
} from "./model";

/**
 * 内容发布批次的激活与回滚。
 *
 * 批次清单一经激活即不可变：只允许整批整体切换，不允许就地修改。
 * 激活前必须校验全部内容项；任一校验失败则整批拒绝，上一完整批次保持激活。
 */
export class ReleaseActivationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`内容发布批次激活失败：${errors.join("；")}`);
    this.name = "ReleaseActivationError";
    this.errors = errors;
  }
}

/** 批次校验所需的受治理内容项公共字段。 */
interface ValidatableGovernedItem {
  version: string;
  contentStatus: string;
  sourceIds: string[];
  nextReviewDueAt: string;
  testResults: ContentTestResult[];
}

/**
 * 校验一个内容项是否允许进入激活批次。
 * 文书范例与重点案情共用同一门槛，只有 `kindLabel` 不同。
 */
function validateManifestItem(
  id: string,
  kindLabel: string,
  item: ValidatableGovernedItem | undefined,
  entry: { version: string },
  manifestSourceIds: ReadonlySet<string>,
  sources: ReadonlyMap<string, LegalSourceRecord>,
): string[] {
  if (item === undefined) return [`批次引用了不存在的${kindLabel} ${id}`];
  if (item.version !== entry.version) {
    return [`${kindLabel} ${id} 的版本与批次记录不一致`];
  }

  const errors: string[] = [];
  if (item.contentStatus !== "trial") errors.push(`${kindLabel} ${id} 不是 trial 状态`);
  if (item.testResults.length === 0 || item.testResults.some((result) => result.outcome !== "pass")) {
    errors.push(`${kindLabel} ${id} 未通过全部测试`);
  }
  if (!Number.isFinite(Date.parse(item.nextReviewDueAt))) {
    errors.push(`${kindLabel} ${id} 缺少可解析的下次核验日期`);
  }
  for (const sourceId of item.sourceIds) {
    if (!manifestSourceIds.has(sourceId)) {
      errors.push(`${kindLabel} ${id} 依赖的法源 ${sourceId} 未记录在批次清单中`);
    }
    const source = sources.get(sourceId);
    if (source === undefined) {
      errors.push(`${kindLabel} ${id} 依赖的法源 ${sourceId} 不存在`);
    } else if (source.status !== "current") {
      errors.push(`${kindLabel} ${id} 依赖的法源 ${sourceId} 非现行有效`);
    }
  }
  return errors;
}

export function validateRelease(
  release: ContentReleaseManifest,
  sources: ReadonlyMap<string, LegalSourceRecord>,
  examples: readonly DocumentExampleRecord[],
  caseFocuses: readonly CaseFocusRecord[] = [],
): string[] {
  const errors: string[] = [];
  const byId = new Map(examples.map((item) => [item.exampleId, item]));
  const caseFocusById = new Map(caseFocuses.map((item) => [item.caseFocusId, item]));
  const manifestSourceIds = new Set(release.legalSources.map((entry) => entry.sourceId));
  const caseFocusEntries = release.caseFocuses ?? [];

  if (release.items.length === 0) {
    errors.push("批次不包含任何内容项");
  }
  if (release.legalSources.length === 0) {
    errors.push("批次未记录任何法源版本");
  }

  for (const entry of release.legalSources) {
    const source = sources.get(entry.sourceId);
    if (source === undefined) {
      errors.push(`批次引用了不存在的法源 ${entry.sourceId}`);
      continue;
    }
    if (source.version !== entry.version) {
      errors.push(`法源 ${entry.sourceId} 的版本与批次记录不一致`);
    }
    if (source.status !== "current") {
      errors.push(`法源 ${entry.sourceId} 非现行有效`);
    }
    if (!Number.isFinite(Date.parse(source.nextReviewDueAt))) {
      errors.push(`法源 ${entry.sourceId} 缺少可解析的下次核验日期`);
    }
  }

  for (const entry of release.items) {
    errors.push(
      ...validateManifestItem(
        entry.exampleId,
        "内容项",
        byId.get(entry.exampleId),
        entry,
        manifestSourceIds,
        sources,
      ),
    );
  }

  for (const entry of caseFocusEntries) {
    errors.push(
      ...validateManifestItem(
        entry.caseFocusId,
        "重点案情",
        caseFocusById.get(entry.caseFocusId),
        entry,
        manifestSourceIds,
        sources,
      ),
    );
  }

  return errors;
}

function freezeRelease(release: ContentReleaseManifest): ContentReleaseManifest {
  const frozen: ContentReleaseManifest = {
    ...release,
    items: release.items.map((entry) => Object.freeze({ ...entry })),
    caseFocuses: release.caseFocuses.map((entry) => Object.freeze({ ...entry })),
    legalSources: release.legalSources.map((entry) => Object.freeze({ ...entry })),
  };
  Object.freeze(frozen.items);
  Object.freeze(frozen.caseFocuses);
  Object.freeze(frozen.legalSources);
  return Object.freeze(frozen);
}

/**
 * 原子激活：校验通过后返回新的不可变批次；失败时抛出异常，
 * 调用方必须继续使用 `current`，不得形成部分更新。
 */
export function activateRelease(
  current: ContentReleaseManifest | null,
  next: ContentReleaseManifest,
  sources: ReadonlyMap<string, LegalSourceRecord>,
  examples: readonly DocumentExampleRecord[],
  caseFocuses: readonly CaseFocusRecord[] = [],
): ContentReleaseManifest {
  const errors = validateRelease(next, sources, examples, caseFocuses);
  if (errors.length > 0) {
    throw new ReleaseActivationError(errors);
  }
  return freezeRelease(next);
}

/** 回滚到上一个完整批次。历史版本只用于切换，不进入生产检索。 */
export function rollbackRelease(
  history: readonly ContentReleaseManifest[],
  releaseId: string,
): ContentReleaseManifest | null {
  const target = history.find((release) => release.releaseId === releaseId);
  return target === undefined ? null : freezeRelease(target);
}
