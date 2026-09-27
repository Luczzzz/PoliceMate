import { createHash, randomUUID } from "node:crypto";
import type {
  AddFactRequest,
  AdvanceRoundRequest,
  AnalysisGap,
  AnalysisSessionState,
  AnalysisStage,
  AnswerRecord,
  CandidateFact,
  CreateAnalysisRequest,
  DecisiveAnswer,
  DecisiveQuestion,
  FactStatus,
  UrgentRiskCategory,
  UrgentRiskPrompt,
} from "@policymate/contracts";import {
  ANALYSIS_PER_ROUND_LIMIT,
  ANALYSIS_ROUND_LIMIT,
  ANALYSIS_STAGE_LABELS,
  ANALYSIS_TOTAL_QUESTION_LIMIT,
  ANSWER_MAX_CHARACTERS,
  CASE_TEXT_MAX_CHARACTERS,
  DECISIVE_ANSWER_KIND_LABELS,
  FACT_CATEGORY_LABELS,
  FACT_STATUS_LABELS,
  QUESTION_TOPIC_LABELS,
  URGENT_RISK_LABELS,
} from "@policymate/contracts";
import type {
  CaseExtractionResult,
  CaseAnalysisProvider,
  QuestionPoolResult,
} from "../providers/types";

/**
 * 案情分析状态机。
 *
 * - 会话只存在于短暂运行内存（30 分钟空闲后失效），不写入数据库或日志；
 * - 阶段推进只依据显式状态与允许的动作；
 * - 事实是会话内的工作集合；快照确认后形成不可变集合，任何修改都被拒绝；
 * - 紧急风险提示只由“已确认”的紧急风险事实触发；未经确认的关键词只产生
 *   中性安全问题（由追问边界提供）。
 */

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

export type EngineDeps = Pick<CaseAnalysisProvider, "extractCaseFacts" | "proposeDecisiveQuestions">;

interface AnalysisSession {
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
  stage: AnalysisStage;
  caseCharacterCount: number;
  facts: CandidateFact[];
  questions: DecisiveQuestion[];
  answers: AnswerRecord[];
  roundsCompleted: number;
  questionsAskedTotal: number;
  followUpEnded: boolean;
  endReason: "limits_reached" | "no_gaps" | null;
  independentMatters: AnalysisSessionState["independentMatters"];
  snapshot: AnalysisSessionState["snapshot"];
}

/** 输入校验失败；message 为面向民警的说明。 */
export class AnalysisInputError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AnalysisInputError";
    this.statusCode = statusCode;
  }
}

/** 边界返回结果不符合结构契约；必须整体失败关闭。 */
export class AnalysisContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisContractError";
  }
}

const FACT_STATUSES: ReadonlySet<FactStatus> = new Set([
  "candidate",
  "confirmed",
  "denied",
  "unknown",
  "disputed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 只接受纯文本：拒绝控制字符（换行、回车、制表除外）。 */
export function validateCaseText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AnalysisInputError("案情内容必须以纯文本提交。");
  }
  // 按 Unicode 码点计数，避免把代理对算作两个字符。
  const codePoints = Array.from(raw);
  if (codePoints.length === 0 || raw.trim() === "") {
    throw new AnalysisInputError("请输入案情内容后再提交。");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) {
    throw new AnalysisInputError("案情内容包含不支持的格式或特殊字符，仅接受纯文本。");
  }
  if (codePoints.length > CASE_TEXT_MAX_CHARACTERS) {
    throw new AnalysisInputError(
      `案情内容超过 ${CASE_TEXT_MAX_CHARACTERS.toLocaleString("zh-Hans-CN")} 字符上限，请精简后重新输入；系统不会截断内容。`,
    );
  }
  return raw;
}

