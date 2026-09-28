import type { ContentReleaseManifest, GovernedContentSeed, LegalSourceRecord } from "./model";
import { cloneLegalSources } from "./store";
import {
  DOCUMENT_EXAMPLE_VARIANTS,
  createDocumentExampleSources,
  createDocumentExamples,
} from "./document-example-content";
import {
  createPropertyEconomicCaseFocuses,
  createPropertyEconomicSources,
} from "./property-economic-content";
import {
  createPublicOrderDrugCaseFocuses,
  createPublicOrderDrugSources,
} from "./public-order-drug-content";
import {
  createFamilyMinorCaseFocuses,
  createFamilyMinorSources,
} from "./family-minor-content";

/**
 * 受控试行内容种子。
 *
 * 这里的文书范例是第 36 号切片发布的正式试行内容，法源限定为国家公开正式
 * 规范（公安部部门规章）；十组派出所重点案情内容包来自第 33、34、35 号切片。
 * 内容记录本身不可变，治理开关（内容状态、法源状态、复核期限）由
 * `store.ts` 在运行时维护，供紧急下架与测试控制使用。
 *
 * 这些内容不是机关授权、法制审核或者业务审定结论；示例人物、单位、地点、
 * 号码、时间和金额均为虚构。
 */

const MAINTAINER = "受控试行内容维护者";

const RELEASE: ContentReleaseManifest = {
  releaseId: "release-trial-0001",
  version: "1.0.0",
  activatedAt: "2026-09-29T00:00:00.000Z",
  maintainer: MAINTAINER,
  changeNote:
    "受控试行首批试行文书范例与十组派出所重点案情内容包整批激活；文书范例覆盖接报与受理、调查取证和至少一个高风险程序环节。",
  items: DOCUMENT_EXAMPLE_VARIANTS.map((item) => ({
    exampleId: item.exampleId,
    version: item.version,
  })),
  caseFocuses: [],
  legalSources: [],
  testSummary:
    "首批文书范例通过典型检索、相邻不匹配、缺失适用条件、错误程序或角色、别名检索、虚构化与敏感信息、依据追溯、法源撤回与到期禁用以及旧链接阻断检查。",
};

/** 按 sourceId 合并多个内容包的法源，后出现的记录覆盖先出现的同名记录。 */
function mergeSources(...groups: LegalSourceRecord[][]): LegalSourceRecord[] {
  const byId = new Map<string, LegalSourceRecord>();
  for (const group of groups) {
    for (const source of group) byId.set(source.sourceId, source);
  }
  return [...byId.values()];
}

/**
 * 每次调用返回全新的可重置种子，避免测试之间共享可变状态。
 *
 * 种子同时装载首批试行文书范例、十组派出所重点案情内容包和各自的
 * 国家公开法源；全部内容与法源记录都进入同一个不可变发布批次。
 */
export function createFixtureContent(): GovernedContentSeed {
  const caseFocuses = [
    ...createPropertyEconomicCaseFocuses(),
    ...createPublicOrderDrugCaseFocuses(),
    ...createFamilyMinorCaseFocuses(),
  ];
  const sources = mergeSources(
    createDocumentExampleSources(),
    createPropertyEconomicSources(),
    createPublicOrderDrugSources(),
    createFamilyMinorSources(),
  );

  return {
    sources: cloneLegalSources(sources),
    examples: createDocumentExamples(),
    caseFocuses,
    release: {
      ...RELEASE,
      items: RELEASE.items.map((entry) => ({ ...entry })),
      caseFocuses: caseFocuses.map((focus) => ({
        caseFocusId: focus.caseFocusId,
        version: focus.version,
      })),
      legalSources: sources.map((source) => ({
        sourceId: source.sourceId,
        version: source.version,
      })),
    },
  };
}
