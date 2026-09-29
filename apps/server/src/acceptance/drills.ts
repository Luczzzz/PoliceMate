import {
  FACT_STATUS_LABELS,
  type CandidateFact,
  type CreateAnalysisRequest,
  type GenerateReportRequest,
} from "@policymate/contracts";
import { buildApp } from "../app";
import type { AppConfig } from "../config";
import { extractCaseFactsFixture } from "../analysis/fixture-extract";
import {
  isDocumentRetrievalEnabled,
  loadCapabilityInputs,
  resolveCaseAnalysisAvailability,
  resolveDocumentExamplesAvailability,
  type CapabilityConfig,
} from "../capabilities";
import {
  ContentAssetError,
  exportContentAssets,
  rebuildReleaseFromAssets,
  serializeContentAssets,
} from "../content/assets";
import { createFixtureContent } from "../content/fixture-content";
import { activateRelease, ReleaseActivationError, rollbackRelease } from "../content/release";
import { THEFT_FOCUS_ID } from "../content/property-economic-content";
import { createFixtureControls, type FixtureControls } from "../providers/fixture";
import { AnonymousTokenService } from "../security";
import { createMemoryTelemetrySink } from "../telemetry";
import type { DrillResult } from "./types";

/**
 * 受控试行紧急停止与内容批次演练。
 *
 * 演练只使用确定性替身边界，不连接真实 Dify 或真实内容源；每项演练都验证
 * “立即失效、失败关闭、可恢复或不可绕过”的外部可观察行为，不包含任何案情、
 * 事实或报告内容。
 */

const DRILL_NOW = new Date("2026-10-01T00:00:00.000Z");

/** 全部演练 ID；发布检查要求每个 ID 都有结果，且都被验收矩阵引用。 */
export const ACCEPTANCE_DRILL_IDS: string[] = [
  "drill-master-switch",
  "drill-analysis-entry-disabled",
  "drill-documents-entry-disabled",
  "drill-legal-source-repealed",
  "drill-legal-source-uncertain",
  "drill-single-example-withdrawn",
  "drill-single-case-focus-disabled",
  "drill-content-expiry",
  "drill-source-expiry",
  "drill-no-eligible-examples",
  "drill-fail-closed-status",
  "drill-release-activation-atomic",
  "drill-release-rollback",
  "drill-release-rebuild-from-assets",
  "drill-privacy-canary",
];

function result(
  id: string,
  title: string,
  checks: [label: string, ok: boolean][],
): DrillResult {
  const evidence = checks.map(([label, ok]) => `${ok ? "通过" : "失败"}：${label}`);
  return { id, title, passed: checks.every(([, ok]) => ok), evidence };
}

async function capabilityAvailability(
  fixtures: FixtureControls,
  config: CapabilityConfig,
): Promise<{
  analysis: ReturnType<typeof resolveCaseAnalysisAvailability>;
  documents: ReturnType<typeof resolveDocumentExamplesAvailability>;
}> {
  const inputs = await loadCapabilityInputs(config, fixtures);
  return {
    analysis: resolveCaseAnalysisAvailability(inputs),
    documents: resolveDocumentExamplesAvailability(inputs),
  };
}

function confirmedFactsOf(caseText: string): CandidateFact[] {
  return extractCaseFactsFixture(caseText).facts.map((fact) => ({
    ...fact,
    status: "confirmed" as const,
    statusLabel: FACT_STATUS_LABELS.confirmed,
  }));
}

function baseCapabilityConfig(overrides: Partial<CapabilityConfig> = {}): CapabilityConfig {
  return { masterSwitch: true, analysisEnabled: true, documentsEnabled: true, ...overrides };
}

/* ---------- 紧急停止演练 ---------- */

async function drillMasterSwitch(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  const availability = await capabilityAvailability(fixtures, baseCapabilityConfig({ masterSwitch: false }));
  return result("drill-master-switch", "后端总开关关闭时两个入口同时不可用且正文检索失败关闭", [
    ["案情分析入口不可用", availability.analysis.available === false],
    ["文书范例入口不可用", availability.documents.available === false],
    ["文书正文检索失败关闭", isDocumentRetrievalEnabled(baseCapabilityConfig({ masterSwitch: false })) === false],
  ]);
}

async function drillAnalysisEntryDisabled(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  const availability = await capabilityAvailability(fixtures, baseCapabilityConfig({ analysisEnabled: false }));
  return result("drill-analysis-entry-disabled", "案情分析入口停用时文书范例仍可用", [
    ["案情分析入口不可用", availability.analysis.available === false],
    ["文书范例入口仍可用", availability.documents.available === true],
  ]);
}

