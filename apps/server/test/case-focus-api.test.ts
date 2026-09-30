import { describe, expect, it } from "vitest";
import type { AnalysisReport, AnalysisSubmissionResponse, CreateAnalysisRequest } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { anonymousTokens } from "../src/security";
import {
  REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS,
  THEFT_FOCUS_ID,
} from "../src/content/property-economic-content";
import { REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS } from "../src/content/public-order-drug-content";
import { REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS } from "../src/content/family-minor-content";

/**
 * 重点案情在统一 HTTP 流程中的接线验证。
 *
 * 场景化验收在 `case-focus-scenarios.test.ts` 直接驱动引擎；这里确认
 * 路由确实把已确认事实交给受治理内容解析，并使用该重点案情的法源，
 * 同时确认 `/api/test/fixtures` 的紧急禁用开关可影响案情分析。
 */

const headers = {
  "x-pm-contract-version": "1.0",
  "x-pm-anonymous-token": anonymousTokens.issue().token,
};

/** 当前批次应装载的全部已发布重点案情数量。 */
const TOTAL_CASE_FOCUS_COUNT =
  REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS.length +
  REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS.length +
  REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS.length;

const THEFT_CASE = "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    providerMode: "fixture",
    enableTestControls: true,
    masterSwitch: true,
    analysisEnabled: true,
    documentsEnabled: true,
    staticDir: null,
    service: { provider: null, contact: null, dataProcessingStatement: null, technicalLoggingBoundary: [] },
    ...overrides,
  };
}

async function makeApp() {
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(), fixtures });
  return { app, fixtures };
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function runToReport(app: App, caseText: string): Promise<AnalysisReport> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
  expect(created.statusCode).toBe(201);
  const submission = created.json() as AnalysisSubmissionResponse;
  const sessionId = submission.state.sessionId;

  // 重点案情匹配只使用已确认事实：从报告进入补充或修改事实，逐项确认后
  // 确认新快照，路由会重新解析重点案情并返回绑定新快照的报告。
  const begin = await app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${sessionId}/modifications`,
    headers,
    payload: {},
  });
  expect(begin.statusCode).toBe(200);

  for (const fact of submission.state.facts) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/facts/${fact.factId}/status`,
      headers,
      payload: { status: "confirmed" },
    });
    expect(response.statusCode).toBe(200);
  }

  const confirmed = await app.inject({
    method: "POST",
    url: `/api/v1/analysis/sessions/${sessionId}/snapshot`,
    headers,
    payload: {},
  });
  expect(confirmed.statusCode).toBe(200);
  return (confirmed.json() as AnalysisSubmissionResponse).report;
}

describe("重点案情在统一分析流程中的接线", () => {
  it("命中盗窃重点案情并使用该案情的受治理法源形成完整报告", async () => {
    const { app } = await makeApp();
    const report = await runToReport(app, THEFT_CASE);

    expect(report.status).toBe("complete");
    expect(report.modules).toHaveLength(6);
    expect(report.caseFocusId).toBe(THEFT_FOCUS_ID);
    expect(report.caseFocusVersion).not.toBeNull();
    const qualification = report.modules.find((module) => module.id === "preliminary_qualification");
    const basis = qualification?.traceLinks[0]?.basis;
    expect(basis?.status).toBe("current");
    expect(basis?.sourceId).toBe("src-cn-theft-interpretation");
    await app.close();
  });

  it("紧急禁用重点案情后，相关分析降级为依据不可用", async () => {
    const { app } = await makeApp();
    const patched = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      headers,
      payload: { caseFocusStatus: { caseFocusId: THEFT_FOCUS_ID, status: "withdrawn" } },
    });
    expect(patched.statusCode).toBe(200);
    const state = patched.json();
    expect(state.eligibleCaseFocusCount).toBe(TOTAL_CASE_FOCUS_COUNT - 1);
    expect(
      (state.caseFocuses as Array<{ caseFocusId: string; eligible: boolean }>).find(
        (item) => item.caseFocusId === THEFT_FOCUS_ID,
      )?.eligible,
    ).toBe(false);

    const report = await runToReport(app, THEFT_CASE);
    expect(report.status).toBe("basis_unavailable");
    expect(report.caseFocusId).toBe(THEFT_FOCUS_ID);
    expect(report.modules.every((module) => module.traceLinks.length === 0)).toBe(true);
    await app.close();
  });

  it("替身控制接口拒绝无效的重点案情状态参数", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      headers,
      payload: { caseFocusStatus: { caseFocusId: "", status: "withdrawn" } },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("法源复核期限到期后重点案情退出生产", async () => {
    const { app } = await makeApp();
    const patched = await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      headers,
      payload: { legalSourcesExpired: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().eligibleCaseFocusCount).toBe(0);

    const report = await runToReport(app, THEFT_CASE);
    expect(report.status).toBe("basis_unavailable");
    await app.close();
  });
});
