import { describe, expect, it } from "vitest";
import type { CandidateFact, CreateAnalysisRequest } from "@policymate/contracts";
import { buildApp, type BuildAppDeps } from "../src/app";
import type { AppConfig } from "../src/config";
import { AnalysisEngine } from "../src/analysis/engine";
import { createFixtureControls } from "../src/providers/fixture";
import {
  AnonymousTokenService,
  ConcurrencyGate,
  FixedWindowRateLimiter,
  isOriginAllowed,
  sanitizeOfficialUrl,
} from "../src/security";

const CONTRACT = "x-pm-contract-version";
const TOKEN = "x-pm-anonymous-token";
const SAMPLE_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
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
    ...overrides,
  };
}

const tokenService = new AnonymousTokenService();
const token = tokenService.issue().token;
const contractHeaders = { [CONTRACT]: "1.0", [TOKEN]: token };

async function makeApp(
  overrides: Partial<AppConfig> = {},
  deps: Omit<BuildAppDeps, "config" | "fixtures"> = {},
) {
  const fixtures = createFixtureControls();
  const app = await buildApp({
    config: testConfig(overrides),
    fixtures,
    tokenService,
    ...deps,
  });
  return { app, fixtures };
}

async function createSession(app: Awaited<ReturnType<typeof buildApp>>, caseText = SAMPLE_TEXT) {
  return app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers: contractHeaders,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
}

describe("短期匿名令牌", () => {
  it("受保护接口缺少令牌时失败关闭，且不泄露内容", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: { [CONTRACT]: "1.0" },
      payload: { caseText: SAMPLE_TEXT },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("token_invalid");
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(SAMPLE_TEXT);
    await app.close();
  });

  it("携带有效令牌时允许访问", async () => {
    const { app } = await makeApp();
    const response = await createSession(app);
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("令牌到期后失败关闭", async () => {
    let now = 1_000;
    const expiring = new AnonymousTokenService(50, () => now);
    const record = expiring.issue();
    expect(expiring.verify(record.token)).toBe(true);
    now += 51;
    expect(expiring.verify(record.token)).toBe(false);

    const fixtures = createFixtureControls();
    const app = await buildApp({
      config: testConfig(),
      fixtures,
      tokenService: expiring,
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/document-examples",
      headers: { [CONTRACT]: "1.0", [TOKEN]: record.token },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("令牌接口返回随机令牌且不包含密钥或内部信息", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/anonymous-tokens",
      headers: { [CONTRACT]: "1.0" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(body.expiresAt).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/dify|api[_-]?key|sk-/i);
    await app.close();
  });
});

describe("来源限制", () => {
  it("拒绝不在允许来源内的 Origin", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shell",
      headers: { [CONTRACT]: "1.0", origin: "https://evil.example", host: "127.0.0.1:8787" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("origin_not_allowed");
    await app.close();
  });

  it("同源请求允许访问", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shell",
      headers: { [CONTRACT]: "1.0", origin: "http://127.0.0.1:8787", host: "127.0.0.1:8787" },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("白名单来源允许访问", async () => {
    const { app } = await makeApp({ allowedOrigins: ["https://trial.example"] });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/shell",
      headers: { [CONTRACT]: "1.0", origin: "https://trial.example", host: "api.internal:8787" },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("无 Origin 的非浏览器请求允许访问", () => {
    expect(isOriginAllowed(undefined, "127.0.0.1:8787", [])).toBe(true);
    expect(isOriginAllowed("null", "127.0.0.1:8787", [])).toBe(false);
  });
});

describe("请求体与流量限制", () => {
  it("超过请求体上限时拒绝且不静默截断", async () => {
    const { app } = await makeApp({ bodyLimitBytes: 512 });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "打".repeat(5_000) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("request_too_large");
    await app.close();
  });

  it("频率超限时返回 429 与重试提示", async () => {
    const { app } = await makeApp(
      {},
      { rateLimiter: new FixedWindowRateLimiter(2, 60_000) },
    );
    const first = await app.inject({
      method: "GET",
      url: "/api/v1/document-examples",
      headers: contractHeaders,
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/v1/document-examples",
      headers: contractHeaders,
    });
    const third = await app.inject({
      method: "GET",
      url: "/api/v1/document-examples",
      headers: contractHeaders,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");
    expect(third.headers["retry-after"]).toBeTruthy();
    await app.close();
  });

  it("并发超限时失败关闭", async () => {
    const slowFixtures = createFixtureControls();
    const reportBound = slowFixtures.analysis.generateReport;
    if (reportBound === undefined) throw new Error("替身边界缺少报告生成能力。");
    const slowAnalysis = {
      async extractCaseFacts() {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          facts: [
            {
              factId: "fact-1",
              category: "behavior",
              categoryLabel: "行为",
              statement: "测试事实",
              originalWording: "测试事实",
              value: null,
              eventRefs: [],
              participantRefs: [],
              behaviorRefs: [],
              status: "candidate",
              statusLabel: "候选事实",
              sourceRound: 0,
              confirmationMethod: null,
              confirmedAt: null,
              riskCategory: null,
              excluded: false,
              replacesFactId: null,
              supersededByFactId: null,
            } satisfies CandidateFact,
          ],
          independentMatters: { detected: false, note: null },
        };
      },
      generateReport: reportBound.bind(slowFixtures.analysis),
    };

    const { app } = await makeApp(
      {},
      {
        analysisEngine: new AnalysisEngine(slowAnalysis),
        concurrencyGate: new ConcurrencyGate(1),
      },
    );

    const [first, second] = await Promise.all([createSession(app), createSession(app)]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 429]);
    await app.close();
  });
});

describe("安全渲染与密钥隔离", () => {
  it("只允许 http(s) 官方链接协议", () => {
    expect(sanitizeOfficialUrl("https://example.gov.cn/law")).toBe("https://example.gov.cn/law");
    expect(sanitizeOfficialUrl("http://example.gov.cn/law")).toBe("http://example.gov.cn/law");
    expect(sanitizeOfficialUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeOfficialUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(sanitizeOfficialUrl(null)).toBeNull();
    expect(sanitizeOfficialUrl("not a url")).toBeNull();
  });

  it("用户响应不暴露密钥、模型名或内部信息", async () => {
    const secret = "sk-canary-dify-secret-value";
    const { app } = await makeApp({ difyApiKey: secret, difyBaseUrl: "https://dify.internal/v1" });

    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/shell", headers: contractHeaders }),
      app.inject({ method: "GET", url: "/api/v1/data-use", headers: contractHeaders }),
      app.inject({ method: "GET", url: "/api/v1/health" }),
      app.inject({ method: "GET", url: "/api/v1/document-examples", headers: contractHeaders }),
    ]);

    for (const response of responses) {
      expect(response.body).not.toContain(secret);
    }
    await app.close();
  });
});
