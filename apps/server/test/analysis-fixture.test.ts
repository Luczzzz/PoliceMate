import { describe, expect, it } from "vitest";
import type { CandidateFact } from "@policymate/contracts";
import { extractCaseFactsFixture } from "../src/analysis/fixture-extract";
import { proposeDecisiveQuestionsFixture } from "../src/analysis/fixture-questions";

function factsOf(text: string): CandidateFact[] {
  return extractCaseFactsFixture(text).facts;
}

describe("fixture 提取：人物中性代号", () => {
  it("为原文人物分配中性代号，并保留原始表述", () => {
    const facts = factsOf("3月2日，张某殴打李某。");
    const participants = facts.filter((fact) => fact.category === "participant");
    expect(participants.map((fact) => fact.statement)).toEqual([
      "人员甲（原文表述：张某）",
      "人员乙（原文表述：李某）",
    ]);
    const behavior = facts.find((fact) => fact.category === "behavior");
    expect(behavior?.participantRefs).toEqual(["人员甲", "人员乙"]);
    expect(behavior?.statement).toContain("人员甲");
    expect(behavior?.originalWording).toBe("3月2日，张某殴打李某");
  });

  it("报案人使用固定角色代号", () => {
    const facts = factsOf("报案人称电动车被盗。");
    const participants = facts.filter((fact) => fact.category === "participant");
    expect(participants[0]?.statement).toContain("报案人");
  });
});

describe("fixture 提取：模糊值保留原始表述、规范化范围与精确程度", () => {
  it("年初 → 范围值", () => {
    const facts = factsOf("年初，张某盗窃他人财物。");
    const time = facts.find((fact) => fact.category === "time");
    expect(time?.value?.raw).toBe("年初");
    expect(time?.value?.normalizedMin).toBe("1月1日");
    expect(time?.value?.normalizedMax).toBe("2月末");
    expect(time?.value?.precisionLabel).toBe("范围值");
  });

  it("一千多元 → 不完整范围（下限明确）", () => {
    const facts = factsOf("张某偷走现金一千多元。");
    const amount = facts.find((fact) => fact.category === "amount");
    expect(amount?.value?.raw).toBe("一千多元");
    expect(amount?.value?.normalizedMin).toBe("1000");
    expect(amount?.value?.normalizedMax).toBeNull();
    expect(amount?.value?.unit).toBe("元");
    expect(amount?.value?.precisionLabel).toBe("不完整范围");
  });

  it("三十多岁 → 年龄范围", () => {
    const facts = factsOf("张某三十多岁，多次实施盗窃。");
    const age = facts.find((fact) => fact.category === "age");
    expect(age?.value?.normalizedMin).toBe("30");
    expect(age?.value?.normalizedMax).toBe("39");
    const count = facts.find((fact) => fact.category === "count");
    expect(count?.value?.raw).toBe("多次");
    expect(count?.value?.precisionLabel).toBe("无法规范化");
  });

  it("精确日期与金额", () => {
    const facts = factsOf("2026年3月2日，张某盗窃现金3000元。");
    const time = facts.find((fact) => fact.category === "time");
    expect(time?.value?.precisionLabel).toBe("精确值");
    expect(time?.value?.normalizedMin).toBe("2026年3月2日");
    const amount = facts.find((fact) => fact.category === "amount");
    expect(amount?.value?.normalizedMin).toBe("3000");
    expect(amount?.value?.normalizedMax).toBe("3000");
  });
});

describe("fixture 提取：关系与结构", () => {
  it("行为句形成事件与行为，并携带行为 ID", () => {
    const facts = factsOf("3月2日晚上，张某在城南市场门口殴打李某。");
    const behavior = facts.find((fact) => fact.category === "behavior");
    expect(behavior?.eventRefs).toEqual(["事件一"]);
    expect(behavior?.behaviorRefs).toEqual(["行为一"]);
    const time = facts.find((fact) => fact.category === "time");
    expect(time?.eventRefs).toEqual(["事件一"]);
  });

  it("地点被识别为地点事实", () => {
    const facts = factsOf("张某在城南市场门口殴打李某。");
    const place = facts.find((fact) => fact.category === "place");
    expect(place?.value?.raw).toBe("城南市场门口");
  });

  it("所有候选事实初始为候选状态，不默认确认", () => {
    const facts = factsOf("张某殴打李某，李某受伤。");
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.status).toBe("candidate");
      expect(fact.sourceRound).toBe(0);
    }
  });

  it("提取结果是确定性的：同输入同输出", () => {
    const text = "3月2日，张某盗窃李某电动车。";
    expect(extractCaseFactsFixture(text)).toEqual(extractCaseFactsFixture(text));
  });
});

