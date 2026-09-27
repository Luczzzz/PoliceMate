import { randomUUID } from "node:crypto";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import {
  CONTRACT_VERSION,
  type ApiErrorBody,
  type ContentStatus,
  type DataUseResponse,
  type DocumentExampleDetailResponse,
  type DocumentExampleListResponse,
  type FixtureControlRequest,
  type FixtureControlResponse,
  type HealthResponse,
  type ProductShellResponse,
} from "@policymate/contracts";
import { buildProductShell, isDocumentRetrievalEnabled, loadCapabilityInputs } from "./capabilities";
import type { AppConfig } from "./config";
import { buildDataUseResponse } from "./data-use";
import { buildFacets } from "./content/gating";
import { AnalysisEngine } from "./analysis/engine";
import { registerAnalysisRoutes } from "./analysis/routes";
import type { FixtureControls, FixturePatch } from "./providers/fixture";

export interface BuildAppDeps {
  config: AppConfig;
  fixtures: FixtureControls;
  /** 测试可以注入固定引擎以控制会话状态；默认使用共享引擎。 */
  analysisEngine?: AnalysisEngine;
}

const CONTRACT_HEADER = "x-pm-contract-version";

/** 健康检查与测试控制接口不参与产品契约校验。 */
const CONTRACT_EXEMPT_PREFIXES = ["/api/v1/health", "/api/test/"];

function errorBody(
  requestId: string,
  code: ApiErrorBody["error"]["code"],
  message: string,
): ApiErrorBody {
  return { contractVersion: CONTRACT_VERSION, error: { code, message, requestId } };
}

const CONTENT_STATUSES = ["draft", "pending_verification", "trial", "withdrawn"] as const;
const LEGAL_SOURCE_STATUSES = ["current", "future", "superseded", "repealed", "uncertain"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readContentStatus(value: unknown): ContentStatus | null {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value)
    ? (value as ContentStatus)
    : null;
}

function readFixturePatch(body: unknown): FixturePatch | null {
  if (!isRecord(body)) return null;
  const candidate = body as FixtureControlRequest;
  const patch: FixturePatch = {};

  if ("difyAvailable" in candidate) {
    if (typeof candidate.difyAvailable !== "boolean") return null;
    patch.difyAvailable = candidate.difyAvailable;
  }

  if ("exampleStatusAll" in candidate) {
    const status = readContentStatus(candidate.exampleStatusAll);
    if (status === null) return null;
    patch.exampleStatusAll = status;
  }

  if ("exampleStatus" in candidate) {
    const value = candidate.exampleStatus;
    if (!isRecord(value) || typeof value.exampleId !== "string" || value.exampleId === "") {
      return null;
    }
    const status = readContentStatus(value.status);
    if (status === null) return null;
    patch.exampleStatus = { exampleId: value.exampleId, status };
  }

  if ("legalSourceStatusAll" in candidate) {
    const value = candidate.legalSourceStatusAll;
    if (
      typeof value !== "string" ||
      !(LEGAL_SOURCE_STATUSES as readonly string[]).includes(value)
    ) {
      return null;
    }
    patch.legalSourceStatusAll = value as NonNullable<FixturePatch["legalSourceStatusAll"]>;
  }

  if ("examplesExpired" in candidate) {
    if (typeof candidate.examplesExpired !== "boolean") return null;
    patch.examplesExpired = candidate.examplesExpired;
  }

  return patch;
}

/**
 * 构建 PoliceMate 后端。该函数不负责监听端口，便于测试直接使用 `inject`。
 */
