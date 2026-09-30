import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  AddFactRequest,
  AnalysisIntakeResponse,
  AnalysisSubmissionResponse,
  AnswerGapRequest,
  ApiErrorBody,
  CreateAnalysisRequest,
  FactStatusUpdateRequest,
  GenerateReportRequest,
  LegalSourceReference,
  ReviseFactRequest,
} from "@policymate/contracts";
import { CONTRACT_VERSION } from "@policymate/contracts";
import { AnalysisInputError, AnalysisUpstreamError, type AnalysisEngine, type CaseFocusResolver } from "./engine";
import type { ConcurrencyGate } from "../security";

/**
 * 案情分析路由。
 *
 * 会话只存在于后端短暂运行内存；案情正文、事实值与报告不会写入数据库
 * 或日志。提交案情后一次请求即形成事实快照并生成报告，不再有事实确认
 * 与追问的前置阶段。能力停用时失败关闭：不在首页入口、报告页和 API
 * 三个层面之外提供任何旁路。
 */
export interface AnalysisRoutesOptions {
  engine: AnalysisEngine;
  legalSources: () => Promise<LegalSourceReference[]>;
  activeReleaseId: () => Promise<string>;
  analysisCapabilityEnabled: () => boolean;
  analysisBoundaryAvailable: () => Promise<{ available: boolean; reason: string | null }>;
  /** 把事实解析到受治理重点案情；未提供时不做重点案情法源限定。 */
  caseFocusResolver?: CaseFocusResolver;
  /** 并发闸门：同一令牌在途分析请求不得超过上限。 */
  concurrencyGate: ConcurrencyGate;
}

function errorBody(
  requestId: string,
  message: string,
  statusCode: number,
  explicitCode?: ApiErrorBody["error"]["code"],
): ApiErrorBody {
  const code: ApiErrorBody["error"]["code"] =
    explicitCode ??
    (statusCode === 503
      ? "service_unavailable"
      : statusCode === 404
        ? "not_found"
        : statusCode === 429
          ? "rate_limited"
          : statusCode === 413
            ? "request_too_large"
            : statusCode === 401
              ? "token_invalid"
              : statusCode === 403
                ? "origin_not_allowed"
                : statusCode === 400
                  ? "invalid_input"
                  : "invalid_request");
  return {
    contractVersion: CONTRACT_VERSION,
    error: { code, message, requestId },
  };
}