export function validateStatementText(raw: unknown, label: string, maxCharacters: number): string {
  if (typeof raw !== "string") {
    throw new AnalysisInputError(`${label}必须以纯文本提交。`);
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new AnalysisInputError(`${label}不能为空。`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    throw new AnalysisInputError(`${label}包含不支持的格式或特殊字符，仅接受纯文本。`);
  }
  if (Array.from(trimmed).length > maxCharacters) {
    throw new AnalysisInputError(`${label}超过 ${maxCharacters.toLocaleString("zh-Hans-CN")} 字符上限；系统不会截断内容。`);
  }
  return trimmed;
}

/** 对外部边界返回的候选事实做结构校验；不符合契约时整体失败关闭。 */
export function validateExtractionResult(result: CaseExtractionResult): void {
  if (!isRecord(result) || !Array.isArray(result.facts)) {
    throw new AnalysisContractError("提取结果缺少事实列表。");
  }
  const seen = new Set<string>();
  for (const fact of result.facts) {
    if (!isRecord(fact)) throw new AnalysisContractError("候选事实格式无效。");
    const factId = fact.factId;
    if (typeof factId !== "string" || factId === "") throw new AnalysisContractError("候选事实缺少稳定 ID。");
    if (seen.has(factId)) throw new AnalysisContractError("候选事实 ID 重复。");
    seen.add(factId);
    if (typeof fact.category !== "string") throw new AnalysisContractError("候选事实缺少类别。");
    if (typeof fact.originalWording !== "string" || fact.originalWording.trim() === "") {
      throw new AnalysisContractError("候选事实缺少原始表述。");
    }
    if (fact.status !== "candidate") {
      throw new AnalysisContractError("提取结果不得预置已确认状态。");
    }
    if (fact.riskCategory !== null && typeof fact.riskCategory !== "string") {
      throw new AnalysisContractError("候选事实紧急风险标记无效。");
    }
  }
  const matters = result.independentMatters;
  if (!isRecord(matters) || typeof matters.detected !== "boolean") {
    throw new AnalysisContractError("独立事项检测结果无效。");
  }
}

export function validateQuestionPoolResult(result: QuestionPoolResult): void {
  if (!isRecord(result) || !Array.isArray(result.questions)) {
    throw new AnalysisContractError("追问选题结果无效。");
  }
  const seen = new Set<string>();
  for (const question of result.questions) {
    if (!isRecord(question)) throw new AnalysisContractError("追问问题格式无效。");
    if (typeof question.questionId !== "string" || question.questionId === "") {
      throw new AnalysisContractError("追问问题缺少稳定 ID。");
    }
    if (seen.has(question.questionId)) throw new AnalysisContractError("追问问题 ID 重复。");
    seen.add(question.questionId);
    if (typeof question.priority !== "number" || question.priority < 1 || question.priority > 6) {
      throw new AnalysisContractError("追问问题优先级无效。");
    }
    if (typeof question.text !== "string" || question.text.trim() === "") {
      throw new AnalysisContractError("追问问题缺少内容。");
    }
    if (typeof question.whyItMatters !== "string" || question.whyItMatters.trim() === "") {
      throw new AnalysisContractError("追问问题缺少确认理由说明。");
    }
  }
}

function toSessionState(session: AnalysisSession, now: Date): AnalysisSessionState {
  return {
    contractVersion: "1.0",
    generatedAt: now.toISOString(),
    sessionId: session.sessionId,
    stage: session.stage,
    stageLabel: ANALYSIS_STAGE_LABELS[session.stage],
    caseCharacterCount: session.caseCharacterCount,
    facts: session.facts.map((fact) => ({ ...fact })),
    questions: session.questions.map((question) => ({ ...question })),
    answers: session.answers.map((answer) => ({ ...answer })),
    roundsCompleted: session.roundsCompleted,
    roundLimit: ANALYSIS_ROUND_LIMIT,
    perRoundLimit: ANALYSIS_PER_ROUND_LIMIT,
    totalQuestionLimit: ANALYSIS_TOTAL_QUESTION_LIMIT,
    followUpEnded: session.followUpEnded,
    endReason: session.endReason,
    gaps: buildGaps(session),
    urgentPrompts: buildUrgentPrompts(session.facts, now),
    expectedStatusNote: buildExpectedStatusNote(session),
    independentMatters: { ...session.independentMatters },
    snapshot: session.snapshot === null ? null : { ...session.snapshot },
  };
}

/** 剩余决定性缺口：未被正面回答的决定性问题（不知道/尚未核实/存在争议）。 */
export function buildGaps(session: AnalysisSession): AnalysisGap[] {
  return session.answers
    .filter((answer) => answer.kind !== "value")
    .map((answer, index) => ({
      gapId: `gap-${String(index + 1).padStart(2, "0")}`,
      topic: answer.topic,
      topicLabel: QUESTION_TOPIC_LABELS[answer.topic],
      description: `「${answer.questionText}」的回答为：${answer.kindLabel}。该信息仍未确认，构成当前分析的决定性缺口。`,
      sourceQuestionIds: [answer.questionId],
    }));
}

const URGENT_HUMAN_CHECKS: Record<UrgentRiskCategory, string[]> = {
  personal_safety: [
    "确认相关人员当前是否仍处于危险之中，现场是否已得到控制。",
    "按现行规程评估是否需要先行处置或保护措施，并记录判断依据。",
  ],
  medical: [
    "确认受伤人员是否已获得医疗救助。",
    "确认病历、诊断证明等医疗记录的获取渠道，避免证据难以取得。",
  ],
  minor_protection: [
    "确认未成年人当前是否处于安全环境。",
    "核实监护人或其他保护责任的落实情况。",
  ],
  domestic_violence: [
    "确认受害人当前是否安全。",
    "评估是否存在再次发生的紧急风险，并按家庭暴力处置规程记录。",
  ],
  evidence_loss: [
    "确认关键证据是否仍有保存可能。",
    "评估立即保全的渠道与时限（如监控调取期限）。",
  ],
};

const URGENT_BOUNDARY_STATEMENT =
  "该提示由已确认事实触发，仅提醒人工核验，不构成自动处置决定或紧急状态的认定。";

/** 紧急核验提示：只由已确认且未被排除的紧急风险事实触发。 */
export function buildUrgentPrompts(facts: CandidateFact[], now: Date): UrgentRiskPrompt[] {
  const byCategory = new Map<UrgentRiskCategory, CandidateFact[]>();
  for (const fact of facts) {
    if (fact.excluded) continue;
    if (fact.riskCategory === null) continue;
    if (fact.status !== "confirmed") continue;
    const bucket = byCategory.get(fact.riskCategory) ?? [];
    bucket.push(fact);
    byCategory.set(fact.riskCategory, bucket);
  }

  return [...byCategory.entries()].map(([category, triggering], index) => ({
    promptId: `urgent-${category}-${index + 1}`,
    category,
    categoryLabel: URGENT_RISK_LABELS[category],
    triggeringFactIds: triggering.map((fact) => fact.factId),
    triggeringStatements: triggering.map((fact) => fact.originalWording),
    humanChecks: URGENT_HUMAN_CHECKS[category],
    boundaryStatement: URGENT_BOUNDARY_STATEMENT,
  }));
}

/** 预期限制说明：由缺口与争议状态保守合成，仅供参考。 */
export function buildExpectedStatusNote(session: AnalysisSession): string | null {
  if (session.stage !== "ready_to_analyze" && session.stage !== "snapshot_confirmed") return null;
  const activeFacts = session.facts.filter((fact) => !fact.excluded);
  const hasDisputed = activeFacts.some((fact) => fact.status === "disputed");
  const hasDisputedAnswer = session.answers.some((answer) => answer.kind === "disputed");
  const unresolvedGaps = session.answers.filter((answer) => answer.kind !== "value").length;

  if (hasDisputed || hasDisputedAnswer) {
    return "存在未解决的争议事实：报告可能为“存在多种可能—不可单一判断”，不会把其中一种说法当作唯一结论。";
  }
  if (unresolvedGaps > 0) {
    return `仍有 ${unresolvedGaps} 项未解决的决定性缺口：报告可能为“条件不足—需补充事实”，并将列明缺口与人工核验动作。`;
  }
  return "当前没有未解决的决定性缺口：若已确认事实满足条件，报告可能为“初步意见—待核验”。预期状态仅供参考，以实际报告为准。";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (Array.isArray(inner)) return inner;
    if (isRecord(inner)) {
      return Object.keys(inner)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = inner[key];
          return acc;
        }, {});
    }
    return inner;
  });
}

