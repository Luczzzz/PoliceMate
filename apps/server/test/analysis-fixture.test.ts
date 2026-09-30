import { describe, expect, it } from "vitest";
import type { CandidateFact } from "@policymate/contracts";
import { extractCaseFactsFixture } from "../src/analysis/fixture-extract";

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

  it("互不相关的事项被确定性拆分：不同人员、地点、时间拆成两份", () => {
    const result = extractCaseFactsFixture(
      "3月2日，张某在城南市场殴打李某。另外，3月8日王某报案称电动车在火车站门口被盗。",
    );
    expect(result.independentMatters.detected).toBe(true);
    expect(result.independentMatters.note).toContain("拆分");
    expect(result.matters).toHaveLength(2);
    expect(result.matters[0].label).toBe("事项一");
    expect(result.matters[1].label).toBe("事项二");
    // 事项一只包含殴打相关事实，事项二只包含电动车被盗相关事实。
    expect(
      result.matters[0].facts.some((fact) => fact.category === "behavior" && fact.value?.raw === "殴打推搡"),
    ).toBe(true);
    expect(
      result.matters[1].facts.some((fact) => fact.category === "behavior" && fact.value?.raw === "盗窃"),
    ).toBe(true);
    // 人物别名按各事项独立编号，不跨事项串联。
    expect(
      result.matters[0].facts
        .filter((fact) => fact.category === "participant")
        .map((fact) => fact.originalWording),
    ).toEqual(["张某", "李某"]);
    expect(
      result.matters[1].facts
        .filter((fact) => fact.category === "participant")
        .map((fact) => fact.originalWording),
    ).toEqual(["王某"]);
  });

  it("连续案情不被误拆：共享人员的事件保留在同一事项", () => {
    const result = extractCaseFactsFixture("3月2日，张某在城南市场殴打李某。当天张某又辱骂李某。");
    expect(result.independentMatters.detected).toBe(false);
    expect(result.matters).toHaveLength(1);
    expect(result.matters[0].facts.filter((fact) => fact.category === "behavior").length).toBe(2);
  });

  it("共享地点的两起事件保留在同一事项", () => {
    const result = extractCaseFactsFixture(
      "3月2日，张某在城南市场门口殴打李某。当天王某在城南市场门口盗窃他人手机。",
    );
    expect(result.independentMatters.detected).toBe(false);
    expect(result.matters).toHaveLength(1);
  });

  it("开场背景句不锚定新事项，不产生误拆", () => {
    const result = extractCaseFactsFixture("今天天气不错。张某殴打李某。");
    expect(result.matters).toHaveLength(1);
    expect(result.independentMatters.detected).toBe(false);
  });

  it("出现“另外”等表述时即使共享人员也按独立事项拆分", () => {
    const result = extractCaseFactsFixture("3月2日，张某殴打李某。另外，3月8日张某又盗窃王某手机。");
    expect(result.matters).toHaveLength(2);
    expect(result.independentMatters.detected).toBe(true);
  });
});

describe("fixture 提取：争议事实分组", () => {
  it("同一事实的不同说法共享争议分组，全部保留且不静默选定", () => {
    const result = extractCaseFactsFixture(
      "3月2日晚上，张某在城南市场门口殴打李某。李某称自己被打成轻伤，张某称李某只是轻微伤，双方说法不一。",
    );
    expect(result.matters).toHaveLength(1);
    const results = result.facts.filter((fact) => fact.category === "result");
    expect(results.map((fact) => fact.value?.raw)).toEqual(["轻伤", "轻微伤"]);
    for (const fact of results) {
      expect(fact.status).toBe("disputed");
      expect(fact.statusLabel).toBe("存在争议");
      expect(fact.disputeGroupId).not.toBeNull();
    }
    expect(new Set(results.map((fact) => fact.disputeGroupId)).size).toBe(1);
  });

  it("单一说法不标记为争议", () => {
    const result = extractCaseFactsFixture("3月2日晚上，张某殴打李某。李某手部擦伤。");
    for (const fact of result.facts) {
      expect(fact.status).toBe("candidate");
      expect(fact.disputeGroupId).toBeNull();
    }
  });

  it("同类别不同取值的说法被标记为争议（金额）", () => {
    const result = extractCaseFactsFixture("3月2日，李某称电动车价值5000元。王某称只值2000元。");
    const amounts = result.facts.filter((fact) => fact.category === "amount");
    expect(amounts.map((fact) => fact.value?.raw)).toEqual(["5000元", "2000元"]);
    for (const fact of amounts) {
      expect(fact.status).toBe("disputed");
      expect(fact.disputeGroupId).not.toBeNull();
    }
    expect(new Set(amounts.map((fact) => fact.disputeGroupId)).size).toBe(1);
  });

  it("同类别但分属不同事件的取值不标记为争议", () => {
    const result = extractCaseFactsFixture("3月2日，张某盗窃现金3000元。当天张某又诈骗5000元。");
    const amounts = result.facts.filter((fact) => fact.category === "amount");
    expect(amounts.length).toBe(2);
    for (const fact of amounts) {
      expect(fact.status).toBe("candidate");
      expect(fact.disputeGroupId).toBeNull();
    }
  });
});

