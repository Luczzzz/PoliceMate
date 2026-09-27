import type {
  CandidateFact,
  FactCategory,
  QuestionTopic,
} from "@policymate/contracts";
import type {
  AnsweredQuestionSummary,
  ProposedQuestion,
  QuestionPoolRequest,
  QuestionPoolResult,
} from "../providers/types";

/**
 * 决定性追问选题的确定性替身（Dify 边界）。
 *
 * 后端传入完整结构化状态（事实 + 已回答摘要 + 已问问题），替身从缺口模板
 * 中选出候选问题；后端负责按优先级与体验上限截断。真实接入时由 Dify
 * 工作流返回同构结构。
 */

interface QuestionTemplate {
  questionId: string;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topic: QuestionTopic;
  text: string;
  whyItMatters: string;
  kind: "standard" | "neutral_safety";
  answerCategory: FactCategory;
  applies: (context: TemplateContext) => boolean;
  relatedFactIds: (context: TemplateContext) => string[];
}

interface TemplateContext {
  facts: CandidateFact[];
  behaviorLabels: string[];
  hasBehavior: (pattern: RegExp) => boolean;
  hasConfirmedCategory: (category: string) => boolean;
  riskUnconfirmedFactIds: string[];
}

const VIOLENCE = /殴打|推搡|威胁|恐吓|伤害|持械|非法侵入|辱骂/;
const PROPERTY = /盗窃|抢劫|抢夺|诈骗|侵占|损毁/;

const TEMPLATES: QuestionTemplate[] = [
  {
    questionId: "q-neutral-safety",
    priority: 1,
    topic: "urgent_safety",
    kind: "neutral_safety",
    answerCategory: "other",
    text: "现场或相关人员目前是否仍有紧急危险？是否有人需要立即救助或保护？",
    whyItMatters:
      "案情中出现了尚未确认的危险表述。在事实得到确认之前，只能先核实实际安全情况，不能据此认定存在紧急状态。",
    applies: (context) => context.riskUnconfirmedFactIds.length > 0,
    relatedFactIds: (context) => context.riskUnconfirmedFactIds,
  },
  {
    questionId: "q-injury-grade",
    priority: 2,
    topic: "path_split",
    kind: "standard",
    answerCategory: "result",
    text: "受伤人员是否已经过伤情检查或鉴定？结果属于轻微伤、轻伤还是重伤？",
    whyItMatters: "伤情程度直接影响治安案件与刑事案件的分流，也会改变证据固定的优先顺序。",
    applies: (context) => context.hasBehavior(VIOLENCE) && !context.hasConfirmedCategory("result"),
    relatedFactIds: (context) =>
      context.facts.filter((fact) => fact.category === "result" || fact.category === "behavior").map((fact) => fact.factId),
  },
  {
    questionId: "q-amount-value",
    priority: 3,
    topic: "core_classification",
    kind: "standard",
    answerCategory: "amount",
    text: "涉案财物或损失的实际价值是否明确？大致范围是多少？",
    whyItMatters: "财物价值与损失数额会影响案件定性（治安违法或刑事犯罪）和受立案条件。",
    applies: (context) => context.hasBehavior(PROPERTY) && !context.hasConfirmedCategory("amount"),
    relatedFactIds: (context) =>
      context.facts.filter((fact) => fact.category === "amount" || fact.category === "object").map((fact) => fact.factId),
  },
  {
    questionId: "q-behavior-course",
    priority: 3,
    topic: "core_classification",
    kind: "standard",
    answerCategory: "other",
    text: "行为的具体经过是否清楚（谁先动手、如何开始、如何结束）？",
    whyItMatters: "经过顺序影响对行为性质、主动与被动的判断，可能改变核心定性方向。",
    applies: (context) =>
      context.hasBehavior(/殴打|盗窃|抢劫|损毁|威胁|非法侵入/) && !context.hasConfirmedCategory("other"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "behavior").map((fact) => fact.factId),
  },
  {
    questionId: "q-time",
    priority: 4,
    topic: "filing_conditions",
    kind: "standard",
    answerCategory: "time",
    text: "事件发生的大致时间是什么时候？（如某月某日、上午或晚上）",
    whyItMatters: "时间影响是否仍在处理时限内，也决定监控等证据是否可能留存。",
    applies: (context) => !context.hasConfirmedCategory("time"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "time").map((fact) => fact.factId),
  },
  {
    questionId: "q-place",
    priority: 4,
    topic: "filing_conditions",
    kind: "standard",
    answerCategory: "place",
    text: "事件发生的具体位置大致在哪里？",
    whyItMatters: "位置影响管辖归属，也决定能否调取现场监控。",
    applies: (context) => !context.hasConfirmedCategory("place"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "place").map((fact) => fact.factId),
  },
  {
    questionId: "q-other-persons",
    priority: 4,
    topic: "filing_conditions",
    kind: "standard",
    answerCategory: "participant",
    text: "除已提到的人员外，是否还有其他在场或知情人员？",
    whyItMatters: "其他在场人员可能是关键证人，影响询问与取证安排。",
    applies: (context) => !context.hasConfirmedCategory("participant"),
    relatedFactIds: (context) =>
      context.facts.filter((fact) => fact.category === "participant").map((fact) => fact.factId),
  },
  {
    questionId: "q-evidence-sources",
    priority: 5,
    topic: "evidence_preservation",
    kind: "standard",
    answerCategory: "background",
    text: "现场是否有监控录像、目击证人或实物证据？分别在哪里？",
    whyItMatters: "这些证据可能随时间灭失，需要尽快确认并固定。",
    applies: (context) => !context.hasConfirmedCategory("background"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "behavior").map((fact) => fact.factId),
  },
  {
    questionId: "q-relationship",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "relationship",
    text: "涉事人员之间是什么关系（如相识、同事、亲属或陌生人）？",
    whyItMatters: "人员关系影响对行为动机和纠纷性质的判断。",
    applies: (context) => !context.hasConfirmedCategory("relationship"),
    relatedFactIds: (context) =>
      context.facts.filter((fact) => fact.category === "participant").map((fact) => fact.factId),
  },
  {
    questionId: "q-negotiation",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "background",
    text: "事发前双方是否发生过纠纷或协商？经过如何？",
    whyItMatters: "事先经过可能与民事纠纷、治安案件或刑事案件的区分有关。",
    applies: (context) => context.hasBehavior(VIOLENCE) && !context.hasConfirmedCategory("background"),
    relatedFactIds: () => [],
  },
  {
    questionId: "q-restitution",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "amount",
    text: "涉案财物或损失目前是否已被追回、返还或赔偿？",
    whyItMatters: "退赔情况会影响处理方式与结果评估。",
    applies: (context) => context.hasBehavior(PROPERTY),
    relatedFactIds: (context) =>
      context.facts.filter((fact) => fact.category === "amount" || fact.category === "object").map((fact) => fact.factId),
  },
  {
    questionId: "q-whereabouts",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "other",
    text: "行为人目前是否在现场、已被控制或已离开？",
    whyItMatters: "影响是否需要立即处置以及后续传唤安排。",
    applies: (context) => !context.hasConfirmedCategory("other"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "behavior").map((fact) => fact.factId),
  },
  {
    questionId: "q-intoxication",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "other",
    text: "行为人当时是否处于醉酒或其他异常状态？",
    whyItMatters: "责任能力状态可能与后续处理和记录方式有关。",
    applies: (context) => context.hasBehavior(VIOLENCE) && !context.hasConfirmedCategory("other"),
    relatedFactIds: () => [],
  },
  {
    questionId: "q-injury-treatment",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "result",
    text: "受伤人员是否已经就医？医疗记录是否保存？",
    whyItMatters: "医疗记录是伤情认定的重要依据，也可能随时间难以取得。",
    applies: (context) => context.hasBehavior(VIOLENCE) && !context.hasConfirmedCategory("result"),
    relatedFactIds: (context) => context.facts.filter((fact) => fact.category === "result").map((fact) => fact.factId),
  },
  {
    questionId: "q-report-time",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "time",
    text: "案件是何时报案的？报案时说明了哪些情况？",
    whyItMatters: "接报时间与初始陈述影响受案登记和时限判断。",
    applies: (context) => !context.hasConfirmedCategory("time"),
    relatedFactIds: () => [],
  },
  {
    questionId: "q-prior-disputes",
    priority: 6,
    topic: "detail",
    kind: "standard",
    answerCategory: "background",
    text: "当事人之前是否有类似纠纷或报警记录？",
    whyItMatters: "既往情况可能影响风险评估和处理方式。",
    applies: (context) => !context.hasConfirmedCategory("background"),
    relatedFactIds: () => [],
  },
];