export function snapshotHash(sessionId: string, facts: CandidateFact[], answers: AnswerRecord[]): string {
  return createHash("sha256")
    .update(stableStringify({ sessionId, facts, answers }))
    .digest("hex");
}

function assertMutable(session: AnalysisSession): void {
  if (session.stage === "snapshot_confirmed") {
    throw new AnalysisInputError(
      "本次分析的事实快照已确认并锁定，不能再修改事实或回答；如需调整，请清除本次分析后重新开始。",
      409,
    );
  }
}

function toDecisiveQuestions(
  proposed: QuestionPoolResult["questions"],
  round: number,
): DecisiveQuestion[] {
  return proposed.map((question, index) => ({
    questionId: question.questionId,
    priority: question.priority,
    topic: question.topic,
    topicLabel: QUESTION_TOPIC_LABELS[question.topic],
    text: question.text,
    whyItMatters: question.whyItMatters,
    kind: question.kind,
    relatedFactIds: [...question.relatedFactIds],
    answerMaxLength: ANSWER_MAX_CHARACTERS,
    answerCategory: question.answerCategory,
    round,
    orderInRound: index + 1,
  }));
}

export class AnalysisEngine {
  private readonly sessions = new Map<string, AnalysisSession>();

  constructor(private readonly deps: EngineDeps) {}