async function drillDocumentsEntryDisabled(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  const availability = await capabilityAvailability(fixtures, baseCapabilityConfig({ documentsEnabled: false }));
  return result("drill-documents-entry-disabled", "文书范例入口停用时正文检索失败关闭而案情分析不受影响", [
    ["文书范例入口不可用", availability.documents.available === false],
    ["文书正文检索失败关闭", isDocumentRetrievalEnabled(baseCapabilityConfig({ documentsEnabled: false })) === false],
    ["案情分析入口仍可用", availability.analysis.available === true],
  ]);
}

async function drillLegalSourceStatus(status: "repealed" | "uncertain"): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  fixtures.updateState({ legalSourceStatusAll: status });
  const release = await fixtures.content.getActiveRelease();
  const index = await fixtures.content.listExamples();
  const availability = await capabilityAvailability(fixtures, baseCapabilityConfig());
  return result(
    status === "repealed" ? "drill-legal-source-repealed" : "drill-legal-source-uncertain",
    `法源状态变为 ${status} 时依赖内容立即退出生产`,
    [
      ["没有合格文书范例", release.eligibleExampleCount === 0],
      ["列表为空", index.items.length === 0],
      ["文书范例入口不可用", availability.documents.available === false],
    ],
  );
}

async function drillSingleExampleWithdrawn(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  const before = await fixtures.content.listExamples();
  const target = before.items[0]?.exampleId;
  if (target === undefined) {
    return result("drill-single-example-withdrawn", "单项下架只影响指定范例且旧链接不可访问", [
      ["存在可下架的合格范例", false],
    ]);
  }
  fixtures.updateState({ exampleStatus: { exampleId: target, status: "withdrawn" } });
  const after = await fixtures.content.listExamples();
  const lookup = await fixtures.content.getExample(target);
  return result("drill-single-example-withdrawn", "单项下架只影响指定范例且旧链接不可访问", [
    ["目标范例退出列表", !after.items.some((item) => item.exampleId === target)],
    ["其余范例仍在列表", after.items.length === before.items.length - 1],
    ["旧标识返回不可用", lookup.outcome === "unavailable"],
  ]);
}

async function drillSingleCaseFocusDisabled(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  fixtures.updateState({ caseFocusStatus: { caseFocusId: THEFT_FOCUS_ID, status: "withdrawn" } });
  const facts = confirmedFactsOf("3月2日，张某盗窃李某停放在楼下的电动车。");
  const resolution = await fixtures.content.resolveCaseFocus!(facts, DRILL_NOW);
  return result("drill-single-case-focus-disabled", "单项禁用重点案情后命中仍成立但停止限定法源", [
    ["仍命中重点案情", resolution.matchedCaseFocusIds.includes(THEFT_FOCUS_ID)],
    ["命中内容已不合格", resolution.caseFocusEligible === false],
    ["不再提供该重点案情法源", resolution.legalSources.length === 0],
  ]);
}

async function drillContentExpiry(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  fixtures.updateState({ examplesExpired: true, caseFocusesExpired: true });
  const expiredRelease = await fixtures.content.getActiveRelease();
  const snapshot = fixtures.describe();
  fixtures.updateState({ examplesExpired: false, caseFocusesExpired: false });
  const restoredRelease = await fixtures.content.getActiveRelease();
  const restored = fixtures.describe();
  return result("drill-content-expiry", "内容到期后全部退出生产，恢复核验期限后重新可用", [
    ["到期后合格文书范例为 0", expiredRelease.eligibleExampleCount === 0],
    ["到期后合格重点案情为 0", snapshot.eligibleCaseFocusCount === 0],
    ["恢复后合格文书范例大于 0", restoredRelease.eligibleExampleCount > 0],
    ["恢复后合格重点案情大于 0", restored.eligibleCaseFocusCount > 0],
  ]);
}

async function drillSourceExpiry(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  fixtures.updateState({ legalSourcesExpired: true });
  const expired = await fixtures.content.getActiveRelease();
  fixtures.updateState({ legalSourcesExpired: false });
  const restored = await fixtures.content.getActiveRelease();
  return result("drill-source-expiry", "法源核验到期时依赖内容退出生产，恢复后重新可用", [
    ["到期后合格文书范例为 0", expired.eligibleExampleCount === 0],
    ["恢复后合格文书范例大于 0", restored.eligibleExampleCount > 0],
  ]);
}

