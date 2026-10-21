import { describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, type AccidentLiabilitySessionState } from "@policymate/contracts";
import { buildApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import { createFixtureControls } from "../src/providers/fixture";
import { createLlmProvider } from "../src/providers/llm";
import { anonymousTokens } from "../src/security";
import type { AccidentLiabilityConsultRequest, Providers } from "../src/providers/types";

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

/** 收集事故入口实际交给边界的适用法源集。 */
async function capturedSources(ov: Partial<AppConfig> = {}) {
  const seen: AccidentLiabilityConsultRequest[] = [];
  const fixtures = createFixtureControls();
  const providers: Providers = {
    ...fixtures,
    accidentLiability: {
      async consultAccidentLiability(request) {
        seen.push(request);
        return { kind: "question", text: "请说明路口信号灯状态。" };
      },
    },
  };
  const app = await buildApp({ config: config(ov), providers });
  await app.inject({ method: "POST", url: BASE, headers: headers(), payload: { caseText } });
  return seen[0].legalSources;
}

describe("事故责任的适用法源集（ADR-0019）", () => {
  it("只把交通领域且现行有效的法源交给模型，不再塞整批 17 部无关法源", async () => {
    const sources = await capturedSources();
    const titles = sources.map((source) => source.title);
    expect(titles).toContain("中华人民共和国道路交通安全法");
    expect(titles).toContain("中华人民共和国道路交通安全法实施条例");
    expect(titles).toContain("中华人民共和国民法典");
    expect(titles).not.toContain("中华人民共和国刑法");
    expect(titles).not.toContain("中华人民共和国治安管理处罚法（2025年修订）");
    // 交通两部只做范围登记，尚未录入核验过的条款原文。
    expect(sources.find((s) => s.title === "中华人民共和国道路交通安全法")?.articles).toEqual([]);
    // 载荷量级：整批约 20,800 字符，适用法源集应小一个量级。
    expect(JSON.stringify(sources).length).toBeLessThan(12_000);
  });

  it("法源到期后不再进入适用法源集（失败关闭，而不是继续引用过期法源）", async () => {
    const seen: string[][] = [];
    const fixtures = createFixtureControls();
    fixtures.updateState({ legalSourcesExpired: true });
    const providers: Providers = {
      ...fixtures,
      accidentLiability: {
        async consultAccidentLiability(request) {
          seen.push(request.legalSources.map((source) => source.title));
          return { kind: "report", text: "【责任认定】\n待核实。" };
        },
      },
    };
    const app = await buildApp({ config: config(), providers });
    await app.inject({ method: "POST", url: BASE, headers: headers(), payload: { caseText } });
    expect(seen[0]).toEqual([]);
  });

  it("模型写出的条号先核对再用：命中附原文，未命中就地降级标注", async () => {
    const fixtures = createFixtureControls();
    const providers: Providers = {
      ...fixtures,
      accidentLiability: {
        async consultAccidentLiability() {
          return {
            kind: "report",
            text: [
              "【责任认定】",
              "甲负全部责任。",
              "法律依据",
              "《中华人民共和国民法典》第一千一百六十五条：过错责任。",
              "《中华人民共和国民法典》第九千九百九十九条：不存在的条号。",
              "〔待核对〕《中华人民共和国道路交通安全法》关于机动车与非机动车过错责任的规定。",
            ].join("\n"),
          };
        },
      },
    };
    const app = await buildApp({ config: config(), providers });
    const created = (await app.inject({ method: "POST", url: BASE, headers: headers(), payload: { caseText } })).json<AccidentLiabilitySessionState>();
    const report = created.report ?? "";
    expect(report).toContain("第一千一百六十五条");
    expect(report).toContain("依据核对（系统比对本次受治理法源，非模型输出）");
    expect(report).toContain("行为人因过错侵害他人民事权益造成损害的");
    expect(report).toContain("第九千九百九十九条〔条号未经核对〕");
    expect(report).toContain("未在本次受治理法源中找到");
    // 方向提示原样保留，不因核对被改写。
    expect(report).toContain("〔待核对〕《中华人民共和国道路交通安全法》");
  });
});

describe("事故边界收到的提示词载荷（ADR-0019 两档引用）", () => {
  it("把法源拆成 sourceScope 与 citableArticles，只发节选而不是全文", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "report", text: "【责任认定】\n待核实。" }) } }],
      }),
    );
    const provider = createLlmProvider(
      {
        ...config(),
        providerMode: "llm",
        llmBaseUrl: "https://llm.test/v1",
        llmApiKey: "private-llm-key",
        llmModel: "test-model",
      },
      { fetchImpl: transport },
    );
    const sources = await capturedSources();
    await provider.consultAccidentLiability!({ turns: [{ turnId: "t1", speaker: "officer", text: caseText, createdAt: new Date().toISOString() }], forceReport: false, legalSources: sources, requestId: "r1" });

    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body.max_tokens).toBeGreaterThan(0);
    const payload = JSON.parse(body.messages[1].content);
    expect(payload.sourceScope.map((item: { title: string }) => item.title)).toContain("中华人民共和国道路交通安全法");
    expect(payload.sourceScope.every((item: { note: string }) => item.note.includes("不得写出条号"))).toBe(true);
    expect(payload.citableArticles.map((item: { title: string }) => item.title)).toContain("中华人民共和国民法典");
    const article = payload.citableArticles[0].articles[0];
    expect(Object.keys(article).sort()).toEqual(["excerpt", "location"]);
    expect(article.excerpt.length).toBeLessThanOrEqual(80 + "…〔节选〕".length);
    // 提示词本身就说清两档规则。
    expect(String(body.messages[0].content)).toContain("citableArticles");
    expect(String(body.messages[0].content)).toContain("〔待核对〕");
  });
});

describe("事故提示词的首轮追问要求（ADR-0019）", () => {
  it("提示词要求首轮必须先追问，避免一次调用直接写出 40 秒的完整报告", async () => {
    const { PROMPT_FOR_TEST } = await import("../src/providers/llm");
    expect(PROMPT_FOR_TEST.accident).toContain("首轮强制追问");
    expect(PROMPT_FOR_TEST.accident).toContain("必须**返回 question");
  });
});