  private pruneExpired(now: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_IDLE_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private touch(session: AnalysisSession, now: number): void {
    session.lastActiveAt = now;
  }

  private getLiveSession(sessionId: string, now: number): AnalysisSession {
    this.pruneExpired(now);
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new AnalysisInputError(
        "本次分析会话不存在或已结束，请重新开始一次分析。",
        404,
      );
    }
    this.touch(session, now);
    return session;
  }

  async createSession(request: CreateAnalysisRequest, now = new Date()): Promise<AnalysisSessionState> {
    const caseText = validateCaseText(request?.caseText);
    this.pruneExpired(now.getTime());

    const extraction = await this.deps.extractCaseFacts({ caseText });
    validateExtractionResult(extraction);

    const session: AnalysisSession = {
      sessionId: randomUUID(),
      createdAt: now.getTime(),
      lastActiveAt: now.getTime(),
      stage: "confirming_facts",
      caseCharacterCount: Array.from(caseText).length,
      facts: extraction.facts.map((fact) => ({ ...fact })),
      questions: [],
      answers: [],
      roundsCompleted: 0,
      questionsAskedTotal: 0,
      followUpEnded: false,
      endReason: null,
      independentMatters: extraction.independentMatters,
      snapshot: null,
    };
    this.sessions.set(session.sessionId, session);
    return toSessionState(session, now);
  }

  getSession(sessionId: string, now = new Date()): AnalysisSessionState {
    return toSessionState(this.getLiveSession(sessionId, now.getTime()), now);
  }

  clearSession(sessionId: string, now = new Date()): void {
    this.pruneExpired(now.getTime());
    this.sessions.delete(sessionId);
  }

  private findFact(session: AnalysisSession, factId: string): CandidateFact {
    const fact = session.facts.find((item) => item.factId === factId);
    if (fact === undefined) {
      throw new AnalysisInputError("未找到该事实项。", 404);
    }
    return fact;
  }