async function drillNoEligibleExamples(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  fixtures.updateState({ exampleStatusAll: "withdrawn" });
  const availability = await capabilityAvailability(fixtures, baseCapabilityConfig());
  return result("drill-no-eligible-examples", "没有合格范例时入口提前显示暂不可用", [
    ["文书范例入口不可用", availability.documents.available === false],
    ["原因指向没有已核验范例", (availability.documents.reason ?? "").includes("已核验")],
  ]);
}

async function drillFailClosedStatus(): Promise<DrillResult> {
  const fixtures = createFixtureControls();
  const index = await fixtures.content.listExamples();
  const existing = index.items[0]?.exampleId;
  const unknown = await fixtures.content.getExample("example-does-not-exist");
  fixtures.updateState({ exampleStatusAll: "withdrawn" });
  const withdrawn = existing === undefined ? null : await fixtures.content.getExample(existing);
  return result("drill-fail-closed-status", "无法确认可用状态时失败关闭，未知与失效标识严格区分", [
    ["未知标识返回 not_found", unknown.outcome === "not_found"],
    ["失效标识返回 unavailable", withdrawn?.outcome === "unavailable"],
  ]);
}

/* ---------- 内容批次演练 ---------- */

function releaseActivationAtomic(): DrillResult {
  const seed = createFixtureContent();
  const sources = new Map(seed.sources.map((source) => [source.sourceId, source]));
  const current = activateRelease(null, seed.release, sources, seed.examples, seed.caseFocuses);
  const broken = {
    ...seed.release,
    releaseId: "release-broken-partial",
    legalSources: seed.release.legalSources.slice(1),
  };
  let threw = false;
  try {
    activateRelease(current, broken, sources, seed.examples, seed.caseFocuses);
  } catch (error) {
    threw = error instanceof ReleaseActivationError;
  }
  return result("drill-release-activation-atomic", "批次部分校验失败时整批拒绝并保持上一完整批次", [
    ["激活抛出批次校验错误", threw],
    ["上一批次保持激活", current.releaseId === seed.release.releaseId],
  ]);
}

function releaseRollback(): DrillResult {
  const seed = createFixtureContent();
  const sources = new Map(seed.sources.map((source) => [source.sourceId, source]));
  const previous = activateRelease(null, seed.release, sources, seed.examples, seed.caseFocuses);
  const next = activateRelease(
    previous,
    { ...seed.release, releaseId: "release-trial-0002" },
    sources,
    seed.examples,
    seed.caseFocuses,
  );
  const rolled = rollbackRelease([previous, next], previous.releaseId);
  const unknown = rollbackRelease([previous, next], "release-does-not-exist");
  return result("drill-release-rollback", "整体回滚切回上一完整批次，未知批次返回空", [
    ["回滚命中上一批次", rolled?.releaseId === previous.releaseId],
    ["未知批次返回 null", unknown === null],
  ]);
}

function releaseRebuildFromAssets(): DrillResult {
  const seed = createFixtureContent();
  const bundle = exportContentAssets(seed, "2026-09-29T00:00:00.000Z");
  const rebuilt = rebuildReleaseFromAssets(serializeContentAssets(bundle));
  const itemsMatch =
    JSON.stringify(rebuilt.release.items) === JSON.stringify(seed.release.items) &&
    JSON.stringify(rebuilt.release.caseFocuses) === JSON.stringify(seed.release.caseFocuses) &&
    JSON.stringify(rebuilt.release.legalSources) === JSON.stringify(seed.release.legalSources);
  let corruptedRejected = false;
  try {
    rebuildReleaseFromAssets(JSON.stringify({ formatVersion: 0, seed: {} }));
  } catch (error) {
    corruptedRejected = error instanceof ContentAssetError;
  }
  let brokenRejected = false;
  try {
    rebuildReleaseFromAssets(
      JSON.stringify({
        ...bundle,
        seed: {
          ...bundle.seed,
          release: { ...bundle.seed.release, legalSources: bundle.seed.release.legalSources.slice(1) },
        },
      }),
    );
  } catch (error) {
    brokenRejected = error instanceof ReleaseActivationError;
  }
  return result("drill-release-rebuild-from-assets", "可从版本化结构化资产重建当前批次，损坏资产被拒绝", [
    ["批次 ID 一致", rebuilt.release.releaseId === seed.release.releaseId],
    ["内容项、重点案情与法源版本一致", itemsMatch],
    ["格式版本不受支持时拒绝", corruptedRejected],
    ["发布校验失败时拒绝", brokenRejected],
  ]);
}