export async function registerAnalysisRoutes(
  app: FastifyInstance,
  options: AnalysisRoutesOptions,
): Promise<void> {
  const { engine } = options;

  const assertCapability = async (): Promise<void> => {
    if (!options.analysisCapabilityEnabled()) {
      throw new AnalysisInputError("案情分析功能已临时停用。", 503, "feature_disabled");
    }
    const boundary = await options.analysisBoundaryAvailable();
    if (!boundary.available) {
      throw new AnalysisInputError(
        boundary.reason ?? "分析服务暂不可用，请稍后再试。",
        503,
      );
    }
  };

  const handleError = async (
    error: unknown,
    requestId: string,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    if (error instanceof AnalysisInputError || error instanceof AnalysisUpstreamError) {
      return reply
        .code(error.statusCode)
        .send(errorBody(requestId, error.message, error.statusCode, error.apiCode));
    }
    throw error;
  };

  /** 同一令牌的并发在途请求；超过上限时失败关闭并提示稍后重试。 */
  const withConcurrency = async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const token = request.headers["x-pm-anonymous-token"];
    const key = typeof token === "string" && token !== "" ? token : request.ip;
    const release = options.concurrencyGate.tryAcquire(key);
    if (release === null) {
      throw new AnalysisInputError("请求并发过多，请稍后重试。", 429);
    }
    const controller = new AbortController();
    const abort = () => { controller.abort(); };
    const disconnect = () => { if (!reply.raw.writableFinished) abort(); };
    request.raw.once("aborted", abort);
    reply.raw.once("close", disconnect);
    try {
      return await action(controller.signal);
    } finally {
      request.raw.removeListener("aborted", abort);
      reply.raw.removeListener("close", disconnect);
      release();
    }
  };

  /**
   * 生成绑定当前快照的报告。迟到或版本不匹配的请求失败关闭；
   * 报告生成失败时整体失败关闭，不展示半成品。
   */
  const generateCurrentReport = async (
    sessionId: string,
    requestId: string,
    snapshot: { snapshotVersion: number; snapshotHash: string },
    signal?: AbortSignal,
  ): Promise<import("@policymate/contracts").AnalysisReport> => {
    const [legalSources, activeReleaseId] = await Promise.all([
      options.legalSources(),
      options.activeReleaseId(),
    ]);
    return engine.generateReport(
      sessionId,
      {
        contractVersion: CONTRACT_VERSION,
        requestId,
        snapshotVersion: snapshot.snapshotVersion,
        snapshotHash: snapshot.snapshotHash,
      } satisfies GenerateReportRequest,
      legalSources,
      undefined,
      activeReleaseId,
      options.caseFocusResolver,
      signal,
    );
  };

  // 提交案情：提取候选事实，按互不相关事项自动拆分为多份分析；每份分析在
  // 同一响应内形成独立事实快照与报告。
  app.post<{ Body: CreateAnalysisRequest }>(
    "/api/v1/analysis/sessions",
    async (request, reply) => {
      try {
        await assertCapability();
        const response = await withConcurrency(request, reply, async (signal): Promise<AnalysisIntakeResponse> => {
          const states = await engine.createSessions(request.body, undefined, signal);
          try {
            const analyses = await Promise.all(
              states.map(async (state) => ({
                state,
                report: await generateCurrentReport(state.sessionId, request.id, state.snapshot, signal),
              })),
            );
            return { contractVersion: CONTRACT_VERSION, analyses };
          } catch (error) {
            for (const state of states) engine.clearSession(state.sessionId);
            throw error;
          }
        });
        return reply.code(201).send(response);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 读取当前状态（页面导航时恢复）。
  app.get<{ Params: { sessionId: string } }>(
    "/api/v1/analysis/sessions/:sessionId",
    async (request, reply) => {
      try {
        return engine.getSession(request.params.sessionId);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 清除本次分析（破坏性操作；同时丢弃服务端会话）。
  app.delete<{ Params: { sessionId: string } }>(
    "/api/v1/analysis/sessions/:sessionId",
    async (request, reply) => {
      engine.clearSession(request.params.sessionId);
      return reply.code(200).send({ contractVersion: CONTRACT_VERSION, cleared: true });
    },
  );

  // 新增遗漏事实（仅在“补充或修改事实”阶段）。
  app.post<{ Params: { sessionId: string }; Body: AddFactRequest }>(
    "/api/v1/analysis/sessions/:sessionId/facts",
    async (request, reply) => {
      try {
        return engine.addFact(request.params.sessionId, request.body);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 逐项标记：确认 / 否认 / 未知 / 争议（仅在“补充或修改事实”阶段）。
  app.post<{ Params: { sessionId: string; factId: string }; Body: FactStatusUpdateRequest }>(
    "/api/v1/analysis/sessions/:sessionId/facts/:factId/status",
    async (request, reply) => {
      try {
        return engine.setFactStatus(
          request.params.sessionId,
          request.params.factId,
          request.body?.status,
        );
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 排除 / 重新纳入：删除只表示不纳入本次分析（仅在“补充或修改事实”阶段）。
  app.put<{ Params: { sessionId: string; factId: string }; Body: { excluded: boolean } }>(
    "/api/v1/analysis/sessions/:sessionId/facts/:factId/exclusion",
    async (request, reply) => {
      try {
        const excluded = request.body?.excluded;
        if (typeof excluded !== "boolean") {
          return reply
            .code(400)
            .send(errorBody(request.id, "excluded 必须为布尔值。", 400));
        }
        return engine.setFactExclusion(request.params.sessionId, request.params.factId, excluded);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 对决定性缺口回答“未知”或“待核实”：不改变事实快照，缺口仍未解决，
  // 报告据此保持分支呈现。
  app.post<{ Params: { sessionId: string; gapId: string }; Body: AnswerGapRequest }>(
    "/api/v1/analysis/sessions/:sessionId/gaps/:gapId/answer",
    async (request, reply) => {
      try {
        await assertCapability();
        const response = await withConcurrency(
          request,
          reply,
          async (signal): Promise<AnalysisSubmissionResponse> => {
            const state = engine.answerGap(
              request.params.sessionId,
              request.params.gapId,
              request.body?.answer,
            );
            const report = await generateCurrentReport(state.sessionId, request.id, state.snapshot, signal);
            return { contractVersion: CONTRACT_VERSION, state, report };
          },
        );
        return reply.code(200).send(response);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 报告生成：必须携带请求 ID 与事实快照版本，迟到/错版本请求失败关闭。
  app.post<{ Params: { sessionId: string }; Body: GenerateReportRequest }>(
    "/api/v1/analysis/sessions/:sessionId/report",
    async (request, reply) => {
      try {
        await assertCapability();
        const body = request.body;
        if (body === null || typeof body !== "object") {
          return reply.code(400).send(errorBody(request.id, "报告请求缺少快照版本。", 400));
        }
        return await withConcurrency(request, reply, (signal) =>
          generateCurrentReport(request.params.sessionId, body.requestId ?? request.id, body, signal),
        );
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 确认待应用的事实修改：形成新的事实快照，并直接返回绑定该快照的新报告。
  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/analysis/sessions/:sessionId/snapshot",
    async (request, reply) => {
      try {
        await assertCapability();
        const response = await withConcurrency(request, reply, async (signal): Promise<AnalysisSubmissionResponse> => {
          const state = engine.confirmSnapshot(request.params.sessionId);
          const report = await generateCurrentReport(state.sessionId, request.id, state.snapshot, signal);
          return { contractVersion: CONTRACT_VERSION, state, report };
        });
        return reply.code(200).send(response);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 从报告进入补充或修改事实：创建待确认修改，旧报告仍可见。
  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/analysis/sessions/:sessionId/modifications",
    async (request, reply) => {
      try {
        await assertCapability();
        return engine.beginModification(request.params.sessionId);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 放弃尚未确认的修改：恢复进入修改前的事实与快照。
  app.delete<{ Params: { sessionId: string } }>(
    "/api/v1/analysis/sessions/:sessionId/modifications",
    async (request, reply) => {
      try {
        return engine.discardModification(request.params.sessionId);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 创建替代事实项：替代旧版本，或把两个版本都记录为争议事实。
  app.post<{ Params: { sessionId: string; factId: string }; Body: ReviseFactRequest }>(
    "/api/v1/analysis/sessions/:sessionId/facts/:factId/revision",
    async (request, reply) => {
      try {
        await assertCapability();
        return engine.reviseFact(request.params.sessionId, request.params.factId, request.body);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );
}