  setFactStatus(sessionId: string, factId: string, status: unknown, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);
    if (typeof status !== "string" || !FACT_STATUSES.has(status as FactStatus) || status === "candidate") {
      throw new AnalysisInputError("事实状态只能设置为确认、否认、未知或争议。");
    }
    const fact = this.findFact(session, factId);
    fact.status = status as FactStatus;
    fact.statusLabel = FACT_STATUS_LABELS[fact.status];
    if (fact.status === "candidate") {
      fact.confirmationMethod = null;
      fact.confirmedAt = null;
    } else {
      fact.confirmationMethod = fact.confirmationMethod ?? "officer";
      fact.confirmedAt = now.toISOString();
    }
    return toSessionState(session, now);
  }

  addFact(sessionId: string, request: AddFactRequest, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);
    const statement = validateStatementText(request?.statement, "补充事实内容", ANSWER_MAX_CHARACTERS);
    const factId = `fact-user-${String(session.facts.length + 1).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
    const fact: CandidateFact = {
      factId,
      category: "other",
      categoryLabel: FACT_CATEGORY_LABELS.other,
      statement,
      originalWording: statement,
      value: null,
      eventRefs: [],
      participantRefs: [],
      behaviorRefs: [],
      status: "confirmed",
      statusLabel: FACT_STATUS_LABELS.confirmed,
      sourceRound: null,
      confirmationMethod: "officer_added",
      confirmedAt: now.toISOString(),
      riskCategory: null,
      excluded: false,
    };
    session.facts.push(fact);
    return toSessionState(session, now);
  }

  setFactExclusion(sessionId: string, factId: string, excluded: boolean, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);
    const fact = this.findFact(session, factId);
    fact.excluded = excluded;
    return toSessionState(session, now);
  }

  /**
   * 推进追问：开始第一轮，或提交当前轮回答并生成下一轮。
   * 达到上限或没有剩余缺口时结束追问，保留缺口与不足状态。
   */
  async advanceRound(
    sessionId: string,
    request: AdvanceRoundRequest,
    now = new Date(),
  ): Promise<AnalysisSessionState> {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);

    if (session.stage === "ready_to_analyze" || session.stage === "snapshot_confirmed") {
      throw new AnalysisInputError("追问已经结束，当前处于分析前确认阶段。", 409);
    }

    // 开始第一轮。
    if (session.stage === "confirming_facts") {
      if (Array.isArray(request?.answers) && request.answers.length > 0) {
        throw new AnalysisInputError("开始追问时不需要提交回答。");
      }
      return this.startRound(session, now);
    }

    // 提交当前轮回答。
    const answers = request?.answers;
    if (!Array.isArray(answers)) {
      throw new AnalysisInputError("请提交本轮所有问题的回答。");
    }
    this.recordAnswers(session, answers, now);

    const remainingTotal = ANALYSIS_TOTAL_QUESTION_LIMIT - session.questionsAskedTotal;
    if (session.roundsCompleted >= ANALYSIS_ROUND_LIMIT || remainingTotal <= 0) {
      this.endFollowUp(session, "limits_reached");
      return toSessionState(session, now);
    }

    const state = await this.startRound(session, now, true);
    return state;
  }

  private endFollowUp(session: AnalysisSession, reason: "limits_reached" | "no_gaps"): void {
    session.stage = "ready_to_analyze";
    session.followUpEnded = true;
    session.endReason = reason;
    session.questions = [];
  }

  private async startRound(session: AnalysisSession, now: Date, fromAnswers = false): Promise<AnalysisSessionState> {
    if (fromAnswers) {
      session.roundsCompleted += 1;
    }

    const remainingTotal = ANALYSIS_TOTAL_QUESTION_LIMIT - session.questionsAskedTotal;
    const perRoundBudget = Math.min(ANALYSIS_PER_ROUND_LIMIT, remainingTotal);
    if (perRoundBudget <= 0) {
      this.endFollowUp(session, "limits_reached");
      return toSessionState(session, now);
    }

    const pool = await this.deps.proposeDecisiveQuestions({
      facts: session.facts.map((fact) => ({ ...fact })),
      answers: session.answers.map((answer) => ({
        questionId: answer.questionId,
        topic: answer.topic,
        kind: answer.kind,
      })),
      askedQuestionIds: session.answers.map((answer) => answer.questionId),
      maxQuestions: perRoundBudget,
    });    validateQuestionPoolResult(pool);

    if (pool.questions.length === 0) {
      this.endFollowUp(session, "no_gaps");
      return toSessionState(session, now);
    }

    const round = session.roundsCompleted + 1;
    session.questions = toDecisiveQuestions(pool.questions, round);
    session.questionsAskedTotal += session.questions.length;
    session.stage = "collecting_answers";
    return toSessionState(session, now);
  }

  private recordAnswers(session: AnalysisSession, answers: unknown[], now: Date): void {
    const byQuestionId = new Map(session.questions.map((question) => [question.questionId, question]));
    const validKinds = new Set(["value", "unknown", "not_verified", "disputed"]);

    // 先完整校验，再写入会话，避免校验失败留下部分状态。
    interface PreparedAnswer {
      question: DecisiveQuestion;
      kind: AnswerRecord["kind"];
      text: string | null;
    }
    const prepared: PreparedAnswer[] = [];
    const seen = new Set<string>();

    for (const entry of answers) {
      if (!isRecord(entry)) {
        throw new AnalysisInputError("回答格式无效。");
      }
      const questionId = entry.questionId;
      const kind = entry.kind;
      if (typeof questionId !== "string" || !byQuestionId.has(questionId)) {
        throw new AnalysisInputError("回答包含未知的问题编号。");
      }
      if (seen.has(questionId)) {
        throw new AnalysisInputError("每个问题只能提交一条回答。");
      }
      seen.add(questionId);
      if (typeof kind !== "string" || !validKinds.has(kind)) {
        throw new AnalysisInputError("回答类型无效：仅支持补充说明、不知道、尚未核实或存在争议。");
      }
      let text: string | null = null;
      if (kind === "value") {
        text = validateStatementText(entry.text, "回答内容", ANSWER_MAX_CHARACTERS);
      } else if (entry.text !== null && entry.text !== undefined) {
        throw new AnalysisInputError("该回答类型不接受补充文本。");
      }
      prepared.push({
        question: byQuestionId.get(questionId) as DecisiveQuestion,
        kind: kind as AnswerRecord["kind"],
        text,
      });
    }

    const unanswered = session.questions.filter((question) => !seen.has(question.questionId));
    if (unanswered.length > 0) {
      throw new AnalysisInputError(`还有 ${unanswered.length} 个问题未回答，请先完成本轮回答。`);
    }

    for (const item of prepared) {
      const { question } = item;
      session.answers.push({
        questionId: question.questionId,
        round: question.round,
        questionText: question.text,
        topic: question.topic,
        topicLabel: QUESTION_TOPIC_LABELS[question.topic],
        kind: item.kind,
        kindLabel: DECISIVE_ANSWER_KIND_LABELS[item.kind],
        text: item.text,
        answeredAt: now.toISOString(),
      });

      // 文本回答成为一条由民警确认的补充事实（来源轮次为当前轮）。
      if (item.kind === "value") {
        const factId = `fact-answer-${question.questionId}-${session.facts.length + 1}`;
        session.facts.push({
          factId,
          category: question.answerCategory,
          categoryLabel: FACT_CATEGORY_LABELS[question.answerCategory],
          statement: `民警回答「${question.text}」：${item.text}`,
          originalWording: item.text ?? "",
          value: null,
          eventRefs: [],
          participantRefs: [],
          behaviorRefs: [],
          status: "confirmed",
          statusLabel: FACT_STATUS_LABELS.confirmed,
          sourceRound: question.round,
          confirmationMethod: "officer",
          confirmedAt: now.toISOString(),
          riskCategory: null,
          excluded: false,
        });
      }
    }
  }

  /** 分析前确认：用户主动确认后形成不可变事实快照。 */
  confirmSnapshot(sessionId: string, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "ready_to_analyze") {
      throw new AnalysisInputError("只有完成决定性追问后才能确认事实快照。", 409);
    }
    const hash = snapshotHash(session.sessionId, session.facts, session.answers);
    session.snapshot = {
      snapshotVersion: 1,
      snapshotHash: hash,
      confirmedAt: now.toISOString(),
    };
    session.stage = "snapshot_confirmed";
    session.questions = [];
    return toSessionState(session, now);
  }

  resetForTests(): void {
    this.sessions.clear();
  }
}

export { SESSION_IDLE_TTL_MS };
