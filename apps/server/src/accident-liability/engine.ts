import { randomUUID } from "node:crypto";
import {
  ACCIDENT_LIABILITY_ANSWER_MAX_CHARACTERS,
  ACCIDENT_LIABILITY_CASE_MAX_CHARACTERS,
  ACCIDENT_LIABILITY_DISCLAIMER,
  ACCIDENT_LIABILITY_REPORT_MAX_CHARACTERS,
  CONTRACT_VERSION,
  countCharacters,
} from "@policymate/contracts";
import type {
  AccidentLiabilitySessionState,
  AccidentLiabilityStage,
  AccidentLiabilityTurn,
  LegalSourceReference,
} from "@policymate/contracts";
import { AnalysisInputError, AnalysisUpstreamError } from "../analysis/engine";
import type { AccidentLiabilityProvider } from "../providers/types";
import type { TelemetrySink } from "../telemetry";
import { checkCitations, citationNotice } from "./citation-check";

/** 空闲多久后丢弃会话；与案情分析一致，只保存在短暂运行内存（ADR-0004）。 */
export const ACCIDENT_LIABILITY_SESSION_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_ACCIDENT_LIABILITY_TIMEOUT_MS = 60 * 1000;
/**
 * 一次请求的重试总预算（含首次）。
 *
 * 重试不得把等待翻倍：每次尝试的可用时限是“单次超时”与“剩余预算”的较小值，
 * 预算耗尽就以最后一次失败结束，而不是再等一个完整超时。
 */
export const DEFAULT_ACCIDENT_LIABILITY_TOTAL_BUDGET_MS = 120 * 1000;
export const DEFAULT_ACCIDENT_LIABILITY_MAX_ATTEMPTS = 2;

/** 报告被长度上限截断时追加的固定提示；由后端附加，不经过模型。 */
const TRUNCATION_NOTE = "\n\n（本报告超出长度上限，已截断；建议缩小范围或补充追问后重新生成。）";

interface AccidentLiabilitySession {
  sessionId: string;
  stage: AccidentLiabilityStage;
  turns: AccidentLiabilityTurn[];
  report: string | null;
  lastActiveAt: number;
}

export interface AccidentLiabilityEngineOptions {
  /** 单次边界调用超时。 */
  timeoutMs?: number;
  /** 一次请求的重试总预算（含首次）；未给出时退回 `timeoutMs × maxAttempts`。 */
  totalBudgetMs?: number;
  /** 边界错误时最多尝试次数（含首次）。 */
  maxAttempts?: number;
  telemetry?: TelemetrySink;
}

/** 只接受纯文本：拒绝控制字符（换行、回车、制表除外）。 */
function validatePlainText(raw: unknown, label: string, maxCharacters: number): string {
  if (typeof raw !== "string") {
    throw new AnalysisInputError(`${label}必须以纯文本提交。`);
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new AnalysisInputError(`${label}不能为空。`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) {
    throw new AnalysisInputError(`${label}包含不支持的格式或特殊字符，仅接受纯文本。`);
  }
  if (countCharacters(trimmed) > maxCharacters) {
    throw new AnalysisInputError(
      `${label}超过 ${maxCharacters.toLocaleString("zh-Hans-CN")} 字符上限；系统不会截断内容。`,
    );
  }
  return trimmed;
}

export function validateAccidentCaseText(raw: unknown): string {
  return validatePlainText(raw, "事故概况", ACCIDENT_LIABILITY_CASE_MAX_CHARACTERS);
}

export function validateAccidentAnswer(raw: unknown): string {
  return validatePlainText(raw, "追问回答", ACCIDENT_LIABILITY_ANSWER_MAX_CHARACTERS);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new AnalysisInputError("本次问答已取消。", 409));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AnalysisUpstreamError(`分析服务在 ${timeoutMs} 毫秒内没有返回结果。`, 1, null));
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * 交通事故责任认定辅助引擎。
 *
 * 会话只存在于短暂运行内存，不含数据库或日志持久化；模型输出只决定“继续
 * 追问”还是“给出报告”，后端不做问题分支预设，也不把任何输出当作官方结论。
 */
