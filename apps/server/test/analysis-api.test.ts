import { describe, expect, it } from "vitest";
import type { CandidateFact, CreateAnalysisRequest } from "@policymate/contracts";
import { ANALYSIS_TOTAL_QUESTION_LIMIT } from "@policymate/contracts";
import { buildApp } from "../src/app";
import type { AppConfig } from "../src/config";
import { AnalysisEngine } from "../src/analysis/engine";
import { createFixtureControls } from "../src/providers/fixture";

const contractHeaders = { "x-pm-contract-version": "1.0" };

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

async function makeApp(overrides: Partial<AppConfig> = {}) {
  const fixtures = createFixtureControls();
  const app = await buildApp({ config: testConfig(overrides), fixtures });
  return { app, fixtures };
}

async function createSession(app: Awaited<ReturnType<typeof buildApp>>, caseText: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/analysis/sessions",
    headers: contractHeaders,
    payload: { caseText } satisfies CreateAnalysisRequest,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

const SAMPLE_TEXT = "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。";

describe("POST /api/v1/analysis/sessions", () => {
  it("提取候选事实并返回确认阶段状态", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);

    expect(state.stage).toBe("confirming_facts");
    expect(state.contractVersion).toBe("1.0");
    expect(state.facts.length).toBeGreaterThan(0);
    expect(state.caseCharacterCount).toBe(Array.from(SAMPLE_TEXT).length);
    for (const fact of state.facts) {
      expect(fact.status).toBe("candidate");
      expect(fact.factId).toMatch(/^fact-/);
      expect(fact.originalWording).not.toBe("");
    }
    await app.close();
  });

  it("拒绝超过 10,000 字符的案情，且不静默截断", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "打".repeat(10_001) },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("10,000");
    await app.close();
  });

  it("拒绝包含控制字符等非纯文本内容", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "案情\u0000内容" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("纯文本");
    await app.close();
  });

  it("拒绝空案情并要求契约版本请求头", async () => {
    const { app } = await makeApp();
    const empty = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: "   " },
    });
    expect(empty.statusCode).toBe(400);

    const noHeader = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(noHeader.statusCode).toBe(400);
    await app.close();
  });

  it("分析服务不可用时失败关闭", async () => {
    const { app } = await makeApp();
    await app.inject({
      method: "POST",
      url: "/api/test/fixtures",
      headers: contractHeaders,
      payload: { difyAvailable: false },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("service_unavailable");
    await app.close();
  });

  it("案情分析能力停用时失败关闭", async () => {
    const { app } = await makeApp({ analysisEnabled: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});

describe("事实确认", () => {
  it("逐项标记确认、否认、未知、争议并记录确认元数据", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);

    const [first, second, third] = state.facts;
    for (const [fact, status] of [
      [first, "confirmed"],
      [second, "denied"],
      [third, "disputed"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${fact.factId}/status`,
        headers: contractHeaders,
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
    }

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    const body = after.json();
    expect(body.facts[0].status).toBe("confirmed");
    expect(body.facts[0].confirmedAt).not.toBeNull();
    expect(body.facts[1].status).toBe("denied");
    expect(body.facts[2].status).toBe("disputed");
    const untouched = body.facts.find((fact: CandidateFact) => fact.factId === state.facts[3].factId);
    expect(untouched.status).toBe("candidate");
    await app.close();
  });

  it("拒绝无效状态值", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${state.facts[0].factId}/status`,
      headers: contractHeaders,
      payload: { status: "candidate" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("民警可以新增遗漏事实；删除只表示不纳入本次分析", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts`,
      headers: contractHeaders,
      payload: { statement: "嫌疑人在逃，暂未到案。" },
    });
    expect(added.statusCode).toBe(200);
    const addedBody = added.json();
    const addedFact = addedBody.facts.find((fact: CandidateFact) => fact.factId.startsWith("fact-user-"));
    expect(addedFact.statement).toBe("嫌疑人在逃，暂未到案。");
    expect(addedFact.sourceRound).toBeNull();

    const target = state.facts[0];
    const excluded = await app.inject({
      method: "PUT",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${target.factId}/exclusion`,
      headers: contractHeaders,
      payload: { excluded: true },
    });
    expect(excluded.statusCode).toBe(200);
    const excludedFact = excluded.json().facts.find((fact: CandidateFact) => fact.factId === target.factId);
    expect(excludedFact.excluded).toBe(true);
    // 排除不改变事实状态：不等于确认其没有发生。
    expect(excludedFact.status).toBe(target.status);

    const restored = await app.inject({
      method: "PUT",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${target.factId}/exclusion`,
      headers: contractHeaders,
      payload: { excluded: false },
    });
    expect(restored.json().facts.find((fact: CandidateFact) => fact.factId === target.factId).excluded).toBe(false);
    await app.close();
  });
});

describe("决定性追问", () => {
  async function startQuestions(app: Awaited<ReturnType<typeof buildApp>>, sessionId: string) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/rounds`,
      headers: contractHeaders,
      payload: { answers: [] },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it("第一轮返回不超过 5 个问题，每题带确认理由", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);
    const round1 = await startQuestions(app, state.sessionId);

    expect(round1.stage).toBe("collecting_answers");
    expect(round1.questions.length).toBeGreaterThan(0);
    expect(round1.questions.length).toBeLessThanOrEqual(5);
    expect(round1.questions[0].round).toBe(1);
    for (const question of round1.questions) {
      expect(question.whyItMatters).not.toBe("");
      expect(question.answerMaxLength).toBe(2000);
    }
    await app.close();
  });

  it("未答完本轮问题时拒绝提交且不产生部分状态", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);
    const round1 = await startQuestions(app, state.sessionId);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/rounds`,
      headers: contractHeaders,
      payload: {
        answers: [{ questionId: round1.questions[0].questionId, kind: "unknown", text: null }],
      },
    });
    expect(response.statusCode).toBe(400);

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    expect(after.json().answers).toHaveLength(0);
    await app.close();
  });

  it("最多三轮、每轮五问、总计十二问；达到上限仍有缺口时保留不足状态", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);

    let current = await startQuestions(app, state.sessionId);
    const allQuestionIds: string[] = [];
    let rounds = 0;

    while (current.stage === "collecting_answers") {
      rounds += 1;
      expect(current.questions.length).toBeLessThanOrEqual(5);
      allQuestionIds.push(...current.questions.map((question: { questionId: string }) => question.questionId));
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${state.sessionId}/rounds`,
        headers: contractHeaders,
        payload: {
          answers: current.questions.map((question: { questionId: string }) => ({
            questionId: question.questionId,
            kind: "unknown",
            text: null,
          })),
        },
      });
      expect(response.statusCode).toBe(200);
      current = response.json();
    }

    expect(rounds).toBeLessThanOrEqual(3);
    expect(allQuestionIds.length).toBeLessThanOrEqual(ANALYSIS_TOTAL_QUESTION_LIMIT);
    expect(new Set(allQuestionIds).size).toBe(allQuestionIds.length);
    expect(current.stage).toBe("ready_to_analyze");
    expect(current.followUpEnded).toBe(true);
    expect(current.endReason).toBe("limits_reached");
    expect(current.gaps.length).toBeGreaterThan(0);
    expect(current.expectedStatusNote).toContain("条件不足");
    await app.close();
  });

  it("没有剩余缺口时正常结束追问", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);
    let current = await startQuestions(app, state.sessionId);

    let guard = 0;
    while (current.stage === "collecting_answers" && guard < 5) {
      guard += 1;
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${state.sessionId}/rounds`,
        headers: contractHeaders,
        payload: {
          answers: current.questions.map((question: { questionId: string }) => ({
            questionId: question.questionId,
            kind: "value",
            text: "回答内容说明。",
          })),
        },
      });
      current = response.json();
    }

    expect(current.stage).toBe("ready_to_analyze");
    expect(current.endReason).toBe("no_gaps");
    expect(current.gaps).toHaveLength(0);
    await app.close();
  });

  it("文本回答形成来源轮次的已确认补充事实", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, SAMPLE_TEXT);
    const round1 = await startQuestions(app, state.sessionId);

    const timeQuestion = round1.questions.find((question: { questionId: string }) => question.questionId === "q-time");
    if (timeQuestion === undefined) return;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/rounds`,
      headers: contractHeaders,
      payload: {
        answers: round1.questions.map((question: { questionId: string }) => ({
          questionId: question.questionId,
          kind: question.questionId === "q-time" ? "value" : "unknown",
          text: question.questionId === "q-time" ? "3月1日晚上八点左右" : null,
        })),
      },
    });
    const body = response.json();
    const answeredFact = body.facts.find(
      (fact: CandidateFact) => fact.sourceRound === 1 && fact.category === "time",
    );
    expect(answeredFact).toBeDefined();
    expect(answeredFact.status).toBe("confirmed");
    expect(answeredFact.originalWording).toBe("3月1日晚上八点左右");
    await app.close();
  });
});

