import { createHash, randomUUID } from "node:crypto";
import type {
  AddFactRequest,
  AnalysisSessionState,
  AnalysisReport,
  AnalysisStage,
  CandidateFact,
  CreateAnalysisRequest,
  FactCategory,
  FactSnapshot,
  FactStatus,
  GapAnswer,
  ReviseFactRequest,
  UrgentRiskCategory,
  UrgentRiskPrompt,
  GenerateReportRequest,
  LegalSourceReference,
  ReportGapBranch,
} from "@policymate/contracts";
import {
  ANALYSIS_STAGE_LABELS,
  ANSWER_MAX_CHARACTERS,
  CASE_TEXT_MAX_CHARACTERS,
  countCharacters,
  FACT_CATEGORY_LABELS,
  FACT_STATUS_LABELS,
  GAP_ANSWER_LABELS,
  URGENT_RISK_LABELS,
} from "@policymate/contracts";
import type {
  CaseExtractionResult,
  CaseAnalysisProvider,
  CaseFocusResolution,
  ReportGenerationRequest,
} from "../providers/types";
import type { TelemetrySink } from "../telemetry";
import {
  applyConservativeDowngrade,
  attachReportFactReferences,
  buildReport,
  validateReportResult,
  type ConservativeDowngradeStatus,
} from "./report";

/**
 * 案情分析状态机。
 *
 * - 会话只存在于短暂运行内存（30 分钟空闲后失效），不写入数据库或日志；
 * - 提交案情后直接提取候选事实、形成不可变事实快照并生成报告，没有事实
 *   确认与追问的前置阶段；
 * - 事实是会话内的工作集合；快照形成后锁定，补充或修改事实进入
 *   `modifying_facts`，确认后形成新版本快照并使旧报告失效；
 * - 紧急风险提示由系统提取出的风险标记直接触发，无需民警确认（ADR-0008 第 4 点）。
 */

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

/** 候选事实提取单次最多等待 30 秒；完整报告最多等待 90 秒。 */
export const DEFAULT_ANALYSIS_TIMEOUT_MS = 30 * 1000;
export const DEFAULT_REPORT_TIMEOUT_MS = 90 * 1000;
/** 空结果、结构错误、来源校验失败或超时最多自动重试一次。 */
export const DEFAULT_MAX_ATTEMPTS = 2;

export type EngineDeps = Pick<CaseAnalysisProvider, "extractCaseFacts" | "generateReport">;

/** 把事实解析到受治理重点案情并返回本次可用法源。 */
export type CaseFocusResolver = (
  facts: CandidateFact[],
  now: Date,
) => Promise<CaseFocusResolution>;

/** 外部边界超时；测试可注入更短的上限。 */
export class AnalysisTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`外部边界在 ${timeoutMs} 毫秒内没有返回结果。`);
    this.name = "AnalysisTimeoutError";
  }
}