export async function buildApp({ config, fixtures, analysisEngine }: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (CONTRACT_EXEMPT_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

    const requested = request.headers[CONTRACT_HEADER];
    if (typeof requested !== "string" || requested.trim() === "") {
      await reply
        .code(400)
        .send(
          errorBody(request.id, "invalid_request", `缺少契约版本请求头 ${CONTRACT_HEADER}。`),
        );
      return;
    }
    if (requested !== CONTRACT_VERSION) {
      await reply
        .code(409)
        .send(
          errorBody(
            request.id,
            "contract_incompatible",
            `契约版本不兼容（客户端 ${requested}，服务端 ${CONTRACT_VERSION}），请刷新或更新页面。`,
          ),
        );
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-robots-tag", "noindex, nofollow, noarchive");
    if (request.url.startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  app.get("/api/v1/health", async (): Promise<HealthResponse> => {
    return { contractVersion: CONTRACT_VERSION, status: "ok", providerMode: config.providerMode };
  });

  app.get("/api/v1/shell", async (): Promise<ProductShellResponse> => {
    const inputs = await loadCapabilityInputs(
      {
        masterSwitch: config.masterSwitch,
        analysisEnabled: config.analysisEnabled,
        documentsEnabled: config.documentsEnabled,
      },
      fixtures,
    );
    return buildProductShell(inputs, CONTRACT_VERSION);
  });

  app.get("/api/v1/data-use", async (): Promise<DataUseResponse> => {
    return buildDataUseResponse(config.service, CONTRACT_VERSION);
  });

  // 文书范例检索与打开都重新执行当前状态门控；响应禁止缓存。
  // 总开关或文书入口停用时，检索与旧链接一律阻断（失败关闭），
  // 不能只靠首页入口卡片降级。
  const documentsRetrievalEnabled = isDocumentRetrievalEnabled(config);

  app.get("/api/v1/document-examples", async (): Promise<DocumentExampleListResponse> => {
    const index = await fixtures.content.listExamples();
    const items = documentsRetrievalEnabled ? index.items : [];
    const facets = documentsRetrievalEnabled ? index.facets : buildFacets([]);
    return {
      contractVersion: CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      releaseId: documentsRetrievalEnabled ? index.releaseId : "",
      notice: index.notice,
      stages: index.stages,
      items,
      facets,
    };
  });

  app.get<{ Params: { exampleId: string } }>(
    "/api/v1/document-examples/:exampleId",
    async (request, reply) => {
      const lookup = documentsRetrievalEnabled
        ? await fixtures.content.getExample(request.params.exampleId)
        : ({ outcome: "unavailable" } as const);
      if (lookup.outcome === "not_found") {
        return reply.code(404).send(errorBody(request.id, "not_found", "未找到该文书范例。"));
      }
      if (lookup.outcome === "unavailable") {
        return reply
          .code(410)
          .send(
            errorBody(
              request.id,
              "content_unavailable",
              "当前内容已经失效，无法继续查看正文，请返回文书范例列表重新选择。",
            ),
          );
      }
      const response: DocumentExampleDetailResponse = {
        contractVersion: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        releaseId: lookup.releaseId,
        notice: lookup.notice,
        example: lookup.example,
      };
      return response;
    },
  );

  if (config.enableTestControls) {
    app.post<{ Body: FixtureControlRequest }>("/api/test/fixtures", async (request, reply) => {
      const patch = readFixturePatch(request.body);
      if (patch === null) {
        return reply
          .code(400)
          .send(errorBody(request.id, "invalid_request", "替身控制参数无效。"));
      }
      const state: FixtureControlResponse = { ...fixtures.updateState(patch) };
      return state;
    });

    app.post("/api/test/fixtures/reset", async (): Promise<FixtureControlResponse> => {
      return { ...fixtures.reset() };
    });
  }

  // 案情分析：会话存于短暂运行内存；能力停用或边界不可用时失败关闭。
  const analysisEngineResolved = analysisEngine ?? new AnalysisEngine(fixtures.analysis);
  await registerAnalysisRoutes(app, {
    engine: analysisEngineResolved,
    analysisCapabilityEnabled: () => config.masterSwitch && config.analysisEnabled,
    analysisBoundaryAvailable: async () => fixtures.dify.getAvailability(),
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    const message =
      status === 500 ? "服务暂时不可用，请稍后重试。" : (error.message ?? "请求无法处理。");
    await reply.code(status).send(errorBody(request.id, status === 500 ? "internal_error" : "invalid_request", message));
  });

  const staticDir = config.staticDir;
  if (staticDir !== null) {
    await app.register(fastifyStatic, { root: staticDir });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send(errorBody(request.id, "not_found", "接口不存在。"));
    }
    if (staticDir !== null) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).type("text/plain; charset=utf-8").send("未找到页面。");
  });

  return app;
}