/* ---------- 隐私 canary 演练 ---------- */

const PRIVACY_CANARY = "CANARY-3c91f7-不得到达任何持久化或日志";

function privacyTestConfig(): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    providerMode: "fixture",
    enableTestControls: false,
    masterSwitch: true,
    analysisEnabled: true,
    documentsEnabled: true,
    staticDir: null,
    service: {
      provider: null,
      contact: null,
      dataProcessingStatement: null,
      technicalLoggingBoundary: [],
    },
  };
}

async function drillPrivacyCanary(): Promise<DrillResult> {
  const telemetry = createMemoryTelemetrySink();
  const fixtures = createFixtureControls();
  const tokenService = new AnonymousTokenService();
  const app = await buildApp({ config: privacyTestConfig(), fixtures, tokenService, telemetry });
  const headers = {
    "x-pm-contract-version": "1.0",
    "x-pm-anonymous-token": tokenService.issue().token,
  };
  // 案情分析响应会把民警自己输入的内容返回给本人；不在这里断言回显，
  // 只检查不应携带案情的元数据接口与运行元数据。
  const metadataResponses: string[] = [];
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers,
      payload: {
        caseText: `3月2日晚上，张某在城南市场门口殴打李某。${PRIVACY_CANARY}`,
      } satisfies CreateAnalysisRequest,
    });
    const sessionId = created.json().sessionId as string;

    const rounds = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/rounds`,
      headers,
      payload: { answers: [] },
    });
    let current = rounds.json();
    let guard = 0;
    while (current.stage === "collecting_answers" && guard < 6) {
      guard += 1;
      current = (
        await app.inject({
          method: "POST",
          url: `/api/v1/analysis/sessions/${sessionId}/rounds`,
          headers,
          payload: {
            answers: current.questions.map((question: { questionId: string }) => ({
              questionId: question.questionId,
              kind: "value",
              text: PRIVACY_CANARY,
            })),
          },
        })
      ).json();
    }

    const snapshotResponse = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/snapshot`,
      headers,
      payload: {},
    });
    const snapshot = snapshotResponse.json().snapshot;

    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/report`,
      headers,
      payload: {
        contractVersion: "1.0",
        requestId: "44444444-4444-4444-8444-444444444444",
        snapshotVersion: snapshot.snapshotVersion,
        snapshotHash: snapshot.snapshotHash,
      } satisfies GenerateReportRequest,
    });

    for (const url of [
      "/api/v1/shell",
      "/api/v1/data-use",
      "/api/v1/document-examples",
      `/api/v1/document-examples?q=${encodeURIComponent(PRIVACY_CANARY)}`,
    ]) {
      const response = await app.inject({ method: "GET", url, headers });
      metadataResponses.push(response.body);
    }
  } finally {
    await app.close();
  }

  const telemetryJson = JSON.stringify(telemetry.events);
  const metadataJson = metadataResponses.join("\n");
  return result("drill-privacy-canary", "合成 canary 不进入遥测、元数据接口或缓存", [
    ["canary 不进入遥测", !telemetryJson.includes(PRIVACY_CANARY)],
    ["canary 不进入元数据接口", !metadataJson.includes(PRIVACY_CANARY)],
    ["canary 不以 URL 编码形式进入遥测", !telemetryJson.includes(encodeURIComponent(PRIVACY_CANARY))],
    ["遥测记录已产生", telemetry.events.length > 0],
  ]);
}

/**
 * 运行全部紧急停止与内容批次演练。返回结果按 `ACCEPTANCE_DRILL_IDS` 顺序排列。
 */
export async function runAcceptanceDrills(): Promise<DrillResult[]> {
  return [
    await drillMasterSwitch(),
    await drillAnalysisEntryDisabled(),
    await drillDocumentsEntryDisabled(),
    await drillLegalSourceStatus("repealed"),
    await drillLegalSourceStatus("uncertain"),
    await drillSingleExampleWithdrawn(),
    await drillSingleCaseFocusDisabled(),
    await drillContentExpiry(),
    await drillSourceExpiry(),
    await drillNoEligibleExamples(),
    await drillFailClosedStatus(),
    releaseActivationAtomic(),
    releaseRollback(),
    releaseRebuildFromAssets(),
    await drillPrivacyCanary(),
  ];
}
