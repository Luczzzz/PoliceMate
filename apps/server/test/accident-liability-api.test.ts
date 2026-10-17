import { describe, expect, it } from "vitest";
import {
  ACCIDENT_LIABILITY_DISCLAIMER,
  CONTRACT_VERSION,
  type AccidentLiabilitySessionState,
  type ProductShellResponse,
} from "@policymate/contracts";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls, FIXTURE_ACCIDENT_QUESTION, FIXTURE_ACCIDENT_REPORT } from "../src/providers/fixture";
import { createMemoryTelemetrySink } from "../src/telemetry";
import type { AccidentLiabilityConsultRequest, Providers } from "../src/providers/types";
import { anonymousTokens } from "../src/security";

const caseText = "昨天傍晚在城南路口，一辆小客车与一辆电动自行车相撞，骑车人受轻伤。";
const BASE = "/api/v1/accident-liability/sessions";
const headers = () => ({
  "x-pm-contract-version": CONTRACT_VERSION,
  "x-pm-anonymous-token": anonymousTokens.issue().token,
});
const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...loadConfig({}),
  staticDir: null,
  enableTestControls: false,
  ...over,
});

async function createSession(app: Awaited<ReturnType<typeof buildApp>>, text = caseText) {
  return app.inject({ method: "POST", url: BASE, headers: headers(), payload: { caseText: text } });
}

describe("GET /api/v1/shell 的交通事故责任认定入口", () => {
  it("替身模式下入口可用", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const body = (await app.inject({ method: "GET", url: "/api/v1/shell", headers: { "x-pm-contract-version": CONTRACT_VERSION } })).json<ProductShellResponse>();
    expect(body.entries.accidentLiability).toEqual({ available: true, reason: null });
  });

  it("入口开关关闭或边界不支持多轮问答时失败关闭", async () => {
    const off = await buildApp({ config: config({ accidentLiabilityEnabled: false }), fixtures: createFixtureControls() });
    const offBody = (await off.inject({ method: "GET", url: "/api/v1/shell", headers: { "x-pm-contract-version": CONTRACT_VERSION } })).json<ProductShellResponse>();
    expect(offBody.entries.accidentLiability.available).toBe(false);
    expect(offBody.entries.accidentLiability.reason).toContain("停用");
    expect(offBody.entries.caseAnalysis.available).toBe(true);

    const fixtures = createFixtureControls();
    const providers: Providers = { ...fixtures, accidentLiability: {} };
    const unsupported = await buildApp({ config: config(), providers });
    const body = (await unsupported.inject({ method: "GET", url: "/api/v1/shell", headers: { "x-pm-contract-version": CONTRACT_VERSION } })).json<ProductShellResponse>();
    expect(body.entries.accidentLiability.available).toBe(false);
    expect(body.entries.accidentLiability.reason).toContain("多轮问答");
  });

  it("总开关关闭时三个入口都不可用", async () => {
    const app = await buildApp({ config: config({ masterSwitch: false }), fixtures: createFixtureControls() });
    const body = (await app.inject({ method: "GET", url: "/api/v1/shell", headers: { "x-pm-contract-version": CONTRACT_VERSION } })).json<ProductShellResponse>();
    expect(body.entries.accidentLiability.available).toBe(false);
    expect(body.entries.accidentLiability.reason).toContain("暂停");
  });
});

