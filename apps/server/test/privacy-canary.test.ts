import { describe, expect, it } from "vitest";
import type { CreateAnalysisRequest, GenerateReportRequest } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { AnonymousTokenService } from "../src/security";
import { createMemoryTelemetrySink } from "../src/telemetry";

/**
 * 合成 canary 验收。
 *
 * 规格 11.2：案情正文、事实值、追问答案、报告正文、检索词和临时工作台标记
 * 不得进入业务数据库、分析历史、可回放日志或第三方分析工具。这里用唯一
 * canary 字符串覆盖服务端可观察的所有出口：运行元数据、元数据接口与缓存头。
 */

const CONTRACT = "x-pm-contract-version";
const TOKEN = "x-pm-anonymous-token";
const CANARY = "CANARY-9d21c4-不得持久化";
const SAMPLE_TEXT = `3月2日晚上，张某在城南市场门口殴打李某。${CANARY}`;

function testConfig(): AppConfig {
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

describe("合成 canary 不进入遥测、日志、缓存或第三方工具", () => {
  it("案情正文、事实值、追问答案、报告正文与搜索词均不进入运行元数据", async () => {
    const telemetry = createMemoryTelemetrySink();
    const tokenService = new AnonymousTokenService();
    const fixtures = createFixtureControls();
    const app = await buildApp({ config: testConfig(), fixtures, tokenService, telemetry });
    const headers = { [CONTRACT]: "1.0", [TOKEN]: tokenService.issue().token };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers,
      payload: { caseText: SAMPLE_TEXT } satisfies CreateAnalysisRequest,
    });
    expect(created.statusCode).toBe(201);
    const sessionId = created.json().sessionId as string;

    let current = (
      await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${sessionId}/rounds`,
        headers,
        payload: { answers: [] },
      })
    ).json();
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
              text: CANARY,
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
        requestId: "66666666-6666-4666-8666-666666666666",
        snapshotVersion: snapshot.snapshotVersion,
        snapshotHash: snapshot.snapshotHash,
      } satisfies GenerateReportRequest,
    });
    await app.inject({ method: "GET", url: `/api/v1/document-examples?q=${CANARY}`, headers });
    await app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers,
      payload: { contractVersion: "1.0", category: "conclusion_hard_to_understand" },
    });

    const serialized = JSON.stringify(telemetry.events);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain(encodeURIComponent(CANARY));
    expect(serialized).not.toContain("殴打");
    expect(telemetry.events.length).toBeGreaterThan(0);
    await app.close();
  });

  it("元数据接口不回显 canary，检索词只保留在页面内存", async () => {
    const tokenService = new AnonymousTokenService();
    const app = await buildApp({
      config: testConfig(),
      fixtures: createFixtureControls(),
      tokenService,
    });
    const headers = { [CONTRACT]: "1.0", [TOKEN]: tokenService.issue().token };

    const shell = await app.inject({ method: "GET", url: "/api/v1/shell", headers });
    const dataUse = await app.inject({ method: "GET", url: "/api/v1/data-use", headers });
    const search = await app.inject({
      method: "GET",
      url: `/api/v1/document-examples?q=${CANARY}`,
      headers,
    });

    expect(shell.body).not.toContain(CANARY);
    expect(dataUse.body).not.toContain(CANARY);
    expect(search.body).not.toContain(CANARY);
    // 检索词由客户端本地索引处理；后端响应与请求头都禁止缓存。
    expect(search.headers["cache-control"]).toBe("no-store");
    await app.close();
  });

  it("API 响应禁止缓存，缓存不能成为持久化出口", async () => {
    const tokenService = new AnonymousTokenService();
    const app = await buildApp({
      config: testConfig(),
      fixtures: createFixtureControls(),
      tokenService,
    });
    const headers = { [CONTRACT]: "1.0", [TOKEN]: tokenService.issue().token };
    for (const url of ["/api/v1/shell", "/api/v1/data-use", "/api/v1/document-examples"]) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    await app.close();
  });
});