describe("fixture 提取：紧急风险标记与独立事项", () => {
  it("持刀表述给行为事实打人身安全标记", () => {
    const facts = factsOf("今天凌晨，刘某持刀威胁王某。");
    const behavior = facts.find((fact) => fact.category === "behavior");
    expect(behavior?.riskCategory).toBe("personal_safety");
  });

  it("另外连接的两起独立事件触发拆分提示", () => {
    const result = extractCaseFactsFixture(
      "3月2日，张某在城南市场殴打李某。另外，3月8日王某报案称电动车在火车站门口被盗。",
    );
    expect(result.independentMatters.detected).toBe(true);
    expect(result.independentMatters.note).toContain("拆分");
  });

  it("连续案情不触发拆分提示", () => {
    const result = extractCaseFactsFixture("3月2日，张某在城南市场殴打李某。当天张某又辱骂李某。");
    expect(result.independentMatters.detected).toBe(false);
  });
});

describe("fixture 追问选题", () => {
  const extraction = extractCaseFactsFixture(
    "3月2日晚上，张某在城南市场门口殴打李某。李某手部擦伤。",
  );

  it("每题带确认理由，按优先级排序并截断到上限", () => {
    const result = proposeDecisiveQuestionsFixture({
      facts: extraction.facts,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 5,
    });
    expect(result.questions.length).toBeLessThanOrEqual(5);
    expect(result.questions.length).toBeGreaterThan(0);
    for (const question of result.questions) {
      expect(question.whyItMatters.length).toBeGreaterThan(0);
      expect(question.text.length).toBeGreaterThan(0);
    }
    const priorities = result.questions.map((question) => question.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });

  it("不重复返回已问过的问题", () => {
    const first = proposeDecisiveQuestionsFixture({
      facts: extraction.facts,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 5,
    });
    const second = proposeDecisiveQuestionsFixture({
      facts: extraction.facts,
      answers: first.questions.map((question) => ({ questionId: question.questionId, topic: question.topic, kind: "unknown" as const })),
      askedQuestionIds: first.questions.map((question) => question.questionId),
      maxQuestions: 5,
    });
    const firstIds = new Set(first.questions.map((question) => question.questionId));
    for (const question of second.questions) {
      expect(firstIds.has(question.questionId)).toBe(false);
    }
  });

  it("文本回答形成已确认事实后，对应缺口不再出题", () => {
    const withoutTime = proposeDecisiveQuestionsFixture({
      facts: extraction.facts.filter((fact) => fact.category !== "time"),
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 12,
    });
    expect(withoutTime.questions.some((question) => question.questionId === "q-time")).toBe(true);

    const withConfirmedTime: CandidateFact[] = [
      ...extraction.facts.filter((fact) => fact.category !== "time"),
      {
        ...extraction.facts[0],
        factId: "fact-answer-time",
        category: "time",
        status: "confirmed",
      },
    ];
    const afterAnswer = proposeDecisiveQuestionsFixture({
      facts: withConfirmedTime,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 12,
    });
    expect(afterAnswer.questions.some((question) => question.questionId === "q-time")).toBe(false);
  });

  it("未经确认的风险事实触发中性安全问题；确认后不再触发", () => {
    const risky = extractCaseFactsFixture("今天凌晨，刘某持刀威胁王某。");
    const unconfirmed = proposeDecisiveQuestionsFixture({
      facts: risky.facts,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 12,
    });
    const safety = unconfirmed.questions.find((question) => question.kind === "neutral_safety");
    expect(safety).toBeDefined();
    expect(safety?.priority).toBe(1);

    const confirmedFacts = risky.facts.map((fact) =>
      fact.riskCategory === null ? fact : { ...fact, status: "confirmed" as const },
    );
    const afterConfirm = proposeDecisiveQuestionsFixture({
      facts: confirmedFacts,
      answers: [],
      askedQuestionIds: [],
      maxQuestions: 12,
    });
    expect(afterConfirm.questions.some((question) => question.kind === "neutral_safety")).toBe(false);
  });
});