describe("交通事故责任认定问答接口", () => {
  it("提交事故概况后返回第一轮追问，并记录问答历史", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const response = await createSession(app);
    expect(response.statusCode).toBe(201);
    const state = response.json<AccidentLiabilitySessionState>();
    expect(state.contractVersion).toBe(CONTRACT_VERSION);
    expect(state.stage).toBe("questioning");
    expect(state.report).toBeNull();
    expect(state.disclaimer).toBe(ACCIDENT_LIABILITY_DISCLAIMER);
    expect(state.turns).toHaveLength(2);
    expect(state.turns[0]).toMatchObject({ speaker: "officer", text: caseText });
    expect(state.turns[1]).toMatchObject({ speaker: "assistant", text: FIXTURE_ACCIDENT_QUESTION });
  });

  it("回答追问后生成研判报告，报告与完整问答记录一起返回", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    const answered = await app.inject({
      method: "POST",
      url: `${BASE}/${created.sessionId}/answers`,
      headers: headers(),
      payload: { answer: "小客车直行，电动自行车左转，路口有信号灯。" },
    });
    expect(answered.statusCode).toBe(200);
    const state = answered.json<AccidentLiabilitySessionState>();
    expect(state.stage).toBe("report_ready");
    expect(state.report).toBe(FIXTURE_ACCIDENT_REPORT);
    for (const section of ["【责任认定】", "法律依据", "程序要点", "关键事实"]) {
      expect(state.report).toContain(section);
    }
    expect(state.turns.map((turn) => turn.speaker)).toEqual(["officer", "assistant", "officer"]);
  });

  it("民警可以主动要求直接生成报告，即使模型仍想追问", async () => {
    const seen: AccidentLiabilityConsultRequest[] = [];
    const fixtures = createFixtureControls();
    const providers: Providers = {
      ...fixtures,
      accidentLiability: {
        async consultAccidentLiability(request) {
          seen.push(request);
          return { kind: "question", text: "还需要更多信息。" };
        },
      },
    };
    const app = await buildApp({ config: config(), providers });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    expect(created.stage).toBe("questioning");
    const forced = await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/report`, headers: headers() });
    // 边界未按要求给报告时整体失败关闭，不展示半成品。
    expect(forced.statusCode).toBe(503);
    expect(seen.at(-1)?.forceReport).toBe(true);
    // 失败没有把会话推进到 report_ready：仍可继续回答。
    const continued = await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "补充信息。" } });
    expect(continued.statusCode).toBe(200);
    expect(continued.json<AccidentLiabilitySessionState>().stage).toBe("questioning");
  });

  it("把完整问答记录与本次受治理法源交给边界", async () => {
    const seen: AccidentLiabilityConsultRequest[] = [];
    const fixtures = createFixtureControls();
    const providers: Providers = {
      ...fixtures,
      accidentLiability: {
        async consultAccidentLiability(request) {
          seen.push(request);
          const officerTurns = request.turns.filter((turn) => turn.speaker === "officer").length;
          return officerTurns >= 2
            ? { kind: "report", text: "一、事故概况\n二、责任认定\n三、法律依据\n四、后续程序建议" }
            : { kind: "question", text: "请说明路口信号灯状态。" };
        },
      },
    };
    const app = await buildApp({ config: config(), providers });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "绿灯。" } });
    expect(seen).toHaveLength(2);
    expect(seen[1].turns).toHaveLength(3);
    expect(seen[1].forceReport).toBe(false);
    expect(seen[1].legalSources.length).toBeGreaterThan(0);
  });

  it("清除会话后不再是有效会话", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    const cleared = await app.inject({ method: "DELETE", url: `${BASE}/${created.sessionId}`, headers: headers() });
    expect(cleared.statusCode).toBe(200);
    const after = await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "继续。" } });
    expect(after.statusCode).toBe(404);
  });

  it("已生成报告后不能再追加回答", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    const answered = (await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "补充信息。" } })).json<AccidentLiabilitySessionState>();
    expect(answered.stage).toBe("report_ready");
    const again = await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "再来一轮。" } });
    expect(again.statusCode).toBe(409);
  });

  it("沿用鉴权与输入校验：无令牌 401，空/超长/含控制字符的输入 400", async () => {
    const app = await buildApp({ config: config(), fixtures: createFixtureControls() });
    const noToken = await app.inject({ method: "POST", url: BASE, headers: { "x-pm-contract-version": CONTRACT_VERSION, "content-type": "application/json" }, payload: { caseText } });
    expect(noToken.statusCode).toBe(401);
    expect((await createSession(app, "   ")).statusCode).toBe(400);
    expect((await createSession(app, "字".repeat(10_001))).statusCode).toBe(400);
    expect((await createSession(app, "含控制字符\u0007的事故")).statusCode).toBe(400);

    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    const emptyAnswer = await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "" } });
    expect(emptyAnswer.statusCode).toBe(400);
    expect(emptyAnswer.json<{ error: { code: string } }>().error.code).toBe("invalid_input");
  });

  it("功能停用或上游不可用时失败关闭为 503", async () => {
    const off = await buildApp({ config: config({ accidentLiabilityEnabled: false }), fixtures: createFixtureControls() });
    const offResponse = await createSession(off);
    expect(offResponse.statusCode).toBe(503);
    expect(offResponse.json<{ error: { code: string } }>().error.code).toBe("feature_disabled");

    const fixtures = createFixtureControls();
    fixtures.updateState({ analysisAvailable: false });
    const down = await buildApp({ config: config(), fixtures });
    expect((await createSession(down)).statusCode).toBe(503);
  });

  it("边界连续返回非法结构时整体失败关闭，且不写入会话", async () => {
    const fixtures = createFixtureControls();
    const providers: Providers = {
      ...fixtures,
      accidentLiability: {
        async consultAccidentLiability() {
          return { kind: "report", text: "   " } as unknown as { kind: "report"; text: string };
        },
      },
    };
    const app = await buildApp({ config: config({ maxProviderAttempts: 2 }), providers });
    const response = await createSession(app);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("   ");
  });

  it("遥测只记非内容元数据，不含事故概况、追问或报告正文", async () => {
    const telemetry = createMemoryTelemetrySink();
    const app = await buildApp({ config: config(), fixtures: createFixtureControls(), telemetry });
    const created = (await createSession(app)).json<AccidentLiabilitySessionState>();
    await app.inject({ method: "POST", url: `${BASE}/${created.sessionId}/answers`, headers: headers(), payload: { answer: "绿灯直行，电动自行车左转。" } });
    const dumps = JSON.stringify(telemetry.events);
    expect(dumps).not.toContain("电动自行车");
    expect(dumps).not.toContain("城南路口");
    expect(dumps).not.toContain("责任认定");
    expect(telemetry.events.some((event) => event.kind === "accident.consult" && event.outcome === "ok")).toBe(true);
  });
});