export class AccidentLiabilityEngine {
  private readonly sessions = new Map<string, AccidentLiabilitySession>();
  private readonly timeoutMs: number;
  private readonly totalBudgetMs: number;
  private readonly maxAttempts: number;
  private readonly telemetry: TelemetrySink | undefined;

  constructor(
    private readonly provider: NonNullable<AccidentLiabilityProvider["consultAccidentLiability"]>,
    options: AccidentLiabilityEngineOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_ACCIDENT_LIABILITY_TIMEOUT_MS;
    this.totalBudgetMs =
      options.totalBudgetMs ??
      this.timeoutMs * Math.max(options.maxAttempts ?? DEFAULT_ACCIDENT_LIABILITY_MAX_ATTEMPTS, 1);
    this.maxAttempts = Math.max(options.maxAttempts ?? DEFAULT_ACCIDENT_LIABILITY_MAX_ATTEMPTS, 1);
    this.telemetry = options.telemetry;
  }

  private prune(now: number): void {
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActiveAt > ACCIDENT_LIABILITY_SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private require(sessionId: string, now: number): AccidentLiabilitySession {
    this.prune(now);
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new AnalysisInputError("本次问答已过期或不存在，请重新开始。", 404);
    }
    return session;
  }

  private toState(session: AccidentLiabilitySession): AccidentLiabilitySessionState {
    return {
      contractVersion: CONTRACT_VERSION,
      sessionId: session.sessionId,
      stage: session.stage,
      turns: session.turns.map((turn) => ({ ...turn })),
      report: session.report,
      disclaimer: ACCIDENT_LIABILITY_DISCLAIMER,
    };
  }