describe("分析前确认与事实快照", () => {
  async function runToReady(app: Awaited<ReturnType<typeof buildApp>>, caseText: string) {
    const state = await createSession(app, caseText);
    let current = state;
    if (current.stage === "confirming_facts") {
      const started = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${current.sessionId}/rounds`,
        headers: contractHeaders,
        payload: { answers: [] },
      });
      current = started.json();
    }
    let guard = 0;
    while (current.stage === "collecting_answers" && guard < 5) {
      guard += 1;
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/analysis/sessions/${current.sessionId}/rounds`,
        headers: contractHeaders,
        payload: {
          answers: current.questions.map((question: { questionId: string }) => ({
            questionId: question.questionId,
            kind: "value",
            text: "已核实的情况说明。",
          })),
        },
      });
      current = response.json();
    }
    expect(current.stage).toBe("ready_to_analyze");
    return current;
  }

  it("用户主动确认后形成不可变事实快照", async () => {
    const { app } = await makeApp();
    const ready = await runToReady(app, SAMPLE_TEXT);

    const confirm = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${ready.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);
    const body = confirm.json();
    expect(body.stage).toBe("snapshot_confirmed");
    expect(body.snapshot.snapshotVersion).toBe(1);
    expect(body.snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.snapshot.confirmedAt).not.toBeNull();
    await app.close();
  });

  it("快照确认后所有修改都被拒绝", async () => {
    const { app } = await makeApp();
    const ready = await runToReady(app, SAMPLE_TEXT);
    const confirm = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${ready.sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    const sessionId = confirm.json().sessionId;

    const statusChange = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/facts/${ready.facts[0].factId}/status`,
      headers: contractHeaders,
      payload: { status: "confirmed" },
    });
    expect(statusChange.statusCode).toBe(409);

    const addFact = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/facts`,
      headers: contractHeaders,
      payload: { statement: "补充事实" },
    });
    expect(addFact.statusCode).toBe(409);

    const newRound = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/rounds`,
      headers: contractHeaders,
      payload: { answers: [] },
    });
    expect(newRound.statusCode).toBe(409);

    const secondSnapshot = await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${sessionId}/snapshot`,
      headers: contractHeaders,
      payload: {},
    });
    expect(secondSnapshot.statusCode).toBe(409);
    await app.close();
  });

  it("清除本次分析后服务端会话被删除", async () => {
    const { app } = await makeApp();
    const ready = await runToReady(app, SAMPLE_TEXT);
    const cleared = await app.inject({
      method: "DELETE",
      url: `/api/v1/analysis/sessions/${ready.sessionId}`,
      headers: contractHeaders,
    });
    expect(cleared.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${ready.sessionId}`,
      headers: contractHeaders,
    });
    expect(after.statusCode).toBe(404);
    await app.close();
  });
});

describe("报告前紧急核验提示", () => {
  it("只由已确认的紧急风险事实触发", async () => {
    const { app } = await makeApp();
    const state = await createSession(app, "今天凌晨，刘某持刀闯入前女友家中扬言伤人。");
    const knifeFact = state.facts.find((fact: CandidateFact) => fact.riskCategory === "personal_safety");
    expect(knifeFact).toBeDefined();

    // 未确认：没有任何紧急提示。
    const before = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    expect(before.json().urgentPrompts).toHaveLength(0);

    await app.inject({
      method: "POST",
      url: `/api/v1/analysis/sessions/${state.sessionId}/facts/${knifeFact.factId}/status`,
      headers: contractHeaders,
      payload: { status: "confirmed" },
    });

    const after = await app.inject({
      method: "GET",
      url: `/api/v1/analysis/sessions/${state.sessionId}`,
      headers: contractHeaders,
    });
    const prompts = after.json().urgentPrompts;
    expect(prompts).toHaveLength(1);
    expect(prompts[0].categoryLabel).toBe("人身安全");
    expect(prompts[0].triggeringFactIds).toContain(knifeFact.factId);
    expect(prompts[0].triggeringStatements.length).toBeGreaterThan(0);
    expect(prompts[0].humanChecks.length).toBeGreaterThan(0);
    expect(prompts[0].boundaryStatement).toContain("不构成自动处置");
    await app.close();
  });

  it("未知会话返回 404 且不泄露内容", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/analysis/sessions/does-not-exist",
      headers: contractHeaders,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).not.toContain("案情");
    await app.close();
  });
});

describe("契约校验失败关闭", () => {
  it("提取结果不符合结构契约时拒绝创建会话", async () => {
    const fixtures = createFixtureControls();
    const brokenAnalysis = {
      async extractCaseFacts() {
        return {
          facts: [{ factId: "" } as unknown as CandidateFact],
          independentMatters: { detected: false, note: null },
        };
      },
      async proposeDecisiveQuestions() {
        return { questions: [] };
      },
    };
    const app = await buildApp({
      config: testConfig(),
      fixtures,
      analysisEngine: new AnalysisEngine(brokenAnalysis),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/analysis/sessions",
      headers: contractHeaders,
      payload: { caseText: SAMPLE_TEXT },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });
});