/** 外部边界在有限次重试后仍不可用；必须整体失败关闭。 */
export class AnalysisUpstreamError extends Error {
  readonly statusCode = 503;
  readonly apiCode = "service_unavailable" as const;
  constructor(
    message: string,
    readonly attempts: number,
    readonly underlying: unknown,
  ) {
    super(message);
    this.name = "AnalysisUpstreamError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AnalysisTimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface AnalysisEngineOptions {
  analysisTimeoutMs?: number;
  reportTimeoutMs?: number;
  maxAttempts?: number;
  telemetry?: TelemetrySink;
}

interface AnalysisSession {
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
  stage: AnalysisStage;
  caseCharacterCount: number;
  facts: CandidateFact[];
  independentMatters: AnalysisSessionState["independentMatters"];
  snapshot: FactSnapshot;
  /** 快照确认时的完整可变状态备份，用于放弃未确认的修改。 */
  snapshotBackup: SnapshotBackup;
  /** 未确认的事实修改；非 `null` 时旧报告仍可见但必须标记“修改尚未应用”。 */
  modification: { baseSnapshotVersion: number; baseSnapshotHash: string; startedAt: number } | null;
  /** 民警对各决定性缺口的回答；不改变事实，只表明缺口仍未解决。 */
  gapAnswers: Map<string, GapAnswer>;
}

interface SnapshotBackup {
  facts: CandidateFact[];
  snapshot: FactSnapshot;
}

/** 输入校验失败；message 为面向民警的说明。 */
export class AnalysisInputError extends Error {
  readonly statusCode: number;
  /** 可选的显式用户可见错误分类；未给出时按状态码推导。 */
  readonly apiCode?: import("@policymate/contracts").ApiErrorCode;
  constructor(
    message: string,
    statusCode = 400,
    apiCode?: import("@policymate/contracts").ApiErrorCode,
  ) {
    super(message);
    this.name = "AnalysisInputError";
    this.statusCode = statusCode;
    this.apiCode = apiCode;
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

const FACT_CATEGORIES: ReadonlySet<string> = new Set(Object.keys(FACT_CATEGORY_LABELS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 只接受纯文本：拒绝控制字符（换行、回车、制表除外）。 */
export function validateCaseText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AnalysisInputError("案情内容必须以纯文本提交。");
  }
  // 按 Unicode 码点计数，避免把代理对算作两个字符。
  const codePointCount = countCharacters(raw);
  if (codePointCount === 0 || raw.trim() === "") {
    throw new AnalysisInputError("请输入案情内容后再提交。");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) {
    throw new AnalysisInputError("案情内容包含不支持的格式或特殊字符，仅接受纯文本。");
  }
  if (codePointCount > CASE_TEXT_MAX_CHARACTERS) {
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
  if (countCharacters(trimmed) > maxCharacters) {
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
  if (result.facts.length === 0) {
    throw new AnalysisContractError("提取结果为空，未形成任何候选事实。");
  }
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
    // 缺口绑定只能由民警在补充流程中显式建立，外部提取边界不得自行声明。
    if (!Array.isArray(fact.resolvesGapIds) || fact.resolvesGapIds.length > 0) {
      throw new AnalysisContractError("提取结果不得预置决定性缺口绑定。");
    }
  }
  const matters = result.independentMatters;
  if (!isRecord(matters) || typeof matters.detected !== "boolean") {
    throw new AnalysisContractError("独立事项检测结果无效。");
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
    urgentPrompts: buildUrgentPrompts(session.facts, now),
    independentMatters: { ...session.independentMatters },
    snapshot: { ...session.snapshot },
    modification:
      session.modification === null
        ? null
        : {
            baseSnapshotVersion: session.modification.baseSnapshotVersion,
            baseSnapshotHash: session.modification.baseSnapshotHash,
            startedAt: new Date(session.modification.startedAt).toISOString(),
          },
  };
}

/** 核验事项的固定前缀：提示措辞只保持“请核验”，不下结论。 */
const HUMAN_CHECK_PREFIX = "请核验：";

const URGENT_HUMAN_CHECKS: Record<UrgentRiskCategory, string[]> = {
  personal_safety: [
    `${HUMAN_CHECK_PREFIX}相关人员当前是否仍处于危险之中，现场是否已得到控制。`,
    `${HUMAN_CHECK_PREFIX}按现行规程是否需要先行处置或保护措施，并记录判断依据。`,
  ],
  medical: [
    `${HUMAN_CHECK_PREFIX}受伤人员是否已获得医疗救助。`,
    `${HUMAN_CHECK_PREFIX}病历、诊断证明等医疗记录的获取渠道，避免证据难以取得。`,
  ],
  minor_protection: [
    `${HUMAN_CHECK_PREFIX}未成年人当前是否处于安全环境。`,
    `${HUMAN_CHECK_PREFIX}监护人或其他保护责任的落实情况。`,
  ],
  domestic_violence: [
    `${HUMAN_CHECK_PREFIX}受害人当前是否安全。`,
    `${HUMAN_CHECK_PREFIX}是否存在再次发生的紧急风险，并按家庭暴力处置规程记录。`,
  ],
  evidence_loss: [
    `${HUMAN_CHECK_PREFIX}关键证据是否仍有保存可能。`,
    `${HUMAN_CHECK_PREFIX}立即保全的渠道与时限（如监控调取期限）。`,
  ],
};

const URGENT_BOUNDARY_STATEMENT =
  "该提示由系统提取的风险标记直接触发，仅提醒人工核验；请核验后再作判断，不构成自动处置决定或紧急状态的认定。";

/**
 * 紧急核验提示：由系统提取的风险标记直接触发，无需民警确认。
 *
 * 已排除的事实不参与；民警明确否认的事实不触发提示。提示只列出触发事实、
 * 需要人工核验的事项与固定边界说明，不下定性或处罚结论（ADR-0008 第 4 点）。
 */
export function buildUrgentPrompts(facts: CandidateFact[], _now: Date): UrgentRiskPrompt[] {
  const byCategory = new Map<UrgentRiskCategory, CandidateFact[]>();
  for (const fact of facts) {
    if (fact.excluded) continue;
    if (fact.status === "denied") continue;
    if (fact.riskCategory === null) continue;
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

export function snapshotHash(sessionId: string, facts: CandidateFact[]): string {
  return createHash("sha256")
    .update(stableStringify({ sessionId, facts }))
    .digest("hex");
}

function assertMutable(session: AnalysisSession): void {
  if (session.stage === "snapshot_confirmed") {
    throw new AnalysisInputError(
      "本次分析的事实快照已确认并锁定，不能再修改事实；如需调整，请从报告进入“补充或修改事实”。",
      409,
    );
  }
}

function formSnapshot(session: AnalysisSession, version: number, now: Date): FactSnapshot {
  return {
    snapshotVersion: version,
    snapshotHash: snapshotHash(
      session.sessionId,
      session.facts.map((fact) => ({ ...fact })),
    ),
    confirmedAt: now.toISOString(),
  };
}

export class AnalysisEngine {
  private readonly sessions = new Map<string, AnalysisSession>();
  private readonly analysisTimeoutMs: number;
  private readonly reportTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly telemetry: TelemetrySink | undefined;

  constructor(
    private readonly deps: EngineDeps,
    options: AnalysisEngineOptions = {},
  ) {
    this.analysisTimeoutMs = options.analysisTimeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS;
    this.reportTimeoutMs = options.reportTimeoutMs ?? DEFAULT_REPORT_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.telemetry = options.telemetry;
  }

  /**
   * 调用外部边界：在总超时预算内，空结果、结构错误、来源校验失败或超时
   * 最多自动重试一次；仍失败则整体失败关闭，不展示半成品。
   *
   * 单次尝试的时限为 `总预算 / 最多尝试次数`，保证“最多等待 30 秒 / 90 秒”
   * 是包含重试在内的总预算，而不是单次尝试翻倍。
   */
  private async callUpstream<T>(
    label: string,
    kind: string,
    totalTimeoutMs: number,
    attempt: () => Promise<T>,
  ): Promise<T> {
    const perAttemptMs = Math.max(1, Math.floor(totalTimeoutMs / this.maxAttempts));
    let lastError: unknown;
    for (let tries = 1; tries <= this.maxAttempts; tries += 1) {
      try {
        return await withTimeout(attempt(), perAttemptMs);
      } catch (error) {
        lastError = error;
        const wasTimeout = error instanceof AnalysisTimeoutError;
        this.telemetry?.record({
          requestId: randomUUID(),
          timestamp: new Date().toISOString(),
          kind,
          outcome: tries < this.maxAttempts ? "retry" : wasTimeout ? "timeout" : "error",
          attempts: tries,
        });
      }
    }
    throw new AnalysisUpstreamError(`${label}暂时不可用，已停止本次处理。`, this.maxAttempts, lastError);
  }

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

  /**
   * 提交案情：提取候选事实、直接形成不可变事实快照。
   * 不再经过候选事实确认与决定性追问，报告由路由在同一请求内生成。
   */
  async createSession(request: CreateAnalysisRequest, now = new Date()): Promise<AnalysisSessionState> {
    const caseText = validateCaseText(request?.caseText);
    this.pruneExpired(now.getTime());

    const extraction = await this.callUpstream(
      "候选事实提取",
      "analysis.extraction",
      this.analysisTimeoutMs,
      async () => {
        const result = await this.deps.extractCaseFacts({ caseText });
        validateExtractionResult(result);
        return result;
      },
    );
    this.telemetry?.record({
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      kind: "analysis.extraction",
      outcome: "ok",
      inputCharacters: countCharacters(caseText),
      outputItems: extraction.facts.length,
      attempts: 1,
    });

    const sessionId = randomUUID();
    const facts = extraction.facts.map((fact) => ({ ...fact }));
    const snapshot: FactSnapshot = {
      snapshotVersion: 1,
      snapshotHash: snapshotHash(sessionId, facts),
      confirmedAt: now.toISOString(),
    };
    const session: AnalysisSession = {
      sessionId,
      createdAt: now.getTime(),
      lastActiveAt: now.getTime(),
      stage: "snapshot_confirmed",
      caseCharacterCount: countCharacters(caseText),
      facts,
      independentMatters: extraction.independentMatters,
      snapshot,
      snapshotBackup: this.captureSnapshotBackup({ facts, snapshot }),
      modification: null,
      gapAnswers: new Map(),
    };
    this.sessions.set(session.sessionId, session);
    return toSessionState(session, now);
  }

  getSession(sessionId: string, now = new Date()): AnalysisSessionState {
    return toSessionState(this.getLiveSession(sessionId, now.getTime()), now);
  }

  async generateReport(
    sessionId: string,
    request: GenerateReportRequest,
    legalSources: LegalSourceReference[],
    now = new Date(),
    releaseId = "",
    resolveCaseFocus?: CaseFocusResolver,
  ): Promise<AnalysisReport> {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "snapshot_confirmed") {
      throw new AnalysisInputError("只有确认事实快照后才能生成完整分析报告。", 409);
    }
    if (request.contractVersion !== "1.0" || request.requestId === "" ||
      request.snapshotVersion !== session.snapshot.snapshotVersion || request.snapshotHash !== session.snapshot.snapshotHash) {
      throw new AnalysisInputError("报告请求的契约或事实快照版本不匹配，已丢弃本次请求。", 409);
    }
    if (this.deps.generateReport === undefined) {
      throw new AnalysisContractError("报告生成边界不可用。");
    }

    // 受治理内容解析：命中重点案情时只使用该重点案情的法源；
    // 重点案情不可用、决定性事实缺口或相邻方向不能排除时保守降级。
    let effectiveLegalSources = legalSources;
    let forcedStatus: ConservativeDowngradeStatus | null = null;
    let reportFocus: { caseFocusId: string | null; caseFocusVersion: string | null } = {
      caseFocusId: null,
      caseFocusVersion: null,
    };
    const downgradeNotes: string[] = [];
    let gapBranches: ReportGapBranch[] = [];
    if (resolveCaseFocus !== undefined) {
      const resolution = await resolveCaseFocus(
        session.facts.map((fact) => ({ ...fact })),
        now,
      );
      effectiveLegalSources = resolution.legalSources;
      reportFocus = {
        caseFocusId: resolution.caseFocusId,
        caseFocusVersion: resolution.caseFocusVersion,
      };
      const basisUnavailable =
        resolution.caseFocusId !== null && !resolution.caseFocusEligible;
      // 保守顺序（规格 7.2、ADR-0005）：依据不可用 > 存在多种可能 > 条件不足。
      // 同时命中多个条件时取最保守的一个，而不是第一个匹配的；
      // 事实限制说明保留全部已解析限制。
      if (basisUnavailable) {
        const label =
          resolution.caseFocusTitle === null
            ? "命中的重点案情"
            : `命中的重点案情「${resolution.caseFocusTitle}」`;
        downgradeNotes.push(`${label}当前不可用，受影响内容立即停止支撑主结论。`);
      }
      downgradeNotes.push(
        ...resolution.unresolvedGapNotes,
        ...resolution.unresolvedAlternatives.map(
          (title) => `不能排除的相邻方向：${title}。`,
        ),
      );
      if (basisUnavailable) {
        forcedStatus = "basis_unavailable";
      } else if (resolution.unresolvedAlternatives.length > 0) {
        forcedStatus = "conflicting";
      } else if (resolution.unresolvedGapNotes.length > 0) {
        forcedStatus = "insufficient_facts";
      }
      // 依据不可用时不展示任何分支或程序路径；否则把未解决缺口展开为
      // “若…则…”分支，并叠加民警已回答的“未知/待核实”状态。
      if (forcedStatus !== "basis_unavailable") {
        gapBranches = resolution.unresolvedGapBranches.map((branch) => {
          const answer = session.gapAnswers.get(branch.gapId) ?? null;
          return {
            ...branch,
            branches: branch.branches.map((path) => ({
              ...path,
              proceduralPath: [...path.proceduralPath],
              basis: path.basis === null ? null : { ...path.basis },
            })),
            officerAnswer: answer,
            officerAnswerLabel: answer === null ? null : GAP_ANSWER_LABELS[answer],
          };
        });
      }
    }

    const providerRequest: ReportGenerationRequest = {
      facts: session.facts.map((fact) => ({ ...fact })),
      snapshot: { ...session.snapshot },
      legalSources: effectiveLegalSources.map((source) => ({ ...source, articles: source.articles.map((article) => ({ ...article })) })),
    };
    const state = toSessionState(session, now);
    const result = await this.callUpstream(
      "报告生成",
      "analysis.report",
      this.reportTimeoutMs,
      async () => {
        const generated = await this.deps.generateReport!(providerRequest);
        // 提供者只返回事实 ID；确认状态与依据明细必须由后端从未被排除的事实补齐。
        const enriched = attachReportFactReferences(generated, session.facts);
        validateReportResult(enriched, state, effectiveLegalSources);
        return enriched;
      },
    );
    const effectiveResult =
      forcedStatus === null
        ? result
        : applyConservativeDowngrade(result, forcedStatus, downgradeNotes);
    this.telemetry?.record({
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      kind: "analysis.report",
      outcome: "ok",
      outputItems: effectiveResult.modules.length,
      matchedSourceIds: effectiveLegalSources
        .filter((source) => source.status === "current")
        .map((source) => source.sourceId),
      attempts: 1,
    });
    return buildReport(state, request.requestId, now.toISOString(), effectiveResult, releaseId, reportFocus, gapBranches);
  }

  clearSession(sessionId: string, now = new Date()): void {
    this.pruneExpired(now.getTime());
    this.sessions.delete(sessionId);
  }

  /**
   * 记录民警对某个决定性缺口的回答：“未知”或“待核实”。
   *
   * 该回答不改变事实快照，缺口仍处于未解决状态，因此报告必须继续保持
   * 分支呈现；只影响报告的 `officerAnswer` 字段。
   */
  answerGap(sessionId: string, gapId: string, answer: unknown, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "snapshot_confirmed") {
      throw new AnalysisInputError("存在尚未确认的事实修改，不能对当前报告的缺口作答。", 409);
    }
    if (typeof gapId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(gapId)) {
      throw new AnalysisInputError("决定性缺口标识无效。", 400);
    }
    if (answer !== "unknown" && answer !== "pending_verification") {
      throw new AnalysisInputError("对决定性缺口的回答只能是“未知”或“待核实”。", 400);
    }
    session.gapAnswers.set(gapId, answer);
    return toSessionState(session, now);
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
    fact.confirmationMethod = fact.confirmationMethod ?? "officer";
    fact.confirmedAt = now.toISOString();
    return toSessionState(session, now);
  }

  addFact(sessionId: string, request: AddFactRequest, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);
    const statement = validateStatementText(request?.statement, "补充事实内容", ANSWER_MAX_CHARACTERS);
    const rawCategory = request?.category;
    const category: FactCategory =
      typeof rawCategory === "string" && FACT_CATEGORIES.has(rawCategory)
        ? (rawCategory as FactCategory)
        : "other";
    const rawGapId = request?.resolvesGapId;
    if (
      rawGapId !== undefined &&
      (typeof rawGapId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(rawGapId))
    ) {
      throw new AnalysisInputError("决定性缺口标识无效。", 400);
    }
    const factId = `fact-user-${String(session.facts.length + 1).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
    const fact: CandidateFact = {
      factId,
      category,
      categoryLabel: FACT_CATEGORY_LABELS[category],
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
      replacesFactId: null,
      supersededByFactId: null,
      resolvesGapIds: rawGapId === undefined ? [] : [rawGapId],
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
   * 确认事实快照。提交案情时由 `createSession` 直接形成首个快照；
   * 这里只处理“补充或修改事实”阶段：形成新版本快照，旧报告立即失效。
   */
  confirmSnapshot(sessionId: string, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "modifying_facts") {
      throw new AnalysisInputError("当前没有待确认的事实修改。", 409);
    }
    return this.applyModification(session, now);
  }

  private captureSnapshotBackup(source: { facts: CandidateFact[]; snapshot: FactSnapshot }): SnapshotBackup {
    return {
      facts: source.facts.map((fact) => ({ ...fact })),
      snapshot: { ...source.snapshot },
    };
  }

  /** 从报告进入“补充或修改事实”：创建待确认修改，旧报告仍保持可见。 */
  beginModification(sessionId: string, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "snapshot_confirmed") {
      throw new AnalysisInputError("只有已生成报告的已确认事实快照才能进入补充或修改事实。", 409);
    }
    session.stage = "modifying_facts";
    session.modification = {
      baseSnapshotVersion: session.snapshot.snapshotVersion,
      baseSnapshotHash: session.snapshot.snapshotHash,
      startedAt: now.getTime(),
    };
    return toSessionState(session, now);
  }

  /** 放弃尚未确认的修改：恢复到进入修改前的事实与快照。 */
  discardModification(sessionId: string, now = new Date()): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    if (session.stage !== "modifying_facts") {
      throw new AnalysisInputError("当前没有待确认的事实修改。", 409);
    }
    const backup = session.snapshotBackup;
    session.facts = backup.facts.map((fact) => ({ ...fact }));
    session.snapshot = { ...backup.snapshot };
    session.modification = null;
    session.stage = "snapshot_confirmed";
    return toSessionState(session, now);
  }

  /**
   * 确认修改：形成新版本不可变快照，旧报告立即失效。
   * 不改写既有事实内容，只把当前修改集合固化为新快照。
   */
  private applyModification(session: AnalysisSession, now: Date): AnalysisSessionState {
    const version = session.snapshot.snapshotVersion + 1;
    session.snapshot = formSnapshot(session, version, now);
    session.modification = null;
    // 缺口回答只属于旧报告；新快照必须重新计算，不能把“未知/待核实”
    // 按可复用 gapId 迁移到新报告或另一个重点案情。
    session.gapAnswers.clear();
    session.snapshotBackup = this.captureSnapshotBackup(session);
    session.stage = "snapshot_confirmed";
    return toSessionState(session, now);
  }

  /**
   * 在“补充或修改事实”阶段创建替代事实项。
   *
   * - `replace`：新事实替代旧事实，旧事实退出本次分析；
   * - `dispute`：两个版本都不能排除，两个版本都记录为争议事实，
   *   由系统保留分支而不是静默选择其中一个。
   */
  reviseFact(
    sessionId: string,
    factId: string,
    request: ReviseFactRequest,
    now = new Date(),
  ): AnalysisSessionState {
    const session = this.getLiveSession(sessionId, now.getTime());
    assertMutable(session);
    const target = this.findFact(session, factId);
    const resolution = request?.resolution;
    if (resolution !== "replace" && resolution !== "dispute") {
      throw new AnalysisInputError("替代方式只能是“替代旧版本”或“记为争议事实”。", 400);
    }
    const statement = validateStatementText(request?.statement, "替代事实内容", ANSWER_MAX_CHARACTERS);
    const factIdNew = `fact-revision-${String(session.facts.length + 1).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
    const status: FactStatus = resolution === "replace" ? "confirmed" : "disputed";

    if (resolution === "replace") {
      target.excluded = true;
      target.supersededByFactId = factIdNew;
    } else {
      // 两个版本都不能排除：旧版本保留在本次分析中并改为争议事实。
      target.excluded = false;
      target.status = "disputed";
      target.statusLabel = FACT_STATUS_LABELS.disputed;
      target.confirmedAt = now.toISOString();
      target.confirmationMethod = target.confirmationMethod ?? "officer";
    }

    session.facts.push({
      factId: factIdNew,
      category: target.category,
      categoryLabel: target.categoryLabel,
      statement,
      originalWording: statement,
      value: null,
      eventRefs: [...target.eventRefs],
      participantRefs: [...target.participantRefs],
      behaviorRefs: [...target.behaviorRefs],
      status,
      statusLabel: FACT_STATUS_LABELS[status],
      sourceRound: null,
      confirmationMethod: "officer_added",
      confirmedAt: now.toISOString(),
      riskCategory: resolution === "replace" ? target.riskCategory : null,
      excluded: false,
      replacesFactId: factId,
      supersededByFactId: null,
      resolvesGapIds: [...target.resolvesGapIds],
    });
    return toSessionState(session, now);
  }

  resetForTests(): void {
    this.sessions.clear();
  }
}

export { SESSION_IDLE_TTL_MS };