  /**
   * 调用边界并校验输出形状。输出不是“问题或报告”的纯文本时整体失败关闭；
   * 失败不写入会话，民警可以重试。
   */
  private async consult(
    turns: AccidentLiabilityTurn[],
    forceReport: boolean,
    legalSources: LegalSourceReference[],
    signal?: AbortSignal,
  ): Promise<{ kind: "question" | "report"; text: string }> {
    const startedAt = performance.now();
    // 法源材料字符数（只计数）：载荷大小是首字延迟的可测变量，需进遥测才能归因。
    const payloadChars = JSON.stringify(legalSources).length;
    // 思维链只计数：事故问答是非流式，若上游返回 reasoning_content，它就是 41 秒里
    // 看不见的那一半；没有这个数字就只能把"思考"和"拥塞"混为一谈。
    let reasoningChars = 0;
    let lastError: unknown = null;
    let usedAttempts = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      // 剩余预算不足时不另起一次注定超时的尝试。
      const remaining = this.totalBudgetMs - (performance.now() - startedAt);
      if (remaining <= 0) break;
      usedAttempts = attempt;
      try {
        const output = await withTimeout(
          this.provider(
            {
              turns: turns.map((turn) => ({ ...turn })),
              forceReport,
              legalSources,
              requestId: randomUUID(),
              onThinking: (info) => {
                reasoningChars = info.reasoningChars;
              },
            },
            signal,
          ),
          Math.min(this.timeoutMs, remaining),
          signal,
        );
        const invalid =
          output === null ||
          typeof output !== "object" ||
          (output.kind !== "question" && output.kind !== "report") ||
          typeof output.text !== "string" ||
          output.text.trim() === "";
        if (invalid) {
          lastError = new Error("边界返回不符合结构契约。");
          continue;
        }
        if (forceReport && output.kind !== "report") {
          lastError = new Error("边界未按要求直接给出报告。");
          continue;
        }
        this.telemetry?.record({
          requestId: randomUUID(),
          timestamp: new Date().toISOString(),
          kind: "accident.consult",
          outcome: "ok",
          durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
          attempts: attempt,
          payloadChars,
          ...(reasoningChars > 0 ? { reasoningChars } : {}),
          featureState: forceReport ? "force_report" : output.kind,
        });
        return { kind: output.kind, text: output.text.trim() };
      } catch (error) {
        if (error instanceof AnalysisInputError) throw error;
        lastError = error;
      }
    }
    this.telemetry?.record({
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      kind: "accident.consult",
      outcome: "error",
      durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
      attempts: usedAttempts,
      payloadChars,
      ...(reasoningChars > 0 ? { reasoningChars } : {}),
      featureState: forceReport ? "force_report" : "question",
    });
    throw new AnalysisUpstreamError("分析服务暂不可用，请稍后再试。", Math.max(usedAttempts, 1), lastError);
  }

  /** 应用一次边界输出：追问追加一轮；报告写入并切换到 `report_ready`。 */
  private apply(
    session: AccidentLiabilitySession,
    output: { kind: "question" | "report"; text: string },
    legalSources: LegalSourceReference[],
  ): void {
    if (output.kind === "question") {
      session.turns.push({
        turnId: randomUUID(),
        speaker: "assistant",
        text: output.text,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    // 报告本身不是一轮问答，只作为 `report` 字段返回；问答记录保持为追问与回答。
    const truncated = countCharacters(output.text) > ACCIDENT_LIABILITY_REPORT_MAX_CHARACTERS;
    const base = truncated
      ? `${Array.from(output.text).slice(0, ACCIDENT_LIABILITY_REPORT_MAX_CHARACTERS).join("")}${TRUNCATION_NOTE}`
      : output.text;
    // 事后核对引用（ADR-0019）：未命中的条号就地降级标注，命中的附上后端原文。
    const checked = checkCitations(base, legalSources);
    const notice = citationNotice(checked);
    session.report =
      checked.verified.length === 0 && checked.unverified.length === 0 ? checked.text : `${checked.text}${notice}`;
    session.stage = "report_ready";
  }

  /** 新建会话：提交事故概况，返回模型的第一轮追问或直接给出的报告。 */
  async createSession(
    rawCaseText: unknown,
    legalSources: LegalSourceReference[],
    signal?: AbortSignal,
  ): Promise<AccidentLiabilitySessionState> {
    const caseText = validateAccidentCaseText(rawCaseText);
    const session: AccidentLiabilitySession = {
      sessionId: randomUUID(),
      stage: "questioning",
      turns: [
        {
          turnId: randomUUID(),
          speaker: "officer",
          text: caseText,
          createdAt: new Date().toISOString(),
        },
      ],
      report: null,
      lastActiveAt: Date.now(),
    };
    const output = await this.consult(session.turns, false, legalSources, signal);
    this.apply(session, output, legalSources);
    session.lastActiveAt = Date.now();
    this.sessions.set(session.sessionId, session);
    this.prune(session.lastActiveAt);
    return this.toState(session);
  }

  /** 追加一轮民警回答，返回下一轮追问或报告。 */
  async answer(
    sessionId: string,
    rawAnswer: unknown,
    legalSources: LegalSourceReference[],
    signal?: AbortSignal,
  ): Promise<AccidentLiabilitySessionState> {
    const answer = validateAccidentAnswer(rawAnswer);
    const session = this.require(sessionId, Date.now());
    if (session.stage === "report_ready") {
      throw new AnalysisInputError("本次问答已生成研判报告，不能再追加回答；请重新开始新的问答。", 409);
    }
    const turn: AccidentLiabilityTurn = {
      turnId: randomUUID(),
      speaker: "officer",
      text: answer,
      createdAt: new Date().toISOString(),
    };
    session.turns.push(turn);
    try {
      const output = await this.consult(session.turns, false, legalSources, signal);
      this.apply(session, output, legalSources);
    } catch (error) {
      // 失败不留下民警这一轮，避免重试后记录重复。
      session.turns.pop();
      throw error;
    }
    session.lastActiveAt = Date.now();
    return this.toState(session);
  }

  /** 民警主动要求：即使模型认为信息不足，本次也直接产出研判报告。 */
  async requestReport(
    sessionId: string,
    legalSources: LegalSourceReference[],
    signal?: AbortSignal,
  ): Promise<AccidentLiabilitySessionState> {
    const session = this.require(sessionId, Date.now());
    if (session.stage === "report_ready") {
      return this.toState(session);
    }
    const output = await this.consult(session.turns, true, legalSources, signal);
    this.apply(session, output, legalSources);
    session.lastActiveAt = Date.now();
    return this.toState(session);
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
