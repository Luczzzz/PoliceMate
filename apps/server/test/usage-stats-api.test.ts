import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, type DocumentExampleListResponse, type UsageStatsResponse } from "@policymate/contracts";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { anonymousTokens } from "../src/security";
import { createUsageStats } from "../src/usage-stats";

const contractHeaders = { "x-pm-contract-version": CONTRACT_VERSION };
const protectedHeaders = {
  ...contractHeaders,
  "x-pm-anonymous-token": anonymousTokens.issue().token,
};

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({}),
    staticDir: null,
    enableTestControls: true,
    usageStatsFile: null,
    ...overrides,
  };
}

async function getStats(app: Awaited<ReturnType<typeof buildApp>>): Promise<UsageStatsResponse> {
  const response = await app.inject({ method: "GET", url: "/api/v1/usage-stats", headers: contractHeaders });
  expect(response.statusCode).toBe(200);
  return response.json<UsageStatsResponse>();
}

describe("GET /api/v1/usage-stats", () => {
  it("初始返回零次，携带口径、时区与日期", async () => {
    const app = await buildApp({ config: testConfig(), fixtures: createFixtureControls() });
    const body = await getStats(app);
    expect(body.contractVersion).toBe(CONTRACT_VERSION);
    expect(body.scope).toBe("entry_use");
    expect(body.timeZone).toBe("Asia/Shanghai");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.today).toBe(0);
    expect(body.total).toBe(0);
    await app.close();
  });

  it("三个入口各计一次；页面检索和列表浏览不计数", async () => {
    const usageStats = createUsageStats({ timeZone: "Asia/Shanghai" });
    const app = await buildApp({
      config: testConfig(),
      fixtures: createFixtureControls(),
      usageStats,
    });

    // 文书列表与检索不计数；打开正文才计一次。
    const list = (
      await app.inject({ method: "GET", url: "/api/v1/document-examples", headers: protectedHeaders })
    ).json<DocumentExampleListResponse>();
    expect((await getStats(app)).total).toBe(0);
    const exampleId = list.items[0]!.exampleId;
    await app.inject({
      method: "GET",
      url: `/api/v1/document-examples/${exampleId}`,
      headers: protectedHeaders,
    });
    expect((await getStats(app)).total).toBe(1);

    // 结构化分析提交计一次。
    await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: protectedHeaders,
      payload: { caseText: "昨晚在小区门口，两名住户因停车问题发生争执并推搡。" },
    });
    expect((await getStats(app)).today).toBe(2);

    // 事故问答新建会话计一次。
    await app.inject({
      method: "POST",
      url: "/api/v1/accident-liability/sessions",
      headers: protectedHeaders,
      payload: { caseText: "昨天傍晚在城南路口，一辆小客车与一辆电动自行车相撞，骑车人受轻伤。" },
    });
    expect((await getStats(app)).today).toBe(3);
    expect((await getStats(app)).total).toBe(3);
    await app.close();
  });

  it("流式分析开流后计一次；被拒绝的请求不计数", async () => {
    const app = await buildApp({
      config: testConfig({ reportFormat: "stream" }),
      fixtures: createFixtureControls(),
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/analysis/stream",
      headers: protectedHeaders,
      payload: { caseText: "  " },
    });
    expect((await getStats(app)).total).toBe(0);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/stream",
      headers: protectedHeaders,
      payload: { caseText: "昨晚在小区门口，两名住户因停车问题发生争执并推搡。" },
    });
    expect(response.statusCode).toBe(200);
    expect((await getStats(app)).total).toBe(1);
    await app.close();
  });

  it("测试控制可以重置计数，便于黑盒验收从零开始", async () => {
    const app = await buildApp({ config: testConfig(), fixtures: createFixtureControls() });
    const list = (
      await app.inject({ method: "GET", url: "/api/v1/document-examples", headers: protectedHeaders })
    ).json<DocumentExampleListResponse>();
    await app.inject({
      method: "GET",
      url: `/api/v1/document-examples/${list.items[0]!.exampleId}`,
      headers: protectedHeaders,
    });
    expect((await getStats(app)).total).toBe(1);

    const reset = await app.inject({ method: "POST", url: "/api/test/usage-stats/reset" });
    expect(reset.statusCode).toBe(200);
    expect((await getStats(app)).total).toBe(0);
    await app.close();
  });
});