function buildContext(request: QuestionPoolRequest): TemplateContext {
  const facts = request.facts.filter((fact) => !fact.excluded);
  const behaviorLabels = facts
    .filter((fact) => fact.category === "behavior" && fact.value !== null)
    .map((fact) => fact.value?.raw ?? "");
  return {
    facts,
    behaviorLabels,
    hasBehavior: (pattern) => behaviorLabels.some((label) => pattern.test(label)),
    hasConfirmedCategory: (category) =>
      facts.some((fact) => fact.category === category && fact.status === "confirmed"),
    riskUnconfirmedFactIds: facts
      .filter((fact) => fact.riskCategory !== null && fact.status !== "confirmed")
      .map((fact) => fact.factId),
  };
}

/** 确定性选题：从未回答的缺口模板中按优先级返回候选问题。 */
export function proposeDecisiveQuestionsFixture(request: QuestionPoolRequest): QuestionPoolResult {
  const context = buildContext(request);
  const asked = new Set(request.askedQuestionIds);

  const candidates: ProposedQuestion[] = [];
  for (const template of TEMPLATES) {
    if (asked.has(template.questionId)) continue;
    if (!template.applies(context)) continue;
    candidates.push({
      questionId: template.questionId,
      priority: template.priority,
      topic: template.topic,
      text: template.text,
      whyItMatters: template.whyItMatters,
      kind: template.kind,
      relatedFactIds: template.relatedFactIds(context),
      answerCategory: template.answerCategory,
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);

  const remainingBudget = Math.max(0, Math.min(request.maxQuestions, candidates.length));
  return { questions: candidates.slice(0, remainingBudget) };
}

export type { AnsweredQuestionSummary };
