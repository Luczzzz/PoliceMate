import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CONTRACT_VERSION } from "@policymate/contracts";
import type { ApiErrorBody } from "@policymate/contracts";
import { AnalysisInputError, AnalysisUpstreamError } from "../analysis/engine";
import type { ConcurrencyGate } from "../security";
import type { AccidentLiabilityEngine } from "./engine";

/**
 * 交通事故责任认定辅助路由。
 *
 * 会话只存在于后端短暂运行内存；事故概况、追问回答与报告正文都不写入数据库、
 * 日志或第三方分析工具。能力停用或边界不可用时失败关闭为 503。
 */
export interface AccidentLiabilityRoutesOptions {
  engine: AccidentLiabilityEngine;
  legalSources: () => Promise<import("@policymate/contracts").LegalSourceReference[]>;
  capabilityEnabled: () => boolean;
  boundaryAvailable: () => Promise<{ available: boolean; reason: string | null }>;
  concurrencyGate: ConcurrencyGate;
  /** 新建事故问答会话成功后累加一次匿名使用计数。 */
  onUse?: () => void;
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

export async function registerAccidentLiabilityRoutes(
  app: FastifyInstance,
  options: AccidentLiabilityRoutesOptions,
): Promise<void> {
  const { engine } = options;

  const assertCapability = async (): Promise<void> => {
    if (!options.capabilityEnabled()) {
      throw new AnalysisInputError("交通事故责任认定功能已临时停用。", 503, "feature_disabled");
    }
    const boundary = await options.boundaryAvailable();
    if (!boundary.available) {
      throw new AnalysisInputError(boundary.reason ?? "分析服务暂不可用，请稍后再试。", 503);
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
    const abort = () => {
      controller.abort();
    };
    const disconnect = () => {
      if (!reply.raw.writableFinished) abort();
    };
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

  // 新建会话：提交事故概况，返回模型的第一轮追问或直接给出的报告。
  app.post<{ Body: { caseText?: unknown } }>(
    "/api/v1/accident-liability/sessions",
    async (request, reply) => {
      try {
        await assertCapability();
        const state = await withConcurrency(request, reply, async (signal) => {
          const legalSources = await options.legalSources();
          const created = await engine.createSession(request.body?.caseText, legalSources, signal);
          options.onUse?.();
          return created;
        });
        return reply.code(201).send(state);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 清除本次问答（破坏性操作；同时丢弃服务端会话）。
  app.delete<{ Params: { sessionId: string } }>(
    "/api/v1/accident-liability/sessions/:sessionId",
    async (request, reply) => {
      engine.clearSession(request.params.sessionId);
      return reply.code(200).send({ contractVersion: CONTRACT_VERSION, cleared: true });
    },
  );

  // 追加一轮民警回答，返回下一轮追问或报告。
  app.post<{ Params: { sessionId: string }; Body: { answer?: unknown } }>(
    "/api/v1/accident-liability/sessions/:sessionId/answers",
    async (request, reply) => {
      try {
        await assertCapability();
        const state = await withConcurrency(request, reply, async (signal) => {
          const legalSources = await options.legalSources();
          return engine.answer(request.params.sessionId, request.body?.answer, legalSources, signal);
        });
        return reply.code(200).send(state);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );

  // 民警主动要求：即使模型认为信息不足，本次也直接产出研判报告。
  app.post<{ Params: { sessionId: string } }>(
    "/api/v1/accident-liability/sessions/:sessionId/report",
    async (request, reply) => {
      try {
        await assertCapability();
        const state = await withConcurrency(request, reply, async (signal) => {
          const legalSources = await options.legalSources();
          return engine.requestReport(request.params.sessionId, legalSources, signal);
        });
        return reply.code(200).send(state);
      } catch (error) {
        return handleError(error, request.id, reply);
      }
    },
  );
}
